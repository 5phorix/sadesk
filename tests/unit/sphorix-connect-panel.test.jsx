// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock, uploadMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock('@/components/hooks/useUser', () => ({
  useUser: () => ({ user: { active_company_id: 'company-1', role: 'admin' } }),
}));

vi.mock('@/api/sphorixConnect', () => ({ requestSphorixConnect: requestMock }));

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-1' } }, error: null })) },
    storage: { from: vi.fn(() => ({ uploadToSignedUrl: uploadMock })) },
  },
}));

import SphorixConnectPanel from '@/components/integrations/SphorixConnectPanel';

describe('console Sphorix Connect', () => {
  let transferListCalls;

  beforeEach(() => {
    requestMock.mockReset();
    uploadMock.mockReset();
    transferListCalls = 0;
    uploadMock.mockResolvedValue({ error: null });
    vi.stubGlobal('crypto', { randomUUID: () => 'request-12345678' });
    requestMock.mockImplementation(async (path, options = {}) => {
      if (path === '/api/v1/connections' && options.method !== 'POST') {
        return { connections: [{ id: 'connection-1', display_name: 'Import comptable' }] };
      }
      if (path === '/api/v1/connections' && options.method === 'POST') {
        return { connection: { id: 'connection-1', display_name: 'Import comptable' } };
      }
      if (path === '/api/v1/transfers' && options.method !== 'POST') {
        transferListCalls += 1;
        return {
          transfers: transferListCalls === 1 ? [] : [{
            id: 'failed-transfer',
            status: 'partially_succeeded',
            written_count: 3,
            ignored_count: 0,
            failed_count: 1,
          }],
        };
      }
      if (path === '/api/v1/transfers/failed-transfer') {
        return {
          transfer: { id: 'failed-transfer' },
          scopes: [],
          items: [{
            object_type: 'invoices',
            record_number: 4,
            status: 'failed',
            error_code: 'INVALID_AMOUNT',
            error_details: { field: 'amount_ttc' },
          }],
        };
      }
      if (path === '/api/v1/uploads') return { bucket: 'private', path: 'company-1/file.csv', token: 'upload-token' };
      if (path === '/api/v1/transfers/preview') {
        return { preview: { id: 'preview-1', source_file_name: 'tiers.csv', total_count: 1, valid_count: 1, duplicate_count: 0, invalid_count: 0 } };
      }
      if (path === '/api/v1/transfers' && options.method === 'POST') {
        return { transfer: { id: 'transfer-1', status: 'queued' } };
      }
      if (path === '/api/v1/transfers/transfer-1/process') {
        return { transfer: { id: 'transfer-1', status: 'succeeded', written_count: 1, ignored_count: 0, failed_count: 0 }, has_more: false };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('prévisualise puis confirme un import fichier avant son traitement', async () => {
    render(<SphorixConnectPanel />);

    const fileInput = await screen.findByLabelText('Fichier CSV ou JSON');
    fireEvent.change(fileInput, {
      target: { files: [new File(['Code;Type;Nom\nT-1;client;Client'], 'tiers.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le fichier' }));

    expect(await screen.findByText('Aperçu du transfert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’import des 1 éléments valides' }));

    expect(await screen.findByText(/Terminé · 1 importé/)).toBeInTheDocument();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith('/api/v1/transfers/preview', expect.objectContaining({
      method: 'POST',
      companyId: 'company-1',
      body: expect.objectContaining({ connection_id: 'connection-1' }),
    }));
    await waitFor(() => expect(requestMock).toHaveBeenCalledWith('/api/v1/transfers/transfer-1/process', expect.any(Object)));
    fireEvent.click(await screen.findByRole('button', { name: 'Voir les erreurs' }));
    expect(await screen.findByText('Ligne 4 · INVALID_AMOUNT · Champ : amount_ttc')).toBeInTheDocument();
  });
});