import { describe, expect, it } from 'vitest';
import {
  buildScannedInvoiceEntries,
  updateScannedInvoice,
  validateScannedInvoice,
} from '@/lib/scanned-invoice';

const invoice = (overrides = {}) => ({
  invoice_number: 'FAC-001',
  supplier_name: 'Fournisseur Exemple',
  date: '2026-10-19',
  due_date: null,
  amount_ht: 100,
  amount_tva: 20,
  amount_ttc: 120,
  tva_rate: 20,
  ...overrides,
});

describe('factures scannées', () => {
  it('recalcule TVA et TTC après correction du montant HT', () => {
    expect(updateScannedInvoice(invoice(), 'amount_ht', '200')).toMatchObject({
      amount_ht: 200,
      amount_tva: 40,
      amount_ttc: 240,
    });
  });

  it('préserve un taux de TVA nul et accepte une échéance absente', () => {
    const exempt = updateScannedInvoice(invoice({ amount_tva: 0, amount_ttc: 100, tva_rate: 20 }), 'tva_rate', '0');

    expect(exempt).toMatchObject({ amount_tva: 0, amount_ttc: 100, tva_rate: '0' });
    expect(validateScannedInvoice(exempt)).toBeNull();
  });

  it('refuse une échéance antérieure à la date de facture', () => {
    expect(validateScannedInvoice(invoice({ due_date: '2026-10-18' })))
      .toBe("L'échéance ne peut pas précéder la date de facture.");
  });

  it.each(['achats', 'ventes'])('génère une pièce équilibrée sans ligne TVA nulle pour %s', (category) => {
    const entries = buildScannedInvoiceEntries(invoice({ amount_tva: 0, amount_ttc: 100, tva_rate: 0 }), category);

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.debit > 0 || entry.credit > 0)).toBe(true);
    expect(entries.reduce((sum, entry) => sum + entry.debit, 0)).toBe(100);
    expect(entries.reduce((sum, entry) => sum + entry.credit, 0)).toBe(100);
  });

  it('génère une ligne de TVA distincte quand elle est due', () => {
    const entries = buildScannedInvoiceEntries(invoice(), 'achats');

    expect(entries).toHaveLength(3);
    expect(entries.reduce((sum, entry) => sum + entry.debit, 0)).toBe(120);
    expect(entries.reduce((sum, entry) => sum + entry.credit, 0)).toBe(120);
  });
});