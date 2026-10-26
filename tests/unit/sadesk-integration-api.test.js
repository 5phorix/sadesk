import { describe, expect, it, vi } from 'vitest';

const { authorizeMock, hashRequestMock, validSourceSystemMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  hashRequestMock: vi.fn(() => 'a'.repeat(64)),
  validSourceSystemMock: vi.fn(() => true),
}));

vi.mock('../../api/v1/_lib/sadesk-integration.js', () => ({
  authorizeSadeskIntegration: authorizeMock,
  hashRequest: hashRequestMock,
  isValidSourceSystem: validSourceSystemMock,
  sendIntegrationError: (response, error) => response.status(error.status || 500).json({
    error: { code: error.code, message: error.message },
  }),
}));

vi.mock('../../api/v1/_lib/sphorix-connect.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  methodNotAllowed: vi.fn(),
}));

import handler from '../../api/v1/integration/import-batches.js';

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

function createContext({ existingBatch = null, processResult = null } = {}) {
  const selected = {
    eq: vi.fn(() => selected),
    in: vi.fn(() => selected),
    maybeSingle: vi.fn().mockResolvedValue({ data: existingBatch, error: null }),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'batch-1',
        request_hash: 'a'.repeat(64),
        status: 'accepted',
      },
      error: null,
    }),
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  const inserted = { select: vi.fn(() => selected) };
  const adminClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => selected),
      insert: vi.fn(() => inserted),
    })),
    rpc: vi.fn().mockResolvedValue({ data: processResult || {
      id: 'batch-1',
      status: 'succeeded',
      total_count: 1,
      created_count: 1,
      ignored_count: 0,
      rejected_count: 0,
    }, error: null }),
  };
  return { companyId: 'company-1', user: { id: 'api-owner' }, adminClient };
}

describe('API publique Sadesk pour Connect', () => {
  it('dérive la société du credential puis traite un lot idempotent', async () => {
    const context = createContext();
    authorizeMock.mockResolvedValue(context);
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { 'idempotency-key': 'connect-batch-0001' },
      body: {
        source_system: 'sphorix-connect',
        source_connection: 'connection-1',
        records: [{ object_type: 'third_parties', external_id: 'party-1', payload: { name: 'Fournisseur', role: 'supplier' } }],
      },
    }, response);

    expect(authorizeMock).toHaveBeenCalledWith(expect.anything(), 'imports:write');
    expect(response.statusCode).toBe(201);
    expect(context.adminClient.from).toHaveBeenCalledWith('sadesk_import_batches');
    expect(context.adminClient.rpc).toHaveBeenCalledWith('process_sadesk_import_batch', {
      target_batch_id: 'batch-1',
      target_records: [{ object_type: 'third_parties', external_id: 'party-1', payload: { name: 'Fournisseur', role: 'supplier' } }],
    });
  });

  it('returns the stored result for an identical idempotent replay without processing twice', async () => {
    const existingBatch = {
      id: 'batch-1',
      request_hash: 'a'.repeat(64),
      status: 'succeeded',
      created_count: 1,
    };
    const context = createContext({ existingBatch });
    authorizeMock.mockResolvedValue(context);
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { 'idempotency-key': 'connect-batch-0001' },
      body: {
        source_system: 'sphorix-connect',
        source_connection: 'connection-1',
        records: [{ object_type: 'third_parties', external_id: 'party-1', payload: { name: 'Fournisseur', role: 'supplier' } }],
      },
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.resumed).toBe(true);
    expect(context.adminClient.rpc).not.toHaveBeenCalled();
  });

  it('refuse une cle d idempotence reutilisee avec un payload different', async () => {
    hashRequestMock.mockReturnValueOnce('b'.repeat(64));
    const context = createContext({
      existingBatch: {
        id: 'batch-1',
        request_hash: 'a'.repeat(64),
        status: 'succeeded',
      },
    });
    authorizeMock.mockResolvedValue(context);
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { 'idempotency-key': 'connect-batch-0001' },
      body: {
        source_system: 'sphorix-connect',
        source_connection: 'connection-1',
        records: [{ object_type: 'third_parties', external_id: 'party-2', payload: { name: 'Client', role: 'customer' } }],
      },
    }, response);

    expect(response.statusCode).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejette un lot hors limites avant toute ecriture', async () => {
    const context = createContext();
    authorizeMock.mockResolvedValue(context);
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { 'idempotency-key': 'connect-batch-0001' },
      body: {
        source_system: 'sphorix-connect',
        source_connection: 'connection-1',
        records: [],
      },
    }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe('INVALID_BATCH_SIZE');
    expect(context.adminClient.from).not.toHaveBeenCalled();
  });

  it('refuse une facture dont le tiers externe n est pas present', async () => {
    const context = createContext();
    authorizeMock.mockResolvedValue(context);
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { 'idempotency-key': 'connect-batch-0001' },
      body: {
        source_system: 'sphorix-connect',
        source_connection: 'connection-1',
        records: [{
          object_type: 'invoices',
          external_id: 'invoice-1',
          payload: { counterparty: { external_id: 'missing-party' } },
        }],
      },
    }, response);

    expect(response.statusCode).toBe(409);
    expect(response.body.error.code).toBe('COUNTERPARTY_NOT_IMPORTED');
    expect(context.adminClient.rpc).not.toHaveBeenCalled();
  });
});
