import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
  seedEntry,
} from './helpers';

const newEntry = (companyId, label) => ({
  company_id: companyId,
  date: '2024-03-01',
  journal: 'OD',
  account_code: '607000',
  label,
  debit: 120,
  credit: 0,
});

describe.skipIf(!isIntegrationConfigured)('Permissions par role', () => {
  let company;
  const users = {};
  let existingEntry;

  beforeAll(async () => {
    company = await createTestCompany('roles');

    for (const role of ['viewer', 'accountant', 'admin', 'owner']) {
      users[role] = await createTestUser(`role-${role}`);
      await addMember(company.id, users[role], role);
    }

    existingEntry = await seedEntry(company.id, { label: 'Ecriture existante' });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  describe.each(['viewer', 'accountant', 'admin', 'owner'])('role %s', (role) => {
    it('peut lire les ecritures de sa societe', async () => {
      const { data, error } = await users[role].client
        .from('accounting_entries')
        .select('id')
        .eq('company_id', company.id);

      expect(error).toBeNull();
      expect(data.map((entry) => entry.id)).toContain(existingEntry.id);
    });
  });

  it('viewer ne peut pas creer d ecriture', async () => {
    const { error } = await users.viewer.client
      .from('accounting_entries')
      .insert(newEntry(company.id, 'Creation viewer'));

    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
  });

  it('viewer ne peut pas modifier une ecriture', async () => {
    const { data, error } = await users.viewer.client
      .from('accounting_entries')
      .update({ label: 'Modification viewer' })
      .eq('id', existingEntry.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('viewer ne peut pas supprimer une ecriture', async () => {
    const { data, error } = await users.viewer.client
      .from('accounting_entries')
      .delete()
      .eq('id', existingEntry.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  describe.each(['accountant', 'admin', 'owner'])('role %s (editeur)', (role) => {
    it('peut creer puis supprimer une ecriture', async () => {
      const client = users[role].client;

      const { data: created, error: insertError } = await client
        .from('accounting_entries')
        .insert(newEntry(company.id, `Creation ${role}`))
        .select()
        .single();

      expect(insertError).toBeNull();
      expect(created.company_id).toBe(company.id);

      const { error: updateError } = await client
        .from('accounting_entries')
        .update({ label: `Modification ${role}` })
        .eq('id', created.id);
      expect(updateError).toBeNull();

      const { error: deleteError } = await client
        .from('accounting_entries')
        .delete()
        .eq('id', created.id);
      expect(deleteError).toBeNull();
    });
  });

  it('viewer et accountant ne peuvent pas gerer les membres', async () => {
    for (const role of ['viewer', 'accountant']) {
      const { error } = await users[role].client.from('company_users').insert({
        company_id: company.id,
        user_email: `intrus-${role}@example.test`,
        role: 'admin',
        status: 'active',
      });

      expect(error, `role ${role}`).not.toBeNull();
      expect(error.code, `role ${role}`).toBe('42501');
    }
  });

  describe.each(['admin', 'owner'])('role %s (administration)', (role) => {
    it('peut inviter un membre', async () => {
      const { data, error } = await users[role].client
        .from('company_users')
        .insert({
          company_id: company.id,
          user_email: `invite-${role}-${crypto.randomUUID().slice(0, 8)}@example.test`,
          role: 'viewer',
          status: 'pending',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.role).toBe('viewer');
    });
  });

  it('un role invalide est refuse par la contrainte SQL', async () => {
    const { error } = await users.owner.client.from('company_users').insert({
      company_id: company.id,
      user_email: `role-invalide-${crypto.randomUUID().slice(0, 8)}@example.test`,
      role: 'superadmin',
      status: 'active',
    });

    expect(error).not.toBeNull();
  });
});
