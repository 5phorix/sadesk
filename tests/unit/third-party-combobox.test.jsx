/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThirdPartyCombobox from '@/components/common/ThirdPartyCombobox';

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = () => {};
afterEach(cleanup);

describe('ThirdPartyCombobox', () => {
  const parties = [
    { id: 'client-1', name: 'Acme Conseil', code: 'CLI-001' },
    { id: 'client-2', name: 'Atelier Nord', code: 'CLI-002' },
  ];

  it('filters existing clients and selects the chosen client', async () => {
    const onSelect = vi.fn();
    render(<ThirdPartyCombobox parties={parties} value="" onSelect={onSelect} onCreate={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('combobox')[0]);
    fireEvent.change(screen.getByPlaceholderText('Rechercher un client...'), {
      target: { value: 'acme' },
    });

    expect(await screen.findByText('Acme Conseil')).toBeTruthy();
    expect(screen.queryByText('Atelier Nord')).toBeNull();

    fireEvent.click(screen.getByText('Acme Conseil'));
    expect(onSelect).toHaveBeenCalledWith('client-1');
  });

  it('offers to create a client when no existing name matches', async () => {
    const onCreate = vi.fn();
    render(<ThirdPartyCombobox parties={parties} value="" onSelect={vi.fn()} onCreate={onCreate} />);

    fireEvent.click(screen.getAllByRole('combobox')[0]);
    fireEvent.change(screen.getByPlaceholderText('Rechercher un client...'), {
      target: { value: 'Nouveau client' },
    });

    const createOption = await screen.findByText(/Créer ce client dans Tiers/);
    expect(createOption.textContent).toContain('Nouveau client');
    fireEvent.click(createOption);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Nouveau client'));
  });
});
