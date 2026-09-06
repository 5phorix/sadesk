create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  active_company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12, 2) not null default 0,
  price_monthly numeric(12, 2) not null default 0,
  price_yearly numeric(12, 2) not null default 0,
  billing_period text not null default 'monthly',
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_billing_period_check check (billing_period in ('monthly', 'quarterly', 'yearly'))
);

insert into public.subscription_plans (name, slug, description, price_monthly, price_yearly, features, limits, display_order)
values
  ('Gratuit', 'gratuit', 'Parfait pour démarrer', 0, 0, '["1 société", "1 utilisateur", "10 factures par mois"]'::jsonb, '{"max_companies":1,"max_users_per_company":1,"max_invoices_per_month":10,"max_storage_mb":100}'::jsonb, 1),
  ('Starter', 'starter', 'Pour les petites entreprises', 9.99, 95.90, '["1 société", "3 utilisateurs", "50 factures par mois"]'::jsonb, '{"max_companies":1,"max_users_per_company":3,"max_invoices_per_month":50,"max_storage_mb":500}'::jsonb, 2),
  ('Pro', 'pro', 'Pour les entreprises en croissance', 19.99, 191.90, '["3 sociétés", "10 utilisateurs par société", "Factures illimitées"]'::jsonb, '{"max_companies":3,"max_users_per_company":10,"max_invoices_per_month":-1,"max_storage_mb":2000}'::jsonb, 3),
  ('Enterprise', 'enterprise', 'Pour les grandes organisations', 49, 470, '["Sociétés illimitées", "Utilisateurs illimités", "Toutes les fonctionnalités"]'::jsonb, '{"max_companies":-1,"max_users_per_company":-1,"max_invoices_per_month":-1,"max_storage_mb":-1}'::jsonb, 4)
on conflict (slug) do nothing;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  siret text,
  tva_number text,
  address text,
  postal_code text,
  city text,
  phone text,
  email text,
  website text,
  legal_form text,
  capital text,
  ape_code text,
  currency text not null default 'EUR',
  accounting_plan text,
  fiscal_year_start text,
  invoice_prefix text,
  invoice_notes text,
  country text not null default 'FR',
  logo_url text,
  owner_email text,
  is_active boolean not null default true,
  subscription_plan_id uuid references public.subscription_plans(id),
  subscription_plan_name text,
  subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_active_company_fk
  foreign key (active_company_id) references public.companies(id) on delete set null;

create table public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text not null,
  user_name text,
  role text not null default 'viewer',
  status text not null default 'pending',
  invited_by text,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_email),
  constraint company_users_role_check check (role in ('owner', 'admin', 'accountant', 'viewer')),
  constraint company_users_status_check check (status in ('pending', 'active', 'inactive'))
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.third_parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  type text not null default 'client',
  name text not null,
  contact_name text,
  email text,
  additional_emails jsonb not null default '[]'::jsonb,
  phone text,
  additional_phones jsonb not null default '[]'::jsonb,
  address text,
  address_line_2 text,
  postal_code text,
  city text,
  country text,
  siret text,
  siren text,
  tva_number text,
  legal_form text,
  website text,
  account_code text,
  payment_terms integer,
  payment_method text,
  bank_details jsonb not null default '{}'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint third_parties_type_check check (type in ('client', 'fournisseur'))
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  label text not null,
  class text,
  type text,
  category text,
  parent_code text,
  is_auxiliary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  type text not null default 'exploitation',
  budget_annual numeric(14, 2) not null default 0,
  responsible text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  year integer not null,
  start_date date,
  end_date date,
  status text not null default 'open',
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, year)
);

create unique index fiscal_years_one_current_per_company
  on public.fiscal_years(company_id)
  where is_current;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_number text not null,
  type text not null default 'client',
  date date not null,
  due_date date,
  third_party_id uuid references public.third_parties(id) on delete set null,
  third_party_name text,
  description text,
  amount_ht numeric(14, 2) not null default 0,
  tva_rate numeric(6, 3) not null default 0,
  amount_tva numeric(14, 2) not null default 0,
  amount_ttc numeric(14, 2) not null default 0,
  status text not null default 'brouillon',
  payment_method text,
  account_code text,
  notes text,
  file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number),
  constraint invoices_type_check check (type in ('client', 'fournisseur')),
  constraint invoices_status_check check (status in ('brouillon', 'validee', 'payee', 'annulee'))
);

create table public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_number text,
  date date not null,
  journal text not null default 'OD',
  account_code text not null,
  account_label text,
  label text,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  reference text,
  third_party_id uuid references public.third_parties(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  third_party_name text,
  lettering text,
  is_validated boolean not null default false,
  fiscal_year_id uuid references public.fiscal_years(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  cost_center_code text,
  cost_center_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  fiscal_year integer,
  period_type text not null default 'annual',
  category text not null default 'expense',
  account_code text,
  cost_center_code text,
  total_amount numeric(14, 2) not null default 0,
  alert_threshold numeric(5, 2),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_number text,
  third_party_id uuid references public.third_parties(id) on delete set null,
  third_party_name text,
  type text not null default 'expense',
  name text not null,
  description text,
  amount numeric(14, 2) not null default 0,
  frequency text not null default 'monthly',
  start_date date,
  end_date date,
  next_payment_date date,
  payment_method text,
  account_code text,
  status text not null default 'active',
  auto_generate_invoice boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_number text,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  third_party_id uuid references public.third_parties(id) on delete set null,
  third_party_name text,
  type text,
  amount numeric(14, 2) not null default 0,
  payment_date date,
  due_date date,
  payment_method text,
  status text not null default 'pending',
  reference text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_url text,
  statement_date date,
  bank_code text,
  account_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_statement_id uuid references public.bank_statements(id) on delete set null,
  bank_account text,
  transaction_date date not null,
  value_date date,
  description text,
  reference text,
  amount numeric(14, 2) not null default 0,
  balance_after numeric(14, 2),
  is_reconciled boolean not null default false,
  reconciled_entry_id uuid references public.accounting_entries(id) on delete set null,
  reconciliation_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  priority text not null default 'medium',
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  related_entity_name text,
  action_url text,
  trigger_date date,
  is_read boolean not null default false,
  is_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  invoice_reminder_days integer not null default 7,
  third_party_inactive_months integer not null default 12,
  send_email_notifications boolean not null default false,
  notification_email text,
  enabled_types jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium',
  assigned_to text,
  assigned_to_email text,
  assigned_to_name text,
  due_date date,
  completed_date date,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  file_url text not null,
  file_name text,
  file_size bigint,
  file_type text,
  category text,
  date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_name text not null,
  product_code text,
  quantity numeric(14, 3) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  total_value numeric(14, 2) not null default 0,
  min_quantity numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
      and cu.status = 'active'
  );
$$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
      and cu.status = 'active'
      and cu.role in ('owner', 'admin')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger companies_set_updated_at before update on public.companies
for each row execute procedure public.set_updated_at();

create trigger company_users_set_updated_at before update on public.company_users
for each row execute procedure public.set_updated_at();

create trigger roles_set_updated_at before update on public.roles
for each row execute procedure public.set_updated_at();

create trigger third_parties_set_updated_at before update on public.third_parties
for each row execute procedure public.set_updated_at();

create trigger accounts_set_updated_at before update on public.accounts
for each row execute procedure public.set_updated_at();

create trigger cost_centers_set_updated_at before update on public.cost_centers
for each row execute procedure public.set_updated_at();

create trigger fiscal_years_set_updated_at before update on public.fiscal_years
for each row execute procedure public.set_updated_at();

create trigger invoices_set_updated_at before update on public.invoices
for each row execute procedure public.set_updated_at();

create trigger accounting_entries_set_updated_at before update on public.accounting_entries
for each row execute procedure public.set_updated_at();

create trigger budgets_set_updated_at before update on public.budgets
for each row execute procedure public.set_updated_at();

create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute procedure public.set_updated_at();

create trigger payments_set_updated_at before update on public.payments
for each row execute procedure public.set_updated_at();

create trigger bank_statements_set_updated_at before update on public.bank_statements
for each row execute procedure public.set_updated_at();

create trigger bank_transactions_set_updated_at before update on public.bank_transactions
for each row execute procedure public.set_updated_at();

create trigger notifications_set_updated_at before update on public.notifications
for each row execute procedure public.set_updated_at();

create trigger notification_settings_set_updated_at before update on public.notification_settings
for each row execute procedure public.set_updated_at();

create trigger tasks_set_updated_at before update on public.tasks
for each row execute procedure public.set_updated_at();

create trigger documents_set_updated_at before update on public.documents
for each row execute procedure public.set_updated_at();

create trigger stock_items_set_updated_at before update on public.stock_items
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
create policy profiles_select_self on public.profiles for select using (id = auth.uid());
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.subscription_plans enable row level security;
create policy subscription_plans_select_active on public.subscription_plans for select using (is_active = true or public.is_company_admin((select active_company_id from public.profiles where id = auth.uid())));

alter table public.companies enable row level security;
create policy companies_select_member on public.companies for select using (public.is_company_member(id));
create policy companies_insert_authenticated on public.companies for insert to authenticated
with check (owner_email = (select email from public.profiles where id = auth.uid()));
create policy companies_update_admin on public.companies for update using (public.is_company_admin(id)) with check (public.is_company_admin(id));

alter table public.company_users enable row level security;
create policy company_users_select_member on public.company_users for select using (public.is_company_member(company_id) or user_id = auth.uid());
create policy company_users_insert_admin on public.company_users for insert
with check (
  public.is_company_admin(company_id)
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.owner_email = (select email from public.profiles where id = auth.uid())
    )
  )
);
create policy company_users_update_admin on public.company_users for update using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
create policy company_users_delete_admin on public.company_users for delete using (public.is_company_admin(company_id));

alter table public.roles enable row level security;
create policy roles_company_member on public.roles for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.third_parties enable row level security;
create policy third_parties_company_member on public.third_parties for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.accounts enable row level security;
create policy accounts_company_member on public.accounts for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.cost_centers enable row level security;
create policy cost_centers_company_member on public.cost_centers for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.fiscal_years enable row level security;
create policy fiscal_years_company_member on public.fiscal_years for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.invoices enable row level security;
create policy invoices_company_member on public.invoices for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.accounting_entries enable row level security;
create policy accounting_entries_company_member on public.accounting_entries for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.budgets enable row level security;
create policy budgets_company_member on public.budgets for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.subscriptions enable row level security;
create policy subscriptions_company_member on public.subscriptions for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.payments enable row level security;
create policy payments_company_member on public.payments for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.bank_statements enable row level security;
create policy bank_statements_company_member on public.bank_statements for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.bank_transactions enable row level security;
create policy bank_transactions_company_member on public.bank_transactions for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.notifications enable row level security;
create policy notifications_recipient_or_admin on public.notifications for all using (user_id = auth.uid() or public.is_company_admin(company_id)) with check (user_id = auth.uid() or public.is_company_admin(company_id));

alter table public.notification_settings enable row level security;
create policy notification_settings_company_admin on public.notification_settings for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

alter table public.tasks enable row level security;
create policy tasks_company_member on public.tasks for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.documents enable row level security;
create policy documents_company_member on public.documents for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

alter table public.stock_items enable row level security;
create policy stock_items_company_member on public.stock_items for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create policy documents_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'documents'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

create policy documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'documents'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

create policy documents_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'documents'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'documents'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

create policy documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'documents'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

create index company_users_user_id_idx on public.company_users(user_id);
create index company_users_company_id_idx on public.company_users(company_id);
create index invoices_company_id_date_idx on public.invoices(company_id, date desc);
create index accounting_entries_company_id_date_idx on public.accounting_entries(company_id, date desc);
create index bank_transactions_company_id_date_idx on public.bank_transactions(company_id, transaction_date desc);
create index notifications_user_id_unread_idx on public.notifications(user_id, is_read, is_dismissed);
