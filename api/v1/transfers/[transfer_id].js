import {
  ApiError,
  authorizeCompany,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from '../_lib/sphorix-connect.js';

const READ_ROLES = ['owner', 'admin', 'accountant', 'viewer'];

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);

  try {
    const transferId = request.query?.transfer_id;
    if (!isUuid(transferId)) throw new ApiError(400, 'INVALID_TRANSFER_ID', 'Identifiant d execution invalide.');
    const context = await authorizeCompany(request, request.query?.company_id, READ_ROLES);
    const { data: transfer, error: transferError } = await context.adminClient
      .from('integration_runs')
      .select('id, connection_id, preview_id, direction, mode, status, total_count, read_count, written_count, ignored_count, failed_count, error_summary, created_at, started_at, completed_at')
      .eq('id', transferId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (transferError) throw transferError;
    if (!transfer) throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Execution introuvable.');

    const [{ data: scopes, error: scopesError }, { data: items, error: itemsError }] = await Promise.all([
      context.adminClient
        .from('integration_run_scopes')
        .select('object_type, status, checkpoint, source_count, read_count, archived_count, written_count, ignored_count, failed_count, reconciliation, started_at, completed_at')
        .eq('run_id', transfer.id)
        .eq('company_id', context.companyId),
      context.adminClient
        .from('integration_run_items')
        .select('object_type, record_number, external_id, status, error_code, error_details, created_at')
        .eq('run_id', transfer.id)
        .eq('company_id', context.companyId)
        .in('status', ['failed', 'unmapped'])
        .order('record_number', { ascending: true })
        .limit(100),
    ]);
    if (scopesError) throw scopesError;
    if (itemsError) throw itemsError;

    return response.status(200).json({ transfer, scopes: scopes || [], items: items || [] });
  } catch (error) {
    return sendApiError(response, error);
  }
}