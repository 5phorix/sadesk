import {
  ApiError,
  isUuid,
  methodNotAllowed,
} from '../../_lib/sphorix-connect.js';
import {
  authorizeSadeskIntegration,
  sendIntegrationError,
} from '../../_lib/sadesk-integration.js';

const BATCH_FIELDS = 'id, source_system, source_connection, status, total_count, created_count, ignored_count, rejected_count, created_at, completed_at';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);

  try {
    const batchId = request.query?.batch_id;
    if (!isUuid(batchId)) throw new ApiError(400, 'INVALID_BATCH_ID', 'Identifiant de lot invalide.');
    const context = await authorizeSadeskIntegration(request, 'imports:read');
    const { data, error } = await context.adminClient
      .from('sadesk_import_batches')
      .select(BATCH_FIELDS)
      .eq('id', batchId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'BATCH_NOT_FOUND', 'Lot introuvable.');

    return response.status(200).json({ batch: data });
  } catch (error) {
    return sendIntegrationError(response, error);
  }
}
