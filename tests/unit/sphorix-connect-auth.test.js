import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import {
  authorizeCompany,
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
});