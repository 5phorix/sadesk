import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isIntegrationConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
);

/** Client service_role : contourne RLS, uniquement pour preparer/nettoyer les fixtures. */
export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client anonyme non authentifie. */
export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const createdUserIds = [];
const createdCompanyIds = [];

const TEST_PASSWORD = 'Test-Passw0rd!2024';

/** Cree un utilisateur confirme et retourne un client Supabase authentifie en son nom. */
export async function createTestUser(label) {
  const admin = adminClient();
  const email = `vitest+${label}-${crypto.randomUUID()}@example.test`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;

  return { id: data.user.id, email, client };
}

/** Cree une societe de test. */
export async function createTestCompany(name) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('companies')
    .insert({ name: `${name}-${crypto.randomUUID().slice(0, 8)}` })
    .select()
    .single();
  if (error) throw error;
  createdCompanyIds.push(data.id);
  return data;
}

/** Rattache un utilisateur a une societe avec un role donne. */
export async function addMember(companyId, user, role, status = 'active') {
  const admin = adminClient();
  const { error } = await admin.from('company_users').insert({
    company_id: companyId,
    user_id: user.id,
    user_email: user.email,
    role,
    status,
  });
  if (error) throw error;
}

/** Insere une ecriture comptable via service_role (contourne RLS). */
export async function seedEntry(companyId, overrides = {}) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('accounting_entries')
    .insert({
      company_id: companyId,
      date: '2024-01-15',
      journal: 'OD',
      account_code: '607000',
      label: 'Ecriture de test',
      debit: 100,
      credit: 0,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Supprime toutes les fixtures creees pendant la suite. */
export async function cleanupFixtures() {
  const admin = adminClient();
  for (const companyId of createdCompanyIds.splice(0)) {
    await admin.from('companies').delete().eq('id', companyId);
  }
  for (const userId of createdUserIds.splice(0)) {
    await admin.auth.admin.deleteUser(userId);
  }
}
