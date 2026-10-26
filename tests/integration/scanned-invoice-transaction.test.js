import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  adminClient,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
} from './helpers';

describe.skipIf(!isIntegrationConfigured)('Création atomique des factures scannées', () => {
  let admin;
  let company;
  let user;

  beforeAll(async () => {
    admin = adminClient();
    company = await createTestCompany('scanned-invoice');
    user = await createTestUser('scanned-invoice');
    await addMember(company.id, user, 'accountant');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  const payload = (invoiceNumber, entries) => ({
    target_invoice: {
      company_id: company.id,
      invoice_number: invoiceNumber,
      type: 'fournisseur',
      date: '2026-10-20',
      third_party_name: 'Fournisseur de test',
      amount_ht: 100,
      tva_rate: 20,
      amount_tva: 20,
      amount_ttc: 120,
      status: 'brouillon',
    },
    target_entries: entries,
  });

  const validEntries = () => [
    { journal: 'AC', account_code: '607000', debit: 100, credit: 0, label: 'Achat' },
    { journal: 'AC', account_code: '445660', debit: 20, credit: 0, label: 'TVA déductible' },
    { journal: 'AC', account_code: '401000', debit: 0, credit: 120, label: 'Fournisseur' },
  ];

  it('annule la facture si l’insertion des écritures échoue', async () => {
    const entries = validEntries();
    entries[1].journal = 'INVALID!';

    const { error } = await user.client.rpc(
      'create_scanned_invoice_with_entries',
      payload('SCAN-ROLLBACK-001', entries),
    );

    expect(error).not.toBeNull();
    const { count, error: queryError } = await admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('invoice_number', 'SCAN-ROLLBACK-001');

    expect(queryError).toBeNull();
    expect(count).toBe(0);
  });

  it('crée la facture et toutes ses écritures en brouillon', async () => {
    const { data: invoiceId, error } = await user.client.rpc(
      'create_scanned_invoice_with_entries',
      payload('SCAN-COMMIT-001', validEntries()),
    );

    expect(error).toBeNull();
    expect(invoiceId).toEqual(expect.any(String));

    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select('id, status, amount_ttc')
      .eq('id', invoiceId)
      .single();
    const { data: entries, error: entriesError } = await admin
      .from('accounting_entries')
      .select('invoice_id, debit, credit, is_validated')
      .eq('invoice_id', invoiceId);

    expect(invoiceError).toBeNull();
    expect(entriesError).toBeNull();
    expect(invoice).toMatchObject({ id: invoiceId, status: 'brouillon', amount_ttc: 120 });
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.is_validated === false)).toBe(true);
    expect(entries.reduce((sum, entry) => sum + Number(entry.debit), 0)).toBe(120);
    expect(entries.reduce((sum, entry) => sum + Number(entry.credit), 0)).toBe(120);
  });
});
