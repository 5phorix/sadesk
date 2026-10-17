import { randomUUID } from 'node:crypto';
import {
  ApiError,
  authorizeCompany,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from '../../_lib/sphorix-connect.js';

const EDIT_ROLES = ['owner', 'admin', 'accountant'];
const TERMINAL_STATUSES = new Set(['succeeded', 'partially_succeeded', 'failed', 'cancelled']);
const BATCH_SIZE = 250;

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);

  let context;
  let run;
  let leaseToken;
  let claimed = false;

  try {
    const transferId = request.query?.transfer_id;
    if (!isUuid(transferId)) throw new ApiError(400, 'INVALID_TRANSFER_ID', 'Identifiant d execution invalide.');
    context = await authorizeCompany(request, request.body?.company_id, EDIT_ROLES);

    const { data: foundRun, error: runError } = await context.adminClient
      .from('integration_runs')
      .select('id, company_id, connection_id, preview_id, parent_run_id, status, total_count, read_count, written_count, ignored_count, failed_count')
      .eq('id', transferId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (runError) throw runError;
    if (!foundRun) throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Execution introuvable.');
    run = foundRun;
    if (TERMINAL_STATUSES.has(run.status)) return response.status(200).json({ transfer: run, has_more: false });

    const { data: preview, error: previewError } = await context.adminClient
      .from('integration_previews')
      .select('id, object_type, total_count')
      .eq('id', run.preview_id)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (previewError) throw previewError;
    if (!preview) throw new ApiError(404, 'PREVIEW_NOT_FOUND', 'Apercu de la source introuvable.');

    leaseToken = randomUUID();
    const { data: claim, error: claimError } = await context.adminClient.rpc('claim_integration_run_scope', {
      target_run_id: run.id,
      target_company_id: context.companyId,
      target_object_type: preview.object_type,
      target_lease_token: leaseToken,
    });
    if (claimError) throw claimError;
    if (!claim) throw new ApiError(409, 'TRANSFER_BATCH_BUSY', 'Un autre traitement est en cours pour cette execution.');
    claimed = true;

    const nextRecordNumber = Number(claim.next_record_number);
    const scopeTotalCount = Number(claim.total_count);
    if (!Number.isSafeInteger(scopeTotalCount) || scopeTotalCount < 0) {
      throw new ApiError(500, 'INVALID_SCOPE_COUNT', 'Le nombre d enregistrements du perimetre est invalide.');
    }
    const remainingCount = Math.max(0, scopeTotalCount - nextRecordNumber + 1);
    const expectedCount = Math.min(BATCH_SIZE, remainingCount);
    const retryRecordNumbers = Array.isArray(claim.checkpoint?.retry_record_numbers)
      ? claim.checkpoint.retry_record_numbers
      : null;
    const expectedRecordNumbers = retryRecordNumbers
      ? retryRecordNumbers.slice(nextRecordNumber - 1, nextRecordNumber - 1 + BATCH_SIZE)
      : null;
    if (retryRecordNumbers && expectedRecordNumbers.length !== expectedCount) {
      throw new ApiError(409, 'RETRY_CHECKPOINT_INVALID', 'Le checkpoint de reprise est invalide.');
    }

    let stagedQuery = context.adminClient
      .from('integration_preview_items')
      .select('record_number, source_record, status, validation_errors')
      .eq('preview_id', preview.id)
      .eq('company_id', context.companyId);
    stagedQuery = retryRecordNumbers
      ? stagedQuery.in('record_number', expectedRecordNumbers)
      : stagedQuery.gte('record_number', nextRecordNumber).limit(BATCH_SIZE);
    const { data: stagedRecords, error: stagedError } = await stagedQuery
      .order('record_number', { ascending: true });
    if (stagedError) throw stagedError;
    const stagedItems = stagedRecords || [];
    if (stagedItems.length !== expectedCount
      || stagedItems.some((record, index) => record.record_number !== (expectedRecordNumbers?.[index] ?? nextRecordNumber + index))) {
      throw new ApiError(500, 'STAGED_SOURCE_INCOMPLETE', 'Le staging de la source est incomplet; aucune suite ne peut etre declaree.');
    }

    const batch = stagedItems.map((record) => ({
      record_number: record.record_number,
      data: record.source_record,
      status: record.status,
      errors: record.validation_errors,
    }));
    const { error: applyError } = await context.adminClient.rpc('apply_integration_batch', {
      target_run_id: run.id,
      target_company_id: context.companyId,
      target_connection_id: run.connection_id,
      target_object_type: preview.object_type,
      target_records: batch,
    });
    if (applyError) throw applyError;

    const updatedNextRecordNumber = nextRecordNumber + batch.length;
    const hasMore = updatedNextRecordNumber <= scopeTotalCount;
    const { data: completion, error: completionError } = await context.adminClient.rpc('complete_integration_run_batch', {
      target_run_id: run.id,
      target_company_id: context.companyId,
      target_object_type: preview.object_type,
      target_lease_token: leaseToken,
      target_next_record_number: updatedNextRecordNumber,
      target_has_more: hasMore,
    });
    if (completionError) throw completionError;
    claimed = false;

    const transfer = {
      id: run.id,
      status: completion.status,
      total_count: scopeTotalCount,
      read_count: completion.read_count,
      written_count: completion.written_count,
      ignored_count: completion.ignored_count,
      failed_count: completion.failed_count,
    };
    return response.status(hasMore ? 202 : 200).json({ transfer, has_more: hasMore });
  } catch (error) {
    if (claimed && context && run && leaseToken) {
      const terminal = error instanceof ApiError && error.status < 500;
      await context.adminClient
        .from('integration_run_scopes')
        .update({
          status: terminal ? 'failed' : 'queued',
          lease_token: null,
          lease_expires_at: null,
          completed_at: terminal ? new Date().toISOString() : null,
        })
        .eq('run_id', run.id)
        .eq('company_id', context.companyId)
        .eq('lease_token', leaseToken);
      await context.adminClient
        .from('integration_runs')
        .update({
          status: terminal ? 'failed' : 'queued',
          error_summary: terminal ? 'Source validation failed' : null,
          completed_at: terminal ? new Date().toISOString() : null,
        })
        .eq('id', run.id)
        .eq('company_id', context.companyId)
        .eq('status', 'running');
    }
    return sendApiError(response, error);
  }
}