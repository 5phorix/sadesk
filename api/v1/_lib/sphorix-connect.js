import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const ARCHIVE_BUCKET = 'sphorix-connect-archives';
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const API_SCOPES = [
  'connections:read',
  'connections:write',
  'transfers:read',
  'transfers:write',
  'transfers:process',
  'transfers:retry',
  'uploads:write',
];

export function encodeTransferItemsCursor(item) {
  return Buffer.from(JSON.stringify({
    object_type: item.object_type,
    record_number: item.record_number,
  })).toString('base64url');
}

export function decodeTransferItemsCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!['invoices', 'third_parties'].includes(cursor.object_type)
      || !Number.isInteger(cursor.record_number)
      || cursor.record_number < 1) return null;
    return cursor;
  } catch {
    return null;
  }
}
const API_KEY_PREFIX = 'spx_live_';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function getBearerToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createApiKey() {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    keyPrefix: token.slice(0, 17),
  };
}

export function createSupabaseClients(accessToken) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new ApiError(500, 'SERVER_CONFIGURATION_ERROR', 'Service de donnees indisponible.');
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { authClient, adminClient };
}

export async function authorizeCompany(request, companyId, allowedRoles, { scope, userOnly = false } = {}) {
  if (!companyId) throw new ApiError(400, 'COMPANY_REQUIRED', 'company_id est obligatoire.');
  if (!isUuid(companyId)) throw new ApiError(400, 'INVALID_COMPANY_ID', 'company_id est invalide.');

  const accessToken = getBearerToken(request);
  if (!accessToken) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentification requise.');
  if (userOnly && accessToken.startsWith(API_KEY_PREFIX)) {
    throw new ApiError(401, 'USER_SESSION_REQUIRED', 'Une session utilisateur est requise.');
  }

  const { authClient, adminClient } = createSupabaseClients(accessToken);
  let user;
  let apiClient = null;

  if (accessToken.startsWith(API_KEY_PREFIX)) {
    if (!scope) throw new ApiError(403, 'API_SCOPE_REQUIRED', 'Cette operation n’est pas autorisee aux clients API.');

    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    const { data: client, error: clientError } = await adminClient
      .from('integration_api_clients')
      .select('id, company_id, created_by, scopes, expires_at, revoked_at')
      .eq('company_id', companyId)
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (clientError) throw clientError;
    if (!client || client.revoked_at || new Date(client.expires_at).getTime() <= Date.now()) {
      throw new ApiError(401, 'INVALID_API_KEY', 'Cle API invalide, expiree ou revoquee.');
    }
    if (!client.scopes.includes(scope)) {
      throw new ApiError(403, 'INSUFFICIENT_API_SCOPE', 'Le scope de cette cle API ne permet pas cette operation.');
    }

    user = { id: client.created_by };
    apiClient = { id: client.id };
  } else {
    const { data, error: authError } = await authClient.auth.getUser();
    if (authError || !data?.user) {
      throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Session invalide ou expiree.');
    }
    user = data.user;
  }

  const { data: membership, error: membershipError } = await adminClient
    .from('company_users')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new ApiError(403, 'COMPANY_ACCESS_DENIED', 'Acces refuse a cette societe.');
  if (!allowedRoles.includes(membership.role)) {
    throw new ApiError(403, 'INSUFFICIENT_ROLE', 'Votre role ne permet pas cette operation.');
  }

  return { adminClient, user, role: membership.role, companyId, apiClient };
}

export function sendApiError(response, error) {
  const requestId = randomUUID();
  const knownError = error instanceof ApiError;
  const status = knownError ? error.status : 500;
  if (!knownError) console.error('Sphorix Connect request failed:', error);

  return response.status(status).json({
    request_id: requestId,
    error: {
      code: knownError ? error.code : 'INTERNAL_ERROR',
      message: knownError ? error.message : 'Une erreur interne est survenue.',
      retryable: !knownError && status >= 500,
    },
  });
}

export function methodNotAllowed(response, allowedMethods) {
  response.setHeader('Allow', allowedMethods.join(', '));
  return response.status(405).json({
    request_id: randomUUID(),
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Methode HTTP non prise en charge.',
      retryable: false,
    },
  });
}