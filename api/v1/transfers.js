import {
  ApiError,
  authorizeCompany,
  methodNotAllowed,
  sendApiError,
} from './_lib/sphorix-connect.js';

const READ_ROLES = ['owner', 'admin', 'accountant', 'viewer'];
const EDIT_ROLES = ['owner', 'admin', 'accountant'];
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    return methodNotAllowed(response, ['GET', 'POST']);
  }

  try {
    if (request.method === 'GET') {
      const context = await authorizeCompany(
        request,
        request.query?.company_id,
        READ_ROLES,
        { scope: 'transfers:read' },
      );
      const { data, error } = await context.adminClient
        .from('integration_runs')
        .select('id, connection_id, preview_id, direction, mode, status, total_count, read_count, written_count, ignored_count, failed_count, created_at, started_at, completed_at')
        .eq('company_id', context.companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return response.status(200).json({ transfers: data || [] });
    }

    const body = request.body || {};
    const context = await authorizeCompany(request, body.company_id, EDIT_ROLES, { scope: 'transfers:write' });
    const previewId = body.preview_id;
    const idempotencyKey = request.headers['idempotency-key'];
    if (!previewId) throw new ApiError(400, 'PREVIEW_REQUIRED', 'preview_id est obligatoire.');
    if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key doit contenir 8 a 128 caracteres autorises.');
    }

    const { data: preview, error: previewError } = await context.adminClient
      .from('integration_previews')
      .select('id, connection_id, object_type, direction, total_count, status, expires_at')
      .eq('id', previewId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (previewError) throw previewError;
    if (!preview) throw new ApiError(404, 'PREVIEW_NOT_FOUND', 'Apercu introuvable.');
    if (preview.status !== 'ready' || new Date(preview.expires_at).getTime() <= Date.now()) {
      throw new ApiError(409, 'PREVIEW_NOT_AVAILABLE', 'Cet apercu est expire ou deja utilise.');
    }

    const { data: existingByKey, error: existingKeyError } = await context.adminClient
      .from('integration_runs')
      .select('id, preview_id, status, total_count, read_count, written_count, ignored_count, failed_count, created_at')
      .eq('company_id', context.companyId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingKeyError) throw existingKeyError;
    if (existingByKey) {
      if (existingByKey.preview_id !== preview.id) {
        throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette cle a deja servi a une autre execution.');
      }
      return response.status(200).json({ transfer: existingByKey, resumed: true });
    }

    const { data: existingByPreview, error: existingPreviewError } = await context.adminClient
      .from('integration_runs')
      .select('id')
      .eq('company_id', context.companyId)
      .eq('preview_id', preview.id)
      .maybeSingle();
    if (existingPreviewError) throw existingPreviewError;
    if (existingByPreview) throw new ApiError(409, 'PREVIEW_ALREADY_SCHEDULED', 'Cet apercu a deja une execution.');

    const { data: transfer, error: insertError } = await context.adminClient
      .from('integration_runs')
      .insert({
        company_id: context.companyId,
        connection_id: preview.connection_id,
        preview_id: preview.id,
        direction: preview.direction,
        mode: 'snapshot',
        status: 'queued',
        idempotency_key: idempotencyKey,
        total_count: preview.total_count,
        requested_by: context.user.id,
      })
      .select('id, connection_id, preview_id, direction, mode, status, total_count, read_count, written_count, ignored_count, failed_count, created_at')
      .single();
    if (insertError) {
      if (insertError.code === '23505') {
          const { data: concurrentRun, error: concurrentRunError } = await context.adminClient
            .from('integration_runs')
            .select('id, preview_id, status, total_count, read_count, written_count, ignored_count, failed_count, created_at')
            .eq('company_id', context.companyId)
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();
          if (concurrentRunError) throw concurrentRunError;
          if (concurrentRun?.preview_id === preview.id) {
            return response.status(200).json({ transfer: concurrentRun, resumed: true });
          }
        throw new ApiError(409, 'TRANSFER_ALREADY_CREATED', 'Une execution a deja ete creee pour cet apercu.');
      }
      throw insertError;
    }

    const { error: scopeError } = await context.adminClient
      .from('integration_run_scopes')
      .insert({
        company_id: context.companyId,
        run_id: transfer.id,
        object_type: preview.object_type,
        source_count: preview.total_count,
        checkpoint: { next_record_number: 1 },
      });
      if (scopeError) {
        await context.adminClient
          .from('integration_runs')
          .delete()
          .eq('id', transfer.id)
          .eq('company_id', context.companyId);
        throw scopeError;
      }

    return response.status(202).json({ transfer, next_action: 'POST /api/v1/transfers/{transfer_id}/process' });
  } catch (error) {
    return sendApiError(response, error);
  }
}