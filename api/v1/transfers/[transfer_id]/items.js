import {
  ApiError,
  authorizeCompany,
  decodeTransferItemsCursor,
  encodeTransferItemsCursor,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from '../../_lib/sphorix-connect.js';

const READ_ROLES = ['owner', 'admin', 'accountant', 'viewer'];
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);

  try {
    const transferId = request.query?.transfer_id;
    if (!isUuid(transferId)) throw new ApiError(400, 'INVALID_TRANSFER_ID', 'Identifiant d execution invalide.');

    const context = await authorizeCompany(
      request,
      request.query?.company_id,
      READ_ROLES,
      { scope: 'transfers:read' },
    );
    const { data: transfer, error: transferError } = await context.adminClient
      .from('integration_runs')
      .select('id')
      .eq('id', transferId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (transferError) throw transferError;
    if (!transfer) throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Execution introuvable.');

    const rawLimit = request.query?.limit;
    const limit = rawLimit === undefined ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new ApiError(400, 'INVALID_PAGE_SIZE', 'limit doit etre compris entre 1 et 100.');
    }

    const rawCursor = request.query?.cursor;
    const cursor = rawCursor ? decodeTransferItemsCursor(rawCursor) : null;
    if (rawCursor && !cursor) throw new ApiError(400, 'INVALID_CURSOR', 'Le curseur de pagination est invalide.');

    let itemsQuery = context.adminClient
      .from('integration_run_items')
      .select('object_type, record_number, external_id, status, error_code, error_details, created_at')
      .eq('run_id', transfer.id)
      .eq('company_id', context.companyId)
      .in('status', ['failed', 'unmapped'])
      .order('object_type', { ascending: true })
      .order('record_number', { ascending: true });
    if (cursor) {
      itemsQuery = itemsQuery.or(
        `object_type.gt.${cursor.object_type},and(object_type.eq.${cursor.object_type},record_number.gt.${cursor.record_number})`,
      );
    }

    const { data, error } = await itemsQuery.limit(limit + 1);
    if (error) throw error;

    const items = data || [];
    const pageItems = items.slice(0, limit);
    const nextCursor = items.length > limit
      ? encodeTransferItemsCursor(pageItems[pageItems.length - 1])
      : null;

    return response.status(200).json({ items: pageItems, next_cursor: nextCursor });
  } catch (error) {
    return sendApiError(response, error);
  }
}