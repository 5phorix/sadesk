import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import {
  authorizeCompany,
  createApiKey,
  getBearerToken,
  isUuid,
} from '../../api/v1/_lib/sphorix-connect.js';

describe('authentification Sphorix Connect', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  });

  it('extrait un jeton Bearer sans tenir compte de la casse du schema', () => {
    expect(getBearerToken({ headers: { authorization: 'bEaReR access-token' } })).toBe('access-token');
  });

  it('rejette les en-tetes d authentification incomplets', () => {
    expect(getBearerToken({ headers: {} })).toBeNull();
    expect(getBearerToken({ headers: { authorization: 'Basic token' } })).toBeNull();
  });

  it('valide le format des identifiants de societe', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('company-a')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('genere une cle API dont seule l empreinte doit etre stockee', () => {
    const { token, tokenHash, keyPrefix } = createApiKey();

    expect(token).toMatch(/^spx_live_[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
    expect(token.startsWith(keyPrefix)).toBe(true);
  });

  it('derive l acces a la societe du membre et refuse un role insuffisant', async () => {
    const authClient = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) } };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'viewer' }, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const adminClient = { from: vi.fn().mockReturnValue(query) };
    createClientMock.mockReturnValueOnce(authClient).mockReturnValueOnce(adminClient);

    await expect(authorizeCompany(
      { headers: { authorization: 'Bearer token' } },
      '123e4567-e89b-12d3-a456-426614174000',
      ['owner', 'admin'],
    )).rejects.toMatchObject({ status: 403, code: 'INSUFFICIENT_ROLE' });

    expect(query.eq).toHaveBeenCalledWith('company_id', '123e4567-e89b-12d3-a456-426614174000');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it('autorise une cle API uniquement selon son scope et le role actif de son createur', async () => {
    const apiKeyQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'api-client-1',
          created_by: 'user-1',
          scopes: ['transfers:read'],
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          revoked_at: null,
        },
        error: null,
      }),
    };
    apiKeyQuery.select.mockReturnValue(apiKeyQuery);
    apiKeyQuery.eq.mockReturnValue(apiKeyQuery);
    const membershipQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'accountant' }, error: null }),
    };
    membershipQuery.select.mockReturnValue(membershipQuery);
    membershipQuery.eq.mockReturnValue(membershipQuery);
    const adminClient = {
      from: vi.fn((table) => table === 'integration_api_clients' ? apiKeyQuery : membershipQuery),
    };
    const authClient = { auth: { getUser: vi.fn() } };
    createClientMock.mockReturnValueOnce(authClient).mockReturnValueOnce(adminClient);

    const context = await authorizeCompany(
      { headers: { authorization: 'Bearer spx_live_test-key' } },
      '123e4567-e89b-12d3-a456-426614174000',
      ['owner', 'admin', 'accountant'],
      { scope: 'transfers:read' },
    );

    expect(context).toMatchObject({
      companyId: '123e4567-e89b-12d3-a456-426614174000',
      role: 'accountant',
      user: { id: 'user-1' },
      apiClient: { id: 'api-client-1' },
    });
    expect(apiKeyQuery.eq).toHaveBeenCalledWith('company_id', '123e4567-e89b-12d3-a456-426614174000');
    expect(membershipQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(authClient.auth.getUser).not.toHaveBeenCalled();
  });

  it('refuse une cle API dont le scope ne correspond pas a la route', async () => {
    const apiKeyQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'api-client-1',
          created_by: 'user-1',
          scopes: ['transfers:read'],
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          revoked_at: null,
        },
        error: null,
      }),
    };
    apiKeyQuery.select.mockReturnValue(apiKeyQuery);
    apiKeyQuery.eq.mockReturnValue(apiKeyQuery);
    const adminClient = { from: vi.fn().mockReturnValue(apiKeyQuery) };
    createClientMock.mockReturnValueOnce({ auth: { getUser: vi.fn() } }).mockReturnValueOnce(adminClient);

    await expect(authorizeCompany(
      { headers: { authorization: 'Bearer spx_live_test-key' } },
      '123e4567-e89b-12d3-a456-426614174000',
      ['owner', 'admin', 'accountant'],
      { scope: 'transfers:write' },
    )).rejects.toMatchObject({ status: 403, code: 'INSUFFICIENT_API_SCOPE' });
  });

  it('refuse les cles API sur les routes de gestion des cles', async () => {
    const createClientSpy = vi.fn();
    createClientMock.mockImplementation(createClientSpy);

    await expect(authorizeCompany(
      { headers: { authorization: 'Bearer spx_live_test-key' } },
      '123e4567-e89b-12d3-a456-426614174000',
      ['owner', 'admin'],
      { userOnly: true },
    )).rejects.toMatchObject({ status: 401, code: 'USER_SESSION_REQUIRED' });
    expect(createClientSpy).not.toHaveBeenCalled();
  });
});