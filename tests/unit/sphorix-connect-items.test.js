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
  decodeTransferItemsCursor: (value) => {
    try {
      const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      return ['invoices', 'third_parties'].includes(cursor.object_type)
        && Number.isInteger(cursor.record_number)
        && cursor.record_number > 0 ? cursor : null;
    } catch {
      return null;
    }
  },
  encodeTransferItemsCursor: (item) => Buffer.from(JSON.stringify({
    object_type: item.object_type,
    record_number: item.record_number,
  })).toString('base64url'),
  isUuid: (value) => typeof value === 'string' && value.length > 0,
  methodNotAllowed: vi.fn(),
  sendApiError: (response, error) => response.status(error.status || 500).json({
    error: { code: error.code, message: error.message },
  }),
}));

import handler from '../../api/v1/transfers/[transfer_id]/items.js';

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

function createAdminClient(rows) {
  const transferQuery = {
    select: vi.fn(() => transferQuery),
    eq: vi.fn(() => transferQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }),
  };
  const itemsQuery = {
    select: vi.fn(() => itemsQuery),
    eq: vi.fn(() => itemsQuery),
    in: vi.fn(() => itemsQuery),
    order: vi.fn(() => itemsQuery),
    or: vi.fn(() => itemsQuery),
    limit: vi.fn(() => itemsQuery),
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return {
    client: {
      from: vi.fn((table) => table === 'integration_runs' ? transferQuery : itemsQuery),
    },
    itemsQuery,
  };
}

describe('pagination des erreurs Sphorix Connect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renvoie un curseur stable et borne la taille de page', async () => {
    const rows = [
      { object_type: 'invoices', record_number: 1 },
      { object_type: 'invoices', record_number: 2 },
      { object_type: 'invoices', record_number: 3 },
    ];
    const { client, itemsQuery } = createAdminClient(rows);
    authorizeCompanyMock.mockResolvedValue({ companyId: 'company-1', adminClient: client });
    const response = createResponse();

    await handler({
      method: 'GET',
      query: { transfer_id: 'run-1', company_id: 'company-1', limit: '2' },
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.items).toEqual(rows.slice(0, 2));
    expect(response.body.next_cursor).toBe(Buffer.from(JSON.stringify({
      object_type: 'invoices',
      record_number: 2,
    })).toString('base64url'));
    expect(itemsQuery.limit).toHaveBeenCalledWith(3);
    expect(itemsQuery.eq).toHaveBeenCalledWith('company_id', 'company-1');
  });

  it('applique le curseur de reprise et n en renvoie pas a la derniere page', async () => {
    const row = { object_type: 'third_parties', record_number: 7 };
    const { client, itemsQuery } = createAdminClient([row]);
    authorizeCompanyMock.mockResolvedValue({ companyId: 'company-1', adminClient: client });
    const cursor = Buffer.from(JSON.stringify({ object_type: 'invoices', record_number: 25 })).toString('base64url');
    const response = createResponse();

    await handler({
      method: 'GET',
      query: { transfer_id: 'run-1', company_id: 'company-1', cursor },
    }, response);

    expect(response.body.items).toEqual([row]);
    expect(response.body.next_cursor).toBeNull();
    expect(itemsQuery.or).toHaveBeenCalledWith(
      'object_type.gt.invoices,and(object_type.eq.invoices,record_number.gt.25)',
    );
  });

  it('refuse un curseur invalide sans interroger les erreurs', async () => {
    const { client, itemsQuery } = createAdminClient([]);
    authorizeCompanyMock.mockResolvedValue({ companyId: 'company-1', adminClient: client });
    const response = createResponse();

    await handler({
      method: 'GET',
      query: { transfer_id: 'run-1', company_id: 'company-1', cursor: 'invalid' },
    }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
    expect(itemsQuery.limit).not.toHaveBeenCalled();
  });
});