const API_ORIGIN = 'http://sphorix-connect.local';

export async function requestSphorixConnect(path, {
  token,
  companyId,
  method = 'GET',
  body,
  idempotencyKey,
} = {}) {
  if (!token) throw new Error('Session expirée, veuillez vous reconnecter.');

  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/api/v1/')) {
    throw new Error('Route Sphorix Connect invalide.');
  }
  if (['GET', 'DELETE'].includes(method) && companyId) url.searchParams.set('company_id', companyId);

  const headers = { Authorization: `Bearer ${token}` };
  const request = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify({ ...body, ...(companyId ? { company_id: companyId } : {}) });
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`${url.pathname}${url.search}`, request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || 'La requête Sphorix Connect a échoué.');
  }
  return payload;
}