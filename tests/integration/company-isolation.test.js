import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
  seedEntry,
} from './helpers';

describe.skipIf(!isIntegrationConfigured)('Isolation des donnees entre societes', () => {
  let companyA;
  let companyB;
  let userA;
  let userB;
  let entryA;
  let entryB;

  beforeAll(async () => {
    [companyA, companyB] = await Promise.all([
      createTestCompany('societe-a'),
      createTestCompany('societe-b'),
    ]);
    [userA, userB] = await Promise.all([createTestUser('iso-a'), createTestUser('iso-b')]);
    await addMember(companyA.id, userA, 'owner');
    await addMember(companyB.id, userB, 'owner');
    entryA = await seedEntry(companyA.id, { label: 'Ecriture societe A' });
    entryB = await seedEntry(companyB.id, { label: 'Ecriture societe B' });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('un membre ne lit que les ecritures de sa societe', async () => {
    const { data, error } = await userA.client.from('accounting_entries').select('id, company_id');

    expect(error).toBeNull();
    expect(data.map((entry) => entry.id)).toContain(entryA.id);
    expect(data.map((entry) => entry.id)).not.toContain(entryB.id);
    expect(data.every((entry) => entry.company_id === companyA.id)).toBe(true);
  });

  it('un filtre explicite sur une autre societe ne retourne rien', async () => {
    const { data, error } = await userA.client
      .from('accounting_entries')
      .select('id')
      .eq('company_id', companyB.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('impossible de lire les factures d une autre societe', async () => {
    const { data, error } = await userB.client
      .from('invoices')
      .select('id')
      .eq('company_id', companyA.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('impossible d ecrire une ecriture dans une societe non rattachee', async () => {
    const { error } = await userA.client.from('accounting_entries').insert({
      company_id: companyB.id,
      date: '2024-02-01',
      journal: 'OD',
      account_code: '607000',
      label: 'Injection cross-tenant',
      debit: 50,
      credit: 0,
    });

    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
  });

  it('impossible de modifier une ecriture d une autre societe', async () => {
    const { data, error } = await userA.client
      .from('accounting_entries')
      .update({ label: 'Modifie depuis societe A' })
      .eq('id', entryB.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('impossible de supprimer une ecriture d une autre societe', async () => {
    const { data, error } = await userA.client
      .from('accounting_entries')
      .delete()
      .eq('id', entryB.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('un membre inactif perd l acces a la societe', async () => {
    const userC = await createTestUser('iso-c');
    await addMember(companyA.id, userC, 'accountant', 'inactive');

    const { data, error } = await userC.client.from('accounting_entries').select('id');

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
