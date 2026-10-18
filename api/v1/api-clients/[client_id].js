import {
  ApiError,
  authorizeCompany,
  isUuid,
  methodNotAllowed,
  sendApiError,
} from '../_lib/sphorix-connect.js';

const MANAGE_ROLES = ['owner', 'admin'];
const CLIENT_FIELDS = 'id, name, key_prefix, scopes, expires_at, revoked_at, created_at';

export default async function handler(request, response) {
  if (request.method !== 'DELETE') return methodNotAllowed(response, ['DELETE']);

  try {
    const clientId = request.query?.client_id;
    if (!isUuid(clientId)) throw new ApiError(400, 'INVALID_API_CLIENT_ID', 'Identifiant de cle API invalide.');
    const context = await authorizeCompany(
      request,
      request.query?.company_id,
      MANAGE_ROLES,
      { userOnly: true },
    );
    const { data: existing, error: readError } = await context.adminClient
      .from('integration_api_clients')
      .select('id, revoked_at')
      .eq('id', clientId)
      .eq('company_id', context.companyId)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw new ApiError(404, 'API_CLIENT_NOT_FOUND', 'Cle API introuvable.');

    if (existing.revoked_at) {
      const { data, error } = await context.adminClient
        .from('integration_api_clients')
        .select(CLIENT_FIELDS)
        .eq('id', clientId)
        .eq('company_id', context.companyId)
        .single();
      if (error) throw error;
      return response.status(200).json({ api_client: data, revoked: false });
    }

    const { data, error } = await context.adminClient
      .from('integration_api_clients')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', clientId)
      .eq('company_id', context.companyId)
      .is('revoked_at', null)
      .select(CLIENT_FIELDS)
      .single();
    if (error) throw error;

    return response.status(200).json({ api_client: data, revoked: true });
  } catch (error) {
    return sendApiError(response, error);
  }
}