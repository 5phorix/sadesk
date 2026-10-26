import {
  ApiError,
  isUuid,
  methodNotAllowed,
} from '../../../_lib/sphorix-connect.js';
import {
  authorizeSadeskIntegration,
  sendIntegrationError,
} from '../../../_lib/sadesk-integration.js';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

function decodeCursor(value) {
  try {
    const cursor = Number(Buffer.from(value, 'base64url').toString('utf8'));
    return Number.isInteger(cursor) && cursor > 0 ? cursor : null;
  } catch {
    return null;
  }
}

function encodeCursor(recordNumber) {
  return Buffer.from(String(recordNumber)).toString('base64url');
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);

  try {
    const batchId = request.query?.batch_id;
    if (!isUuid(batchId)) throw new ApiError(400, 'INVALID_BATCH_ID', 'Identifiant de lot invalide.');
    const context = await authorizeSadeskIntegration(request, 'imports:read');
    const { data: batch, error: batchError } = await context.adminClient
      .from('sadesk_import_batches')
      .select('id')
      .eq('id', batchId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) throw new ApiError(404, 'BATCH_NOT_FOUND', 'Lot introuvable.');

    const rawLimit = request.query?.limit;
    const limit = rawLimit === undefined ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new ApiError(400, 'INVALID_PAGE_SIZE', 'limit doit etre compris entre 1 et 100.');
    }

    const rawCursor = request.query?.cursor;
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && !cursor) throw new ApiError(400, 'INVALID_CURSOR', 'Le curseur de pagination est invalide.');

    let query = context.adminClient
      .from('sadesk_import_batch_items')
      .select('object_type, record_number, external_id, status, error_code, error_field, retryable, created_at')
      .eq('batch_id', batch.id)
      .eq('company_id', context.companyId)
      .order('record_number', { ascending: true });
    if (cursor) query = query.gt('record_number', cursor);

    const { data, error } = await query.limit(limit + 1);
    if (error) throw error;
    const items = data || [];
    const pageItems = items.slice(0, limit);
    const nextCursor = items.length > limit
      ? encodeCursor(pageItems[pageItems.length - 1].record_number)
      : null;

    return response.status(200).json({ items: pageItems, next_cursor: nextCursor });
  } catch (error) {
    return sendIntegrationError(response, error);
  }
}
