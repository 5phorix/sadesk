import {
  ApiError,
  authorizeCompany,
  methodNotAllowed,
  sendApiError,
} from './_lib/sphorix-connect.js';

const READ_ROLES = ['owner', 'admin', 'accountant', 'viewer'];
const MANAGE_ROLES = ['owner', 'admin'];
const FILE_CONNECTOR = 'file-csv-json';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    return methodNotAllowed(response, ['GET', 'POST']);
  }

  try {
    const body = request.body || {};
    const companyId = request.method === 'GET' ? request.query?.company_id : body.company_id;
    const context = await authorizeCompany(
      request,
      companyId,
      request.method === 'GET' ? READ_ROLES : MANAGE_ROLES,
      { scope: request.method === 'GET' ? 'connections:read' : 'connections:write' },
    );

    if (request.method === 'GET') {
      const { data, error } = await context.adminClient
        .from('integration_connections')
        .select('id, connector_key, display_name, status, created_at, updated_at')
        .eq('company_id', context.companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return response.status(200).json({ connections: data || [] });
    }

    if (body.connector_key !== FILE_CONNECTOR) {
      throw new ApiError(400, 'UNSUPPORTED_CONNECTOR', 'Ce connecteur n’est pas encore disponible.');
    }

    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (displayName.length < 2 || displayName.length > 120) {
      throw new ApiError(400, 'INVALID_DISPLAY_NAME', 'Le nom doit contenir entre 2 et 120 caracteres.');
    }

    const { data, error } = await context.adminClient
      .from('integration_connections')
      .insert({
        company_id: context.companyId,
        connector_key: FILE_CONNECTOR,
        display_name: displayName,
        created_by: context.user.id,
      })
      .select('id, connector_key, display_name, status, created_at')
      .single();
    if (error) throw error;

    return response.status(201).json({ connection: data });
  } catch (error) {
    return sendApiError(response, error);
  }
}