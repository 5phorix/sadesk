-- Donnees de demonstration locales uniquement.
-- Connexion: demo@sadesk.local / Demo1234!

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'demo@sadesk.local',
  crypt('Demo1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Utilisateur Demo"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'demo@sadesk.local',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"demo@sadesk.local"}'::jsonb,
  'email',
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

insert into public.companies (
  id,
  name,
  siret,
  tva_number,
  address,
  postal_code,
  city,
  country,
  owner_email,
  accounting_plan,
  fiscal_year_start
)
values (
  '00000000-0000-0000-0000-000000000010',
  'Sadesk Demo',
  '12345678900010',
  'FR00123456789',
  '1 rue de la Demo',
  '75001',
  'Paris',
  'FR',
  'demo@sadesk.local',
  'PCG',
  '01-01'
)
on conflict (id) do nothing;

insert into public.company_users (
  company_id,
  user_id,
  user_email,
  user_name,
  role,
  status
)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'demo@sadesk.local',
  'Utilisateur Demo',
  'owner',
  'active'
)
on conflict (company_id, user_email) do update set
  user_id = excluded.user_id,
  status = excluded.status,
  role = excluded.role;

update public.profiles
set active_company_id = '00000000-0000-0000-0000-000000000010',
    display_name = 'Utilisateur Demo'
where id = '00000000-0000-0000-0000-000000000001';

insert into public.accounts (
  company_id, code, label, class, parent_code, type, category,
  is_auxiliary, is_active, plan_code, review_required
)
select
  '00000000-0000-0000-0000-000000000010', code, label, class, parent_code, type, category,
  is_auxiliary, is_active, plan_code, review_required
from public.accounting_plan_catalog
where plan_code = 'PCG'
on conflict (company_id, code) do nothing;

insert into public.accounts (company_id, code, label, class, type, category)
values
  ('00000000-0000-0000-0000-000000000010', '401', 'Fournisseurs', '4', 'tiers', 'passif'),
  ('00000000-0000-0000-0000-000000000010', '411', 'Clients', '4', 'tiers', 'actif'),
  ('00000000-0000-0000-0000-000000000010', '44566', 'TVA deductible', '4', 'tva', 'actif'),
  ('00000000-0000-0000-0000-000000000010', '44571', 'TVA collectee', '4', 'tva', 'passif'),
  ('00000000-0000-0000-0000-000000000010', '607', 'Achats de marchandises', '6', 'charge', 'charge'),
  ('00000000-0000-0000-0000-000000000010', '707', 'Ventes de marchandises', '7', 'produit', 'produit')
on conflict (company_id, code) do nothing;

insert into public.third_parties (
  id,
  company_id,
  code,
  type,
  name,
  email,
  payment_terms
)
values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000010',
  'CLI-001',
  'client',
  'Client Demo',
  'client@sadesk.local',
  30
)
on conflict (id) do nothing;

insert into public.invoices (
  id,
  company_id,
  invoice_number,
  type,
  date,
  due_date,
  third_party_id,
  third_party_name,
  description,
  amount_ht,
  tva_rate,
  amount_tva,
  amount_ttc,
  status
)
values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000010',
  'FAC-DEMO-001',
  'client',
  current_date,
  current_date + 30,
  '00000000-0000-0000-0000-000000000020',
  'Client Demo',
  'Prestation de demonstration',
  1000,
  20,
  200,
  1200,
  'validee'
)
on conflict (id) do nothing;

insert into public.accounting_entries (
  company_id,
  entry_number,
  date,
  journal,
  account_code,
  account_label,
  label,
  debit,
  credit,
  reference,
  third_party_id,
  invoice_id,
  third_party_name,
  is_validated
)
values
  ('00000000-0000-0000-0000-000000000010', 'VE-FAC-DEMO-001', current_date, 'VE', '411', 'Clients', 'Facture FAC-DEMO-001', 1200, 0, 'FAC-DEMO-001', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030', 'Client Demo', false),
  ('00000000-0000-0000-0000-000000000010', 'VE-FAC-DEMO-001', current_date, 'VE', '707', 'Ventes de marchandises', 'Facture FAC-DEMO-001', 0, 1000, 'FAC-DEMO-001', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030', 'Client Demo', false),
  ('00000000-0000-0000-0000-000000000010', 'VE-FAC-DEMO-001', current_date, 'VE', '44571', 'TVA collectee', 'TVA Facture FAC-DEMO-001', 0, 200, 'FAC-DEMO-001', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030', 'Client Demo', false);
