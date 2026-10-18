import {
  API_SCOPES,
  ApiError,
  authorizeCompany,
  createApiKey,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from './_lib/sphorix-connect.js';

const MANAGE_ROLES = ['owner', 'admin'];
const CLIENT_FIELDS = 'id, name, key_prefix, scopes, expires_at, revoked_at, created_at';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    return methodNotAllowed(response, ['GET', 'POST']);
  }

  try {
    const body = request.body || {};
    const companyId = request.method === 'GET' ? request.query?.company_id : body.company_id;
    const context = await authorizeCompany(request, companyId, MANAGE_ROLES, { userOnly: true });

    if (request.method === 'GET') {
      const { data, error } = await context.adminClient
        .from('integration_api_clients')
        .select(CLIENT_FIELDS)
        .eq('company_id', context.companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return response.status(200).json({ api_clients: data || [] });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      throw new ApiError(400, 'INVALID_API_CLIENT_NAME', 'Le nom doit contenir entre 2 et 100 caracteres.');
    }

    const scopes = body.scopes;
    if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > API_SCOPES.length
      || new Set(scopes).size !== scopes.length
      || scopes.some((scope) => !API_SCOPES.includes(scope))) {
      throw new ApiError(400, 'INVALID_API_CLIENT_SCOPES', 'Les scopes demandes sont invalides.');
    }

    const expiresInDays = body.expires_in_days ?? 90;
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
      throw new ApiError(400, 'INVALID_API_CLIENT_EXPIRY', 'La duree doit etre comprise entre 1 et 365 jours.');
    }

    const { token, tokenHash, keyPrefix } = createApiKey();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.adminClient
      .from('integration_api_clients')
      .insert({
        company_id: context.companyId,
        created_by: context.user.id,
        name,
        key_prefix: keyPrefix,
        token_hash: tokenHash,
        scopes,
        expires_at: expiresAt,
      })
      .select(CLIENT_FIELDS)
      .single();
    if (error) throw error;

    return response.status(201).json({ api_client: data, token });
  } catch (error) {
    return sendApiError(response, error);
  }
}