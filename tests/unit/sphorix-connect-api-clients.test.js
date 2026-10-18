import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeCompanyMock, createApiKeyMock } = vi.hoisted(() => ({
  authorizeCompanyMock: vi.fn(),
  createApiKeyMock: vi.fn(),
}));

vi.mock('../../api/v1/_lib/sphorix-connect.js', () => ({
  API_SCOPES: [
    'connections:read', 'connections:write', 'transfers:read', 'transfers:write',
    'transfers:process', 'transfers:retry', 'uploads:write',
  ],
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  authorizeCompany: authorizeCompanyMock,
  createApiKey: createApiKeyMock,
  isUuid: (value) => typeof value === 'string' && value.length > 0,
  methodNotAllowed: vi.fn(),
  sendApiError: (response, error) => response.status(error.status || 500).json({
    error: { code: error.code, message: error.message },
  }),
}));

import handler from '../../api/v1/api-clients.js';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('gestion des cles API Sphorix Connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeCompanyMock.mockResolvedValue({
      companyId: 'company-1',
      user: { id: 'user-1' },
      adminClient: { from: vi.fn() },
    });
  });

  it('ne retourne la cle brute qu a la creation et ne stocke que son empreinte', async () => {
    const storedClient = {
      id: 'client-1',
      name: 'Comptabilite externe',
      key_prefix: 'spx_live_12345678',
      scopes: ['transfers:read'],
      expires_at: '2026-12-31T00:00:00.000Z',
      revoked_at: null,
      created_at: '2026-10-18T00:00:00.000Z',
    };
    const query = {
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: storedClient, error: null }),
    };
    query.select.mockReturnValue(query);
    const adminClient = { from: vi.fn(() => ({
      insert: vi.fn(() => query),
    })) };
    authorizeCompanyMock.mockResolvedValue({ companyId: 'company-1', user: { id: 'user-1' }, adminClient });
    createApiKeyMock.mockReturnValue({
      token: 'spx_live_once-only-secret',
      tokenHash: 'a'.repeat(64),
      keyPrefix: 'spx_live_12345678',
    });

    const response = createResponse();
    await handler({
      method: 'POST',
      body: { company_id: 'company-1', name: 'Comptabilite externe', scopes: ['transfers:read'] },
    }, response);

    expect(response.statusCode).toBe(201);
    expect(response.body.token).toBe('spx_live_once-only-secret');
    expect(JSON.stringify(response.body.api_client)).not.toContain('token');
    expect(adminClient.from).toHaveBeenCalledWith('integration_api_clients');
    expect(authorizeCompanyMock).toHaveBeenCalledWith(
      expect.anything(),
      'company-1',
      ['owner', 'admin'],
      { userOnly: true },
    );
  });

  it('rejette les scopes inconnus avant toute insertion', async () => {
    const insert = vi.fn();
    const adminClient = { from: vi.fn(() => ({ insert })) };
    authorizeCompanyMock.mockResolvedValue({ companyId: 'company-1', user: { id: 'user-1' }, adminClient });

    const response = createResponse();
    await handler({
      method: 'POST',
      body: { company_id: 'company-1', name: 'Client', scopes: ['service_role'] },
    }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe('INVALID_API_CLIENT_SCOPES');
    expect(insert).not.toHaveBeenCalled();
  });
});