import {
  ApiError,
  authorizeCompany,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from '../../_lib/sphorix-connect.js';

const EDIT_ROLES = ['owner', 'admin', 'accountant'];
const RETRYABLE_ERRORS = ['COUNTERPARTY_NOT_IMPORTED', 'DESTINATION_WRITE_FAILED'];
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const PAGE_SIZE = 1000;

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);

  try {
    const originalRunId = request.query?.transfer_id;
    if (!isUuid(originalRunId)) throw new ApiError(400, 'INVALID_TRANSFER_ID', 'Identifiant d execution invalide.');
    const context = await authorizeCompany(request, request.body?.company_id, EDIT_ROLES, { scope: 'transfers:retry' });
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key doit contenir 8 a 128 caracteres autorises.');
    }

    const { data: originalRun, error: runError } = await context.adminClient
      .from('integration_runs')
      .select('id, company_id, connection_id, preview_id, direction, mode, status')
      .eq('id', originalRunId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (runError) throw runError;
    if (!originalRun) throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Execution introuvable.');
    if (!['partially_succeeded', 'failed'].includes(originalRun.status)) {
      throw new ApiError(409, 'TRANSFER_NOT_RETRYABLE', 'Seules les executions partielles ou en echec peuvent etre reprises.');
    }

    const { data: existing, error: existingError } = await context.adminClient
      .from('integration_runs')
      .select('id, parent_run_id, status, total_count, read_count, written_count, ignored_count, failed_count, created_at')
      .eq('company_id', context.companyId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.parent_run_id !== originalRun.id) {
        throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette cle a deja servi a une autre execution.');
      }
      return response.status(200).json({ transfer: existing, resumed: true });
    }

    const { data: scopes, error: scopesError } = await context.adminClient
      .from('integration_run_scopes')
      .select('object_type')
      .eq('run_id', originalRun.id)
      .eq('company_id', context.companyId);
    if (scopesError) throw scopesError;
    const objectType = scopes?.[0]?.object_type;
    if (!objectType) throw new ApiError(409, 'TRANSFER_SCOPE_MISSING', 'Le perimetre de l execution est introuvable.');

    const retryRecordNumbers = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: items, error: itemsError } = await context.adminClient
        .from('integration_run_items')
        .select('record_number')
        .eq('run_id', originalRun.id)
        .eq('company_id', context.companyId)
        .eq('object_type', objectType)
        .eq('status', 'failed')
        .in('error_code', RETRYABLE_ERRORS)
        .order('record_number', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (itemsError) throw itemsError;
      retryRecordNumbers.push(...(items || []).map((item) => item.record_number));
      if (!items || items.length < PAGE_SIZE) break;
    }

    if (retryRecordNumbers.length === 0) {
      throw new ApiError(409, 'NO_RETRYABLE_ITEMS', 'Aucune ligne en echec n est actuellement recuperable.');
    }

    const { data: transfer, error: insertError } = await context.adminClient
      .from('integration_runs')
      .insert({
        company_id: context.companyId,
        connection_id: originalRun.connection_id,
        preview_id: originalRun.preview_id,
        parent_run_id: originalRun.id,
        direction: originalRun.direction,
        mode: originalRun.mode,
        status: 'queued',
        idempotency_key: idempotencyKey,
        total_count: retryRecordNumbers.length,
        requested_by: context.user.id,
      })
      .select('id, connection_id, preview_id, parent_run_id, direction, mode, status, total_count, created_at')
      .single();
    if (insertError) throw insertError;

    const { error: scopeError } = await context.adminClient
      .from('integration_run_scopes')
      .insert({
        company_id: context.companyId,
        run_id: transfer.id,
        object_type: objectType,
        source_count: retryRecordNumbers.length,
        checkpoint: { next_record_number: 1, retry_record_numbers: retryRecordNumbers },
      });
    if (scopeError) {
      await context.adminClient
        .from('integration_runs')
        .delete()
        .eq('id', transfer.id)
        .eq('company_id', context.companyId);
      throw scopeError;
    }

    return response.status(202).json({ transfer });
  } catch (error) {
    return sendApiError(response, error);
  }
}