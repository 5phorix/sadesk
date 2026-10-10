import { describe, expect, it } from 'vitest';
import { previewImport } from '../../api/v1/_lib/import-preview.js';

describe('apercu Sphorix Connect', () => {
  it('valide les factures et signale les doublons sans perdre leur numero de ligne', () => {
    const preview = previewImport({
      text: [
        'Numéro;Type;Date;Tiers;Montant HT;Montant TVA;Montant TTC;TVA %',
        'FAC-1;fournisseur;2026-10-10;Fournisseur A;100,00;20,00;120,00;20',
        'FAC-1;fournisseur;2026-10-10;Fournisseur A;100,00;20,00;120,00;20',
      ].join('\n'),
      objectType: 'invoices',
      format: 'csv',
    });

    expect(preview.summary).toMatchObject({
      total_count: 2,
      valid_count: 1,
      duplicate_count: 1,
      invalid_count: 0,
    });
    expect(preview.records[1].record_number).toBe(2);
    expect(preview.records[1].status).toBe('duplicate');
  });

  it('signale les lignes incompletes au lieu de les completer silencieusement', () => {
    const preview = previewImport({
      text: '[{"name":"Client A","role":"customer"}]',
      objectType: 'third_parties',
      format: 'json',
    });

    expect(preview.summary.invalid_count).toBe(1);
    expect(preview.summary.errors).toContainEqual({
      record_number: 1,
      code: 'STABLE_EXTERNAL_ID_REQUIRED',
      field: 'external_id',
    });
  });

  it('valide un payload canonique de tiers et mappe son role', () => {
    const preview = previewImport({
      text: JSON.stringify({
        third_parties: [{ external_id: 'source-1', role: 'supplier', name: 'Fournisseur A' }],
      }),
      objectType: 'third_parties',
      format: 'json',
    });

    expect(preview.summary.valid_count).toBe(1);
    expect(preview.records[0].data.type).toBe('fournisseur');
  });

  it('preserve le lien de contrepartie d une facture canonique', () => {
    const preview = previewImport({
      text: JSON.stringify({
        invoices: [{
          external_id: 'invoice-1',
          invoice_number: 'FAC-1',
          direction: 'inbound',
          issue_date: '2026-10-10',
          tax_rate: '20.000',
          counterparty: { external_id: 'supplier-1', name: 'Fournisseur A' },
          totals: { net: '100.00', tax: '20.00', gross: '120.00' },
        }],
      }),
      objectType: 'invoices',
      format: 'json',
    });

    expect(preview.summary.valid_count).toBe(1);
    expect(preview.records[0].data).toMatchObject({
      type: 'fournisseur',
      counterparty_external_id: 'supplier-1',
    });
  });

  it('rejette une precision monetaire que le schema cible ne peut pas conserver', () => {
    const preview = previewImport({
      text: [
        'Numéro;Type;Date;Tiers;Montant HT;Montant TVA;Montant TTC;TVA %',
        'FAC-1;fournisseur;2026-10-10;Fournisseur A;100,001;20,00;120,001;20',
      ].join('\n'),
      objectType: 'invoices',
      format: 'csv',
    });

    expect(preview.summary.invalid_count).toBe(1);
    expect(preview.summary.errors.map((error) => error.field)).toContain('amount_ht');
  });

  it('signale une facture dont la devise differe de celle de la societe', () => {
    const preview = previewImport({
      text: JSON.stringify({
        invoices: [{
          invoice_number: 'FAC-1',
          type: 'fournisseur',
          date: '2026-10-10',
          currency: 'EUR',
          third_party_name: 'Fournisseur A',
          amount_ht: '100.00',
          amount_tva: '20.00',
          amount_ttc: '120.00',
          tva_rate: '20',
        }],
      }),
      objectType: 'invoices',
      format: 'json',
      companyCurrency: 'XOF',
    });

    expect(preview.summary.invalid_count).toBe(1);
    expect(preview.summary.errors[0]).toMatchObject({
      code: 'CURRENCY_NOT_SUPPORTED',
      field: 'currency',
    });
  });

  it('rejette un separateur CSV non pris en charge', () => {
    expect(() => previewImport({
      text: 'a^b',
      objectType: 'third_parties',
      format: 'csv',
      separator: '^',
    })).toThrow('Unsupported CSV separator.');
  });
});