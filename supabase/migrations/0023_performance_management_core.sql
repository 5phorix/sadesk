-- Noyau configurable du module de performance.
create table public.performance_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint performance_periods_dates_check check (period_end >= period_start),
  constraint performance_periods_status_check check (status in ('open', 'closed'))
);

create table public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  category text not null default 'financial',
  unit text not null default 'number',
  formula text not null,
  source text not null,
  periodicity text not null default 'monthly',
  target_value numeric(14, 2),
  warning_threshold numeric(14, 2),
  alert_threshold numeric(14, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.kpi_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kpi_id uuid not null references public.kpi_definitions(id) on delete cascade,
  period_id uuid references public.performance_periods(id) on delete set null,
  value numeric(14, 2) not null,
  target_value numeric(14, 2),
  source_snapshot jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (kpi_id, period_id)
);

create table public.performance_objectives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  dimension_type text not null default 'company',
  dimension_key text,
  period_start date not null,
  period_end date not null,
  target_value numeric(14, 2) not null,
  unit text not null default 'EUR',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_objectives_dates_check check (period_end >= period_start),
  constraint performance_objectives_status_check check (status in ('draft', 'active', 'closed'))
);

create table public.performance_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kpi_id uuid references public.kpi_definitions(id) on delete set null,
  level text not null default 'warning',
  title text not null,
  message text not null,
  value numeric(14, 2),
  threshold numeric(14, 2),
  object_type text,
  object_id uuid,
  status text not null default 'open',
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint performance_alerts_level_check check (level in ('info', 'warning', 'critical')),
  constraint performance_alerts_status_check check (status in ('open', 'acknowledged', 'resolved'))
);

create table public.performance_action_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alert_id uuid references public.performance_alerts(id) on delete set null,
  title text not null,
  problem text not null,
  cause text,
  action text not null,
  responsible_user_id uuid references auth.users(id) on delete set null,
  start_date date,
  due_date date,
  priority text not null default 'medium',
  status text not null default 'todo',
  expected_result text,
  actual_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_actions_priority_check check (priority in ('low', 'medium', 'high', 'critical')),
  constraint performance_actions_status_check check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled'))
);

alter table public.performance_periods enable row level security;
alter table public.kpi_definitions enable row level security;
alter table public.kpi_values enable row level security;
alter table public.performance_objectives enable row level security;
alter table public.performance_alerts enable row level security;
alter table public.performance_action_plans enable row level security;

create policy performance_periods_member on public.performance_periods for select using (public.is_company_member(company_id));
create policy performance_periods_editor on public.performance_periods for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy kpi_definitions_member on public.kpi_definitions for select using (public.is_company_member(company_id));
create policy kpi_definitions_editor on public.kpi_definitions for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy kpi_values_member on public.kpi_values for select using (public.is_company_member(company_id));
create policy kpi_values_editor on public.kpi_values for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy performance_objectives_member on public.performance_objectives for select using (public.is_company_member(company_id));
create policy performance_objectives_editor on public.performance_objectives for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy performance_alerts_member on public.performance_alerts for select using (public.is_company_member(company_id));
create policy performance_alerts_editor on public.performance_alerts for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy performance_action_plans_member on public.performance_action_plans for select using (public.is_company_member(company_id));
create policy performance_action_plans_editor on public.performance_action_plans for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));

create index performance_periods_company_dates_idx on public.performance_periods(company_id, period_start, period_end);
create index kpi_values_company_period_idx on public.kpi_values(company_id, calculated_at);
create index performance_alerts_company_status_idx on public.performance_alerts(company_id, status);
create index performance_actions_company_status_idx on public.performance_action_plans(company_id, status);
