import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSphorixConnect } from '../../src/api/sphorixConnect.js';

describe('client API Sphorix Connect', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('authentifie la requête et limite une lecture à la société demandée', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connections: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await requestSphorixConnect('/api/v1/connections', {
      token: 'access-token',
      companyId: 'company-1',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/connections?company_id=company-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer access-token' },
    });
  });

  it('ajoute la société et la clé d idempotence aux mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ transfer: { id: 'run-1' } }) });
    vi.stubGlobal('fetch', fetchMock);

    await requestSphorixConnect('/api/v1/transfers', {
      token: 'access-token',
      companyId: 'company-1',
      method: 'POST',
      body: { preview_id: 'preview-1' },
      idempotencyKey: 'request-12345678',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/transfers', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'request-12345678',
      },
      body: JSON.stringify({ preview_id: 'preview-1', company_id: 'company-1' }),
    }));
  });

  it('retourne un message serveur et refuse une route externe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Société inaccessible.' } }),
    }));

    await expect(requestSphorixConnect('/api/v1/connections', { token: 'access-token' }))
      .rejects.toThrow('Société inaccessible.');
    await expect(requestSphorixConnect('https://example.com/api/v1/connections', { token: 'access-token' }))
      .rejects.toThrow('Route Sphorix Connect invalide.');
  });
});