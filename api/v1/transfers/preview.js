import { createHash } from 'node:crypto';
import { previewImport } from '../_lib/import-preview.js';
import {
  ApiError,
  ARCHIVE_BUCKET,
  MAX_ARCHIVE_BYTES,
  authorizeCompany,
  methodNotAllowed,
  sendApiError,
} from '../_lib/sphorix-connect.js';

const EDIT_ROLES = ['owner', 'admin', 'accountant'];
const SUPPORTED_OBJECTS = new Set(['invoices', 'third_parties']);

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);

  try {
    const body = request.body || {};
    const context = await authorizeCompany(request, body.company_id, EDIT_ROLES, { scope: 'transfers:write' });
    const { connection_id: connectionId, source_path: sourcePath, object_type: objectType } = body;

    if (!connectionId || !sourcePath || !objectType) {
      throw new ApiError(400, 'PREVIEW_FIELDS_REQUIRED', 'connection_id, source_path et object_type sont obligatoires.');
    }
    if (!SUPPORTED_OBJECTS.has(objectType)) {
      throw new ApiError(400, 'UNSUPPORTED_OBJECT_TYPE', 'Ce type de donnees n’est pas encore pris en charge.');
    }

    const { data: connection, error: connectionError } = await context.adminClient
      .from('integration_connections')
      .select('id, connector_key, status')
      .eq('id', connectionId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.connector_key !== 'file-csv-json' || connection.status !== 'active') {
      throw new ApiError(404, 'CONNECTION_NOT_FOUND', 'Connexion de fichiers introuvable ou inactive.');
    }

    const { data: company, error: companyError } = await context.adminClient
      .from('companies')
      .select('currency')
      .eq('id', context.companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'Societe introuvable.');

    const expectedPrefix = `${context.companyId}/${connection.id}/`;
    if (!sourcePath.startsWith(expectedPrefix) || sourcePath.includes('..')) {
      throw new ApiError(403, 'ARCHIVE_ACCESS_DENIED', 'Le fichier ne fait pas partie de cette connexion.');
    }

    const storedName = sourcePath.split('/').pop() || '';
    const extension = storedName.split('.').pop()?.toLowerCase();
    if (!['csv', 'json'].includes(extension)) {
      throw new ApiError(415, 'UNSUPPORTED_FILE_FORMAT', 'Seuls les fichiers CSV et JSON sont acceptes.');
    }

    const { data: file, error: downloadError } = await context.adminClient.storage
      .from(ARCHIVE_BUCKET)
      .download(sourcePath);
    if (downloadError) throw new ApiError(404, 'ARCHIVE_NOT_FOUND', 'Le fichier source est introuvable.');

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_ARCHIVE_BYTES) {
      throw new ApiError(413, 'FILE_SIZE_LIMIT', 'Le fichier doit peser entre 1 octet et 50 Mio.');
    }

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    } catch {
      throw new ApiError(422, 'INVALID_TEXT_ENCODING', 'Le fichier doit etre encode en UTF-8.');
    }

    let parsed;
    try {
      parsed = previewImport({
        text,
        objectType,
        format: extension,
        separator: body.separator || ';',
        companyCurrency: company.currency || 'EUR',
      });
    } catch (error) {
      if (error.message === 'Unsupported CSV separator.') {
        throw new ApiError(400, 'UNSUPPORTED_CSV_SEPARATOR', 'Separateur CSV non pris en charge.');
      }
      throw new ApiError(422, 'INVALID_SOURCE_FILE', 'Le fichier ne correspond pas au format attendu.');
    }

    if (parsed.summary.total_count === 0) {
      throw new ApiError(422, 'EMPTY_SOURCE_FILE', 'Le fichier ne contient aucun enregistrement.');
    }

    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
    const { data: preview, error: insertError } = await context.adminClient
      .from('integration_previews')
      .insert({
        company_id: context.companyId,
        connection_id: connection.id,
        object_type: objectType,
        source_path: sourcePath,
        source_file_name: storedName,
        source_content_type: extension === 'json' ? 'application/json' : 'text/csv',
        source_size_bytes: bytes.length,
        source_sha256: sourceSha256,
        total_count: parsed.summary.total_count,
        valid_count: parsed.summary.valid_count,
        duplicate_count: parsed.summary.duplicate_count,
        invalid_count: parsed.summary.invalid_count,
        summary: {
          ...parsed.summary,
          separator: extension === 'csv' ? body.separator || ';' : null,
        },
        created_by: context.user.id,
      })
      .select('id, object_type, total_count, valid_count, duplicate_count, invalid_count, summary, expires_at, created_at')
      .single();
    if (insertError) throw insertError;

    for (let offset = 0; offset < parsed.records.length; offset += 500) {
      const stagedRecords = parsed.records.slice(offset, offset + 500).map((record) => ({
        company_id: context.companyId,
        preview_id: preview.id,
        object_type: objectType,
        record_number: record.record_number,
        external_id: record.data?.external_id || null,
        source_record: record.data && typeof record.data === 'object' && !Array.isArray(record.data)
          ? record.data
          : {},
        status: record.status,
        validation_errors: record.errors,
      }));
      const { error: stageError } = await context.adminClient
        .from('integration_preview_items')
        .insert(stagedRecords);
      if (stageError) {
        await context.adminClient
          .from('integration_previews')
          .delete()
          .eq('id', preview.id)
          .eq('company_id', context.companyId);
        throw stageError;
      }
    }

    response.setHeader('Cache-Control', 'no-store');
    return response.status(201).json({ preview });
  } catch (error) {
    return sendApiError(response, error);
  }
}