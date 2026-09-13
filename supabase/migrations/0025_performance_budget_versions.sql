-- Versionnement des budgets sans écrasement silencieux.
create table public.performance_budget_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  version integer not null,
  total_amount numeric(14, 2) not null default 0,
  monthly_amounts jsonb not null default '{}'::jsonb,
  reason text,
  status text not null default 'draft',
  valid_from date not null,
  valid_to date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (budget_id, version),
  constraint performance_budget_versions_status_check check (status in ('draft', 'active', 'superseded')),
  constraint performance_budget_versions_dates_check check (valid_to is null or valid_to >= valid_from)
);

alter table public.performance_budget_versions enable row level security;
create policy performance_budget_versions_member on public.performance_budget_versions for select using (public.is_company_member(company_id));
create policy performance_budget_versions_editor on public.performance_budget_versions for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create index performance_budget_versions_budget_idx on public.performance_budget_versions(budget_id, version desc);
