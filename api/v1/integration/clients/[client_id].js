import {
  ApiError,
  authorizeCompany,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from '../../_lib/sphorix-connect.js';

const ADMIN_ROLES = ['owner', 'admin'];
const CLIENT_FIELDS = 'id, name, key_prefix, scopes, expires_at, revoked_at, created_at';

export default async function handler(request, response) {
  if (request.method !== 'DELETE') return methodNotAllowed(response, ['DELETE']);

  try {
    const clientId = request.query?.client_id;
    if (!isUuid(clientId)) throw new ApiError(400, 'INVALID_API_CLIENT_ID', 'Identifiant de cle API invalide.');
    const context = await authorizeCompany(
      request,
      request.query?.company_id,
      ADMIN_ROLES,
      { userOnly: true },
    );
    const { data, error } = await context.adminClient
      .from('sadesk_api_clients')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', clientId)
      .eq('company_id', context.companyId)
      .is('revoked_at', null)
      .select(CLIENT_FIELDS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'API_CLIENT_NOT_FOUND', 'Cle API introuvable ou deja revoquee.');

    return response.status(200).json({ api_client: data, revoked: true });
  } catch (error) {
    return sendApiError(response, error);
  }
}
