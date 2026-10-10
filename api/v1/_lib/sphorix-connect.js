import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const ARCHIVE_BUCKET = 'sphorix-connect-archives';
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

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

export async function authorizeCompany(request, companyId, allowedRoles) {
  if (!companyId) throw new ApiError(400, 'COMPANY_REQUIRED', 'company_id est obligatoire.');
  if (!isUuid(companyId)) throw new ApiError(400, 'INVALID_COMPANY_ID', 'company_id est invalide.');

  const accessToken = getBearerToken(request);
  if (!accessToken) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentification requise.');

  const { authClient, adminClient } = createSupabaseClients(accessToken);
  const { data, error: authError } = await authClient.auth.getUser();
  if (authError || !data?.user) {
    throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Session invalide ou expiree.');
  }

  const { data: membership, error: membershipError } = await adminClient
    .from('company_users')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new ApiError(403, 'COMPANY_ACCESS_DENIED', 'Acces refuse a cette societe.');
  if (!allowedRoles.includes(membership.role)) {
    throw new ApiError(403, 'INSUFFICIENT_ROLE', 'Votre role ne permet pas cette operation.');
  }

  return { adminClient, user: data.user, role: membership.role, companyId };
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