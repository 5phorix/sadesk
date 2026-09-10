import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  adminClient,
  anonClient,
  cleanupFixtures,
  createTestCompany,
  createTestUser,
  isIntegrationConfigured,
} from './helpers';

describe.skipIf(!isIntegrationConfigured)('Invitations', () => {
  let company;
  let owner;

  beforeAll(async () => {
    company = await createTestCompany('invitations');
    owner = await createTestUser('invit-owner');
    await addMember(company.id, owner, 'owner');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('rattache une invitation en attente a l inscription', async () => {
    const admin = adminClient();
    const email = `vitest+invite-${crypto.randomUUID()}@example.test`;

    // Invitation emise avant que le compte n'existe.
    const { error: inviteError } = await admin.from('company_users').insert({
      company_id: company.id,
      user_id: null,
      user_email: email,
      role: 'accountant',
      status: 'pending',
      invited_by: owner.email,
    });
    expect(inviteError).toBeNull();

    const { data: created, error: signUpError } = await admin.auth.admin.createUser({
      email,
      password: 'Test-Passw0rd!2024',
      email_confirm: true,
    });
    expect(signUpError).toBeNull();

    const { data: membership } = await admin
      .from('company_users')
      .select('user_id, status, accepted_at')
      .eq('company_id', company.id)
      .eq('user_email', email)
      .single();

    expect(membership.user_id).toBe(created.user.id);
    expect(membership.status).toBe('active');
    expect(membership.accepted_at).not.toBeNull();

    // L'invite accede reellement aux donnees de la societe.
    const client = anonClient();
    await client.auth.signInWithPassword({ email, password: 'Test-Passw0rd!2024' });
    const { data: rows, error } = await client
      .from('company_users')
      .select('id')
      .eq('company_id', company.id);

    expect(error).toBeNull();
    expect(rows.length).toBeGreaterThan(0);

    await admin.auth.admin.deleteUser(created.user.id);
  });

  it('positionne la societe active de l invite', async () => {
    const admin = adminClient();
    const email = `vitest+active-${crypto.randomUUID()}@example.test`;

    await admin.from('company_users').insert({
      company_id: company.id,
      user_email: email,
      role: 'viewer',
      status: 'pending',
    });

    const { data: created } = await admin.auth.admin.createUser({
      email,
      password: 'Test-Passw0rd!2024',
      email_confirm: true,
    });

    const { data: profile } = await admin
      .from('profiles')
      .select('active_company_id')
      .eq('id', created.user.id)
      .single();

    expect(profile.active_company_id).toBe(company.id);
    await admin.auth.admin.deleteUser(created.user.id);
  });

  it('ne rattache que les invitations de la bonne adresse', async () => {
    const admin = adminClient();
    const otherEmail = `vitest+autre-${crypto.randomUUID()}@example.test`;

    await admin.from('company_users').insert({
      company_id: company.id,
      user_email: otherEmail,
      role: 'viewer',
      status: 'pending',
    });

    const { data: created } = await admin.auth.admin.createUser({
      email: `vitest+tiers-${crypto.randomUUID()}@example.test`,
      password: 'Test-Passw0rd!2024',
      email_confirm: true,
    });

    const { data: untouched } = await admin
      .from('company_users')
      .select('user_id, status')
      .eq('company_id', company.id)
      .eq('user_email', otherEmail)
      .single();

    expect(untouched.user_id).toBeNull();
    expect(untouched.status).toBe('pending');

    await admin.auth.admin.deleteUser(created.user.id);
  });
});

describe.skipIf(!isIntegrationConfigured)('Permissions par fonctionnalité', () => {
  let company;
  let owner;
  let accountant;
  let viewer;

  beforeAll(async () => {
    company = await createTestCompany('permissions');
    [owner, accountant, viewer] = await Promise.all([
      createTestUser('perm-owner'),
      createTestUser('perm-accountant'),
      createTestUser('perm-viewer'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, accountant, 'accountant');
    await addMember(company.id, viewer, 'viewer');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('accorde les droits par defaut du role', async () => {
    const { data: canDelete } = await owner.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'entries',
      target_action: 'delete',
    });
    expect(canDelete).toBe(true);

    const { data: accountantDelete } = await accountant.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'entries',
      target_action: 'delete',
    });
    expect(accountantDelete).toBe(false);
  });

  it('refuse les fonctionnalites fermees au lecteur', async () => {
    const { data } = await viewer.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'settings',
      target_action: 'update',
    });
    expect(data).toBe(false);
  });

  it('applique une surcharge restrictive', async () => {
    const admin = adminClient();
    await admin
      .from('company_users')
      .update({ permissions: { invoices: ['read'] } })
      .eq('company_id', company.id)
      .eq('user_id', accountant.id);

    const { data: canCreate } = await accountant.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'invoices',
      target_action: 'create',
    });
    expect(canCreate).toBe(false);

    const { data: canRead } = await accountant.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'invoices',
      target_action: 'read',
    });
    expect(canRead).toBe(true);
  });

  it('ne laisse pas une surcharge etendre le role', async () => {
    const admin = adminClient();
    await admin
      .from('company_users')
      .update({ permissions: { entries: ['read', 'create', 'update', 'delete'] } })
      .eq('company_id', company.id)
      .eq('user_id', viewer.id);

    const { data } = await viewer.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'entries',
      target_action: 'delete',
    });
    expect(data).toBe(false);
  });

  it('refuse tout a un non-membre', async () => {
    const outsider = await createTestUser('perm-outsider');
    const { data } = await outsider.client.rpc('has_feature_permission', {
      target_company_id: company.id,
      target_feature: 'invoices',
      target_action: 'read',
    });
    expect(data).toBe(false);
  });
});

describe.skipIf(!isIntegrationConfigured)("Journal d'audit", () => {
  let company;
  let owner;
  let viewer;

  beforeAll(async () => {
    company = await createTestCompany('audit');
    [owner, viewer] = await Promise.all([
      createTestUser('audit-owner'),
      createTestUser('audit-viewer'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, viewer, 'viewer');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('trace la creation puis la modification', async () => {
    const { data: created } = await owner.client
      .from('third_parties')
      .insert({ company_id: company.id, name: 'Client Audit', type: 'client' })
      .select()
      .single();

    await owner.client
      .from('third_parties')
      .update({ name: 'Client Audit Modifie' })
      .eq('id', created.id);

    const { data: logs, error } = await owner.client
      .from('audit_logs')
      .select('*')
      .eq('company_id', company.id)
      .eq('entity_id', created.id)
      .order('created_at');

    expect(error).toBeNull();
    expect(logs.map((log) => log.action)).toEqual(['insert', 'update']);

    const update = logs[1];
    expect(update.changes.name).toEqual(['Client Audit', 'Client Audit Modifie']);
    expect(update.user_email).toBe(owner.email);
  });

  it('ne trace que les champs reellement modifies', async () => {
    const { data: created } = await owner.client
      .from('third_parties')
      .insert({ company_id: company.id, name: 'Sans changement', type: 'client' })
      .select()
      .single();

    await owner.client
      .from('third_parties')
      .update({ name: 'Sans changement' })
      .eq('id', created.id);

    const { data: logs } = await owner.client
      .from('audit_logs')
      .select('action')
      .eq('entity_id', created.id);

    // Une mise a jour sans changement fonctionnel ne doit pas polluer le journal.
    expect(logs.map((log) => log.action)).toEqual(['insert']);
  });

  it('trace la suppression', async () => {
    const { data: created } = await owner.client
      .from('third_parties')
      .insert({ company_id: company.id, name: 'A supprimer', type: 'client' })
      .select()
      .single();

    await owner.client.from('third_parties').delete().eq('id', created.id);

    const { data: logs } = await owner.client
      .from('audit_logs')
      .select('action, entity_label')
      .eq('entity_id', created.id);

    expect(logs.map((log) => log.action)).toContain('delete');
  });

  it('reserve la lecture du journal aux administrateurs', async () => {
    const { data, error } = await viewer.client.from('audit_logs').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('interdit toute ecriture directe dans le journal', async () => {
    const { error } = await owner.client.from('audit_logs').insert({
      company_id: company.id,
      action: 'insert',
      entity_type: 'fake',
    });
    expect(error).not.toBeNull();
  });

  it('cloisonne le journal entre societes', async () => {
    const other = await createTestCompany('audit-autre');
    const user = await createTestUser('audit-autre-owner');
    await addMember(other.id, user, 'owner');

    const { data, error } = await user.client.from('audit_logs').select('id, company_id');

    expect(error).toBeNull();
    // Il voit les traces de sa propre societe, jamais celles d'une autre.
    expect(data.every((log) => log.company_id === other.id)).toBe(true);
    expect(data.some((log) => log.company_id === company.id)).toBe(false);
  });
});

describe.skipIf(!isIntegrationConfigured)('Archivage des sociétés', () => {
  let company;
  let owner;
  let accountant;

  beforeAll(async () => {
    company = await createTestCompany('archivage');
    [owner, accountant] = await Promise.all([
      createTestUser('archive-owner'),
      createTestUser('archive-accountant'),
    ]);
    await addMember(company.id, owner, 'owner');
    await addMember(company.id, accountant, 'accountant');
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuse l archivage a un comptable', async () => {
    const { error } = await accountant.client.rpc('archive_company', {
      target_company_id: company.id,
    });
    expect(error).not.toBeNull();
  });

  it('archive la societe', async () => {
    const { data, error } = await owner.client.rpc('archive_company', {
      target_company_id: company.id,
      target_reason: 'Cessation',
    });

    expect(error).toBeNull();
    expect(data.archived_at).not.toBeNull();
    expect(data.is_active).toBe(false);
  });

  it('fige les ecritures d une societe archivee', async () => {
    const { error } = await owner.client.from('third_parties').insert({
      company_id: company.id,
      name: 'Interdit',
      type: 'client',
    });

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/archived/i);
  });

  it('laisse les donnees consultables', async () => {
    const { error } = await owner.client
      .from('accounting_entries')
      .select('id')
      .eq('company_id', company.id);
    expect(error).toBeNull();
  });

  it('restaure la societe et libere les ecritures', async () => {
    const { data, error } = await owner.client.rpc('restore_company', {
      target_company_id: company.id,
    });
    expect(error).toBeNull();
    expect(data.archived_at).toBeNull();

    const { error: insertError } = await owner.client.from('third_parties').insert({
      company_id: company.id,
      name: 'De nouveau autorise',
      type: 'client',
    });
    expect(insertError).toBeNull();
  });
});
