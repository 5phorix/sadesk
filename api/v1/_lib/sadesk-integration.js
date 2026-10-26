import { createHash, randomUUID } from 'node:crypto';
import { ApiError, authorizeCompany } from './sphorix-connect.js';

export const SADESK_INTEGRATION_SCOPES = ['imports:read', 'imports:write'];

function stableSerialize(value) {
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export function hashRequest(value) {
	return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export function isValidSourceSystem(value) {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{1,79}$/.test(value);
}

export async function authorizeSadeskIntegration(request, scope) {
	return authorizeCompany(request, undefined, ['integration'], {
		scope,
		deriveCompanyFromApiKey: true,
		apiKeyPrefix: 'sds_live_',
		apiClientTable: 'sadesk_api_clients',
		servicePrincipal: true,
	});
}

export function sendIntegrationError(response, error) {
	const knownError = error instanceof ApiError;
	const status = knownError ? error.status : 500;
	if (!knownError) console.error('Sadesk integration request failed:', error);

	return response.status(status).json({
		request_id: randomUUID(),
		error: {
			code: knownError ? error.code : 'INTERNAL_ERROR',
			message: knownError ? error.message : 'Une erreur interne est survenue.',
			retryable: !knownError && status >= 500,
		},
	});
}
