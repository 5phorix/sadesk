-- Historisation des calculs de coûts et de leurs hypothèses.
create table public.performance_costing_calculations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  object_type text not null,
  object_key text,
  method text not null,
  model_version integer not null default 1,
  inputs jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  period_start date,
  period_end date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.performance_costing_calculations enable row level security;
create policy performance_costing_calculations_member on public.performance_costing_calculations for select using (public.is_company_member(company_id));
create policy performance_costing_calculations_editor on public.performance_costing_calculations for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create index performance_costing_calculations_company_date_idx on public.performance_costing_calculations(company_id, created_at desc);
