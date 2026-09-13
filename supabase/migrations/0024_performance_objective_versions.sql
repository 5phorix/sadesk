-- Historisation des versions d'objectifs de performance.
create table public.performance_objective_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  objective_id uuid not null references public.performance_objectives(id) on delete cascade,
  version integer not null,
  target_value numeric(14, 2) not null,
  monthly_targets jsonb not null default '{}'::jsonb,
  reason text,
  status text not null default 'draft',
  valid_from date not null,
  valid_to date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (objective_id, version),
  constraint performance_objective_versions_status_check check (status in ('draft', 'active', 'superseded')),
  constraint performance_objective_versions_dates_check check (valid_to is null or valid_to >= valid_from)
);

alter table public.performance_objective_versions enable row level security;
create policy performance_objective_versions_member on public.performance_objective_versions for select using (public.is_company_member(company_id));
create policy performance_objective_versions_editor on public.performance_objective_versions for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create index performance_objective_versions_objective_idx on public.performance_objective_versions(objective_id, version desc);
