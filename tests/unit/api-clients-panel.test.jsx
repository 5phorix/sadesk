// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('@/components/hooks/useUser', () => ({
  useUser: () => ({ user: { active_company_id: 'company-1', role: 'admin' } }),
}));

vi.mock('@/api/sphorixConnect', () => ({ requestSphorixConnect: requestMock }));

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'session-token' } }, error: null })) },
  },
}));

import ApiClientsPanel from '@/components/integrations/ApiClientsPanel';

const initialClient = {
  id: 'client-1',
  name: 'Connecteur bancaire',
  key_prefix: 'spx_live_12345678',
  scopes: ['transfers:read'],
  expires_at: '2027-01-18T00:00:00.000Z',
  revoked_at: null,
  created_at: '2026-10-18T00:00:00.000Z',
};

describe('gestion des clés API depuis Sadesk', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    requestMock.mockReset();
    requestMock.mockImplementation(async (path, options = {}) => {
      if (path === '/api/v1/api-clients' && options.method === 'POST') {
        return {
          api_client: { ...initialClient, id: 'client-2', name: options.body.name },
          token: 'spx_live_created-once',
        };
      }
      if (path === '/api/v1/api-clients/client-1' && options.method === 'DELETE') {
        return {
          api_client: { ...initialClient, revoked_at: '2026-10-18T12:00:00.000Z' },
          revoked: true,
        };
      }
      if (path === '/api/v1/api-clients') return { api_clients: [initialClient] };
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('affiche la clé brute seulement après sa création', async () => {
    render(<ApiClientsPanel />);

    await screen.findByText('Connecteur bancaire');
    fireEvent.change(screen.getByLabelText('Nom du client'), { target: { value: 'Export comptable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la clé' }));

    expect(await screen.findByLabelText('Nouvelle clé API')).toHaveValue('spx_live_created-once');
    expect(screen.getByText(/elle ne sera plus affichée ensuite/i)).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith('/api/v1/api-clients', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        name: 'Export comptable',
        scopes: ['transfers:read'],
        expires_in_days: 90,
      }),
    }));
  });

  it('demande une confirmation avant la révocation', async () => {
    render(<ApiClientsPanel />);

    await screen.findByText('Connecteur bancaire');
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    expect(await screen.findByText('Révoquer cette clé API ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer la clé' }));

    expect(await screen.findByText('Révoquée')).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith('/api/v1/api-clients/client-1', expect.objectContaining({
      method: 'DELETE',
      companyId: 'company-1',
    }));
  });
});