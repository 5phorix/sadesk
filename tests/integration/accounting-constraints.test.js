import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
} from './helpers';

const line = (companyId, entryNumber, overrides = {}) => ({
  company_id: companyId,
  entry_number: entryNumber,
  date: '2024-04-01',
  journal: 'AC',
  account_code: '607000',
  label: 'Ligne de test',
  debit: 0,
  credit: 0,
  ...overrides,
});

describe.skipIf(!isIntegrationConfigured)('Contraintes comptables et equilibre des ecritures', () => {
  let company;
  let owner;

  beforeAll(async () => {
    company = await createTestCompany('contraintes');
    owner = await createTestUser('contraintes-owner');
    await addMember(company.id, owner, 'owner');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuse un montant negatif', async () => {
    const { error } = await owner.client
      .from('accounting_entries')
      .insert(line(company.id, 'NEG-1', { debit: -10 }));

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse une ligne avec debit et credit simultanes', async () => {
    const { error } = await owner.client
      .from('accounting_entries')
      .insert(line(company.id, 'BOTH-1', { debit: 100, credit: 100 }));

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse une ligne a montant nul', async () => {
    const { error } = await owner.client
      .from('accounting_entries')
      .insert(line(company.id, 'ZERO-1'));

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse une facture dont le TTC ne correspond pas au HT + TVA', async () => {
    const { error } = await owner.client.from('invoices').insert({
      company_id: company.id,
      invoice_number: `INCOHERENT-${crypto.randomUUID().slice(0, 8)}`,
      type: 'fournisseur',
      date: '2024-04-01',
      amount_ht: 100,
      tva_rate: 20,
      amount_tva: 20,
      amount_ttc: 500,
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('refuse un taux de TVA hors bornes', async () => {
    const { error } = await owner.client.from('invoices').insert({
      company_id: company.id,
      invoice_number: `TVA-${crypto.randomUUID().slice(0, 8)}`,
      type: 'fournisseur',
      date: '2024-04-01',
      amount_ht: 100,
      tva_rate: 250,
      amount_tva: 0,
      amount_ttc: 100,
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
  });

  it('accepte une piece equilibree et la valide', async () => {
    const entryNumber = `AC-OK-${crypto.randomUUID().slice(0, 8)}`;

    const { error: insertError } = await owner.client.from('accounting_entries').insert([
      line(company.id, entryNumber, { debit: 100, account_code: '607000' }),
      line(company.id, entryNumber, { credit: 100, account_code: '401000' }),
    ]);
    expect(insertError).toBeNull();

    const { data, error } = await owner.client.rpc('validate_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: entryNumber,
    });

    expect(error).toBeNull();
    expect(data).toBe(2);
  });

  it('refuse la validation d une piece desequilibree', async () => {
    const entryNumber = `AC-KO-${crypto.randomUUID().slice(0, 8)}`;

    const { error: insertError } = await owner.client.from('accounting_entries').insert([
      line(company.id, entryNumber, { debit: 100, account_code: '607000' }),
      line(company.id, entryNumber, { credit: 60, account_code: '401000' }),
    ]);
    expect(insertError).toBeNull();

    const { error } = await owner.client.rpc('validate_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: entryNumber,
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/not balanced/i);
  });

  it('refuse a un viewer la validation d une piece', async () => {
    const viewer = await createTestUser('contraintes-viewer');
    await addMember(company.id, viewer, 'viewer');

    const entryNumber = `AC-VIEW-${crypto.randomUUID().slice(0, 8)}`;
    await owner.client.from('accounting_entries').insert([
      line(company.id, entryNumber, { debit: 40, account_code: '607000' }),
      line(company.id, entryNumber, { credit: 40, account_code: '401000' }),
    ]);

    const { error } = await viewer.client.rpc('validate_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: entryNumber,
    });

    expect(error).not.toBeNull();
  });

  it('interdit de desequilibrer une piece deja validee', async () => {
    const entryNumber = `AC-LOCK-${crypto.randomUUID().slice(0, 8)}`;

    const { data: lines } = await owner.client
      .from('accounting_entries')
      .insert([
        line(company.id, entryNumber, { debit: 80, account_code: '607000' }),
        line(company.id, entryNumber, { credit: 80, account_code: '401000' }),
      ])
      .select();

    await owner.client.rpc('validate_accounting_entry', {
      target_company_id: company.id,
      target_entry_number: entryNumber,
    });

    const { error } = await owner.client
      .from('accounting_entries')
      .update({ debit: 500 })
      .eq('id', lines[0].id);

    expect(error).not.toBeNull();
  });
});
