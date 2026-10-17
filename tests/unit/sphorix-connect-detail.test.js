import { describe, expect, it, vi } from 'vitest';

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

import handler from '../../api/v1/transfers/[transfer_id].js';

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
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

describe('detail des transferts Sphorix Connect', () => {
  it('ne charge que les erreurs du transfert dans la société autorisée', async () => {
    const itemsQuery = createQuery({ data: [{ status: 'failed', error_code: 'INVALID_AMOUNT' }], error: null });
    const adminClient = {
      from: vi.fn((table) => {
        if (table === 'integration_runs') return createQuery({ data: { id: 'run-1', failed_count: 1 }, error: null });
        if (table === 'integration_run_scopes') return createQuery({ data: [], error: null });
        if (table === 'integration_run_items') return itemsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    authorizeCompanyMock.mockResolvedValue({ companyId: 'company-1', adminClient });

    const response = createResponse();
    await handler({
      method: 'GET',
      query: { transfer_id: 'run-1', company_id: 'company-1' },
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.items).toEqual([{ status: 'failed', error_code: 'INVALID_AMOUNT' }]);
    expect(itemsQuery.eq).toHaveBeenCalledWith('company_id', 'company-1');
    expect(itemsQuery.in).toHaveBeenCalledWith('status', ['failed', 'unmapped']);
    expect(itemsQuery.limit).toHaveBeenCalledWith(100);
  });
});