import { randomUUID } from 'node:crypto';
import {
  ApiError,
  ARCHIVE_BUCKET,
  MAX_ARCHIVE_BYTES,
  authorizeCompany,
  methodNotAllowed,
  sendApiError,
} from './_lib/sphorix-connect.js';

const EDIT_ROLES = ['owner', 'admin', 'accountant'];
const ALLOWED_CONTENT_TYPES = new Set([
  'application/json',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
]);

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);

  try {
    const body = request.body || {};
    const context = await authorizeCompany(request, body.company_id, EDIT_ROLES);
    const { connectionId, fileName, contentType, sizeBytes } = {
      connectionId: body.connection_id,
      fileName: typeof body.file_name === 'string' ? body.file_name.trim() : '',
      contentType: typeof body.content_type === 'string' ? body.content_type.toLowerCase() : '',
      sizeBytes: Number(body.size_bytes),
    };

    if (!connectionId) throw new ApiError(400, 'CONNECTION_REQUIRED', 'connection_id est obligatoire.');
    if (!fileName || fileName.length > 180 || /[\\/\0]/.test(fileName)) {
      throw new ApiError(400, 'INVALID_FILE_NAME', 'Nom de fichier invalide.');
    }
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!['csv', 'json'].includes(extension)) {
      throw new ApiError(415, 'UNSUPPORTED_FILE_FORMAT', 'Seuls les fichiers CSV et JSON sont acceptes.');
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ApiError(415, 'UNSUPPORTED_CONTENT_TYPE', 'Type de fichier non pris en charge.');
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_ARCHIVE_BYTES) {
      throw new ApiError(413, 'FILE_SIZE_LIMIT', 'Le fichier doit peser au maximum 50 Mio.');
    }

    const { data: connection, error: connectionError } = await context.adminClient
      .from('integration_connections')
      .select('id, connector_key, status')
      .eq('id', connectionId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== 'active' || connection.connector_key !== 'file-csv-json') {
      throw new ApiError(404, 'CONNECTION_NOT_FOUND', 'Connexion de fichiers introuvable ou inactive.');
    }

    const safeName = fileName.replace(/[^\w.-]/g, '_');
    const storedName = `${randomUUID()}-${safeName}`;
    const path = `${context.companyId}/${connection.id}/${storedName}`;
    const { data, error } = await context.adminClient.storage
      .from(ARCHIVE_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;

    response.setHeader('Cache-Control', 'no-store');
    return response.status(201).json({
      bucket: ARCHIVE_BUCKET,
      path,
      token: data.token,
      signed_url: data.signedUrl,
      content_type: contentType,
      expires_in: 7200,
    });
  } catch (error) {
    return sendApiError(response, error);
  }
}