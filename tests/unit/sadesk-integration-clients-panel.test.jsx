// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('@/components/hooks/useUser', () => ({
  useUser: () => ({ user: { active_company_id: 'company-1', role: 'owner' } }),
}));

vi.mock('@/api/sphorixConnect', () => ({ requestSphorixConnect: requestMock }));

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'sadesk-session' } }, error: null })) },
  },
}));

import SadeskIntegrationClientsPanel from '@/components/integrations/SadeskIntegrationClientsPanel';

const initialClient = {
  id: 'sadesk-client-1',
  name: 'Sphorix Connect',
  key_prefix: 'sds_live_12345678',
  scopes: ['imports:write', 'imports:read'],
  expires_at: '2027-01-18T00:00:00.000Z',
  revoked_at: null,
  created_at: '2026-10-18T00:00:00.000Z',
};

describe('credentials machine Sadesk depuis les paramètres', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    requestMock.mockReset();
    requestMock.mockImplementation(async (path, options = {}) => {
      if (path === '/api/v1/integration/clients' && options.method === 'POST') {
        return { api_client: initialClient, token: 'sds_live_one-time-secret' };
      }
      if (path === '/api/v1/integration/clients/sadesk-client-1' && options.method === 'DELETE') {
        return { api_client: { ...initialClient, revoked_at: '2026-10-18T00:00:00.000Z' }, revoked: true };
      }
      if (path === '/api/v1/integration/clients') return { api_clients: [] };
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates a scoped credential and displays the raw secret once', async () => {
    render(<SadeskIntegrationClientsPanel />);
    fireEvent.change(await screen.findByLabelText('Nom du produit connecté'), { target: { value: 'Sphorix Connect' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer un credential Sadesk' }));

    expect(await screen.findByLabelText('Nouveau credential Sadesk')).toHaveValue('sds_live_one-time-secret');
    expect(requestMock).toHaveBeenCalledWith('/api/v1/integration/clients', expect.objectContaining({
      method: 'POST',
      companyId: 'company-1',
      token: 'sadesk-session',
      body: expect.objectContaining({
        name: 'Sphorix Connect',
        scopes: ['imports:write', 'imports:read'],
        expires_in_days: 90,
      }),
    }));
  });

  it('confirms and revokes a credential scoped to the active company', async () => {
    requestMock.mockImplementation(async (path, options = {}) => {
      if (path === '/api/v1/integration/clients/sadesk-client-1' && options.method === 'DELETE') {
        return { api_client: { ...initialClient, revoked_at: '2026-10-18T00:00:00.000Z' }, revoked: true };
      }
      return { api_clients: [initialClient] };
    });
    render(<SadeskIntegrationClientsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer' }));
    expect(await screen.findByText('Révoquer ce credential Sadesk ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer', exact: true }));

    expect(await screen.findByText('Révoqué')).toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith('/api/v1/integration/clients/sadesk-client-1', expect.objectContaining({
      method: 'DELETE',
      companyId: 'company-1',
      token: 'sadesk-session',
    }));
  });
});
