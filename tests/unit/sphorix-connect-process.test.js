import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeCompanyMock } = vi.hoisted(() => ({ authorizeCompanyMock: vi.fn() }));

vi.mock('../../api/v1/_lib/sphorix-connect.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  authorizeCompany: authorizeCompanyMock,
  isUuid: (value) => typeof value === 'string' && value.length > 0,
  methodNotAllowed: vi.fn(),
  sendApiError: (response, error) => response.status(error.status || 500).json({
    error: { code: error.code, message: error.message },
  }),
}));

import handler from '../../api/v1/transfers/[transfer_id]/process.js';

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    update: vi.fn(() => query),
  };
  return query;
}

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

describe('traitement des reprises Sphorix Connect', () => {
  beforeEach(() => {
    authorizeCompanyMock.mockReset();
  });

  it('traite le sous-ensemble en echec sans le comparer au volume du fichier source', async () => {
    const run = {
      id: 'run-1',
      company_id: 'company-1',
      connection_id: 'connection-1',
      preview_id: 'preview-1',
      parent_run_id: 'parent-run-1',
      status: 'queued',
      total_count: 2,
      read_count: 0,
      written_count: 0,
      ignored_count: 0,
      failed_count: 0,
    };
    const preview = { id: 'preview-1', object_type: 'invoices', total_count: 1000 };
    const stagedItems = [
      { record_number: 3, source_record: { invoice_number: 'INV-3' }, status: 'valid', validation_errors: [] },
      { record_number: 7, source_record: { invoice_number: 'INV-7' }, status: 'valid', validation_errors: [] },
    ];
    const queries = {
      integration_runs: [createQuery({ data: run, error: null })],
      integration_previews: [createQuery({ data: preview, error: null })],
      integration_preview_items: [createQuery({ data: stagedItems, error: null })],
      integration_run_scopes: [createQuery({ data: null, error: null })],
    };
    const adminClient = {
      from: vi.fn((table) => queries[table].shift()),
      rpc: vi.fn(async (procedure) => {
        if (procedure === 'claim_integration_run_scope') {
          return {
            data: {
              next_record_number: 1,
              total_count: 2,
              checkpoint: { retry_record_numbers: [3, 7] },
              lease_token: 'lease-1',
            },
            error: null,
          };
        }
        if (procedure === 'apply_integration_batch') return { data: 2, error: null };
        if (procedure === 'complete_integration_run_batch') {
          return {
            data: { status: 'succeeded', read_count: 2, written_count: 2, ignored_count: 0, failed_count: 0 },
            error: null,
          };
        }
        throw new Error(`Unexpected RPC: ${procedure}`);
      }),
    };
    authorizeCompanyMock.mockResolvedValue({
      companyId: 'company-1',
      user: { id: 'user-1' },
      adminClient,
    });

    const response = createResponse();
    await handler({
      method: 'POST',
      query: { transfer_id: 'run-1' },
      body: { company_id: 'company-1' },
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      transfer: { id: 'run-1', status: 'succeeded', total_count: 2 },
      has_more: false,
    });
    expect(adminClient.rpc).toHaveBeenCalledWith('apply_integration_batch', expect.objectContaining({
      target_records: stagedItems.map((item) => expect.objectContaining({ record_number: item.record_number })),
    }));
  });
});