-- Controle de gestion : ventilation budgetaire mensuelle, parametres de pilotage
-- des alertes et des scenarios, et historique des clotures mensuelles.

-- ---------------------------------------------------------------------------
-- 1. Ventilation mensuelle des budgets
-- ---------------------------------------------------------------------------

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  month smallint not null,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_id, month),
  constraint budget_lines_month_range check (month between 1 and 12),
  constraint budget_lines_amount_non_negative check (amount >= 0)
);

create index if not exists budget_lines_company_budget_idx
  on public.budget_lines(company_id, budget_id);

alter table public.budgets
  add column if not exists warning_threshold numeric(5, 2),
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null;

alter table public.budgets
  drop constraint if exists budgets_total_amount_non_negative,
  drop constraint if exists budgets_alert_threshold_range,
  drop constraint if exists budgets_warning_threshold_range,
  drop constraint if exists budgets_category_check;

alter table public.budgets
  add constraint budgets_total_amount_non_negative check (total_amount >= 0) not valid,
  add constraint budgets_alert_threshold_range
    check (alert_threshold is null or alert_threshold between 0 and 200) not valid,
  add constraint budgets_warning_threshold_range
    check (warning_threshold is null or warning_threshold between 0 and 200) not valid,
  add constraint budgets_category_check
    check (category in ('revenue', 'expense', 'investment')) not valid;

-- ---------------------------------------------------------------------------
-- 2. Parametres de controle de gestion (seuils + scenarios)
-- ---------------------------------------------------------------------------

create table if not exists public.management_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  warning_threshold numeric(5, 2) not null default 80,
  alert_threshold numeric(5, 2) not null default 100,
  -- Coefficients appliques aux montants prevus selon le scenario retenu.
  scenario_prudent numeric(5, 2) not null default 0.85,
  scenario_realiste numeric(5, 2) not null default 1.00,
  scenario_optimiste numeric(5, 2) not null default 1.15,
  forecast_months smallint not null default 12,
  forecast_history_months smallint not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_settings_thresholds_order check (warning_threshold <= alert_threshold),
  constraint management_settings_warning_range check (warning_threshold between 0 and 200),
  constraint management_settings_alert_range check (alert_threshold between 0 and 200),
  constraint management_settings_scenarios_positive
    check (scenario_prudent > 0 and scenario_realiste > 0 and scenario_optimiste > 0),
  constraint management_settings_scenarios_order
    check (scenario_prudent <= scenario_realiste and scenario_realiste <= scenario_optimiste),
  constraint management_settings_forecast_months check (forecast_months between 1 and 36),
  constraint management_settings_history_months check (forecast_history_months between 1 and 36)
);

-- ---------------------------------------------------------------------------
-- 3. Historique des clotures mensuelles
-- ---------------------------------------------------------------------------

create table if not exists public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year smallint not null,
  month smallint not null,
  status text not null default 'closed',
  -- Photo figee des indicateurs au moment de la cloture (revenue, expenses,
  -- result, margin_rate, cash, bfr, receivables, payables, stock).
  indicators jsonb not null default '{}'::jsonb,
  entry_count integer not null default 0,
  total_debit numeric(14, 2) not null default 0,
  total_credit numeric(14, 2) not null default 0,
  notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, year, month),
  constraint monthly_closings_month_range check (month between 1 and 12),
  constraint monthly_closings_year_range check (year between 1990 and 2200),
  constraint monthly_closings_status_check check (status in ('closed', 'reopened'))
);

create index if not exists monthly_closings_company_period_idx
  on public.monthly_closings(company_id, year desc, month desc);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.budget_lines enable row level security;
alter table public.management_settings enable row level security;
alter table public.monthly_closings enable row level security;

drop policy if exists budget_lines_select_member on public.budget_lines;
drop policy if exists budget_lines_write_editor on public.budget_lines;
create policy budget_lines_select_member on public.budget_lines
  for select using (public.is_company_member(company_id));
create policy budget_lines_write_editor on public.budget_lines
  for all using (public.is_company_editor(company_id))
  with check (public.is_company_editor(company_id));

drop policy if exists management_settings_select_member on public.management_settings;
drop policy if exists management_settings_write_admin on public.management_settings;
create policy management_settings_select_member on public.management_settings
  for select using (public.is_company_member(company_id));
create policy management_settings_write_admin on public.management_settings
  for all using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

drop policy if exists monthly_closings_select_member on public.monthly_closings;
drop policy if exists monthly_closings_write_editor on public.monthly_closings;
create policy monthly_closings_select_member on public.monthly_closings
  for select using (public.is_company_member(company_id));
create policy monthly_closings_write_editor on public.monthly_closings
  for all using (public.is_company_editor(company_id))
  with check (public.is_company_editor(company_id));

drop trigger if exists set_updated_at_budget_lines on public.budget_lines;
create trigger set_updated_at_budget_lines
  before update on public.budget_lines
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_management_settings on public.management_settings;
create trigger set_updated_at_management_settings
  before update on public.management_settings
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_monthly_closings on public.monthly_closings;
create trigger set_updated_at_monthly_closings
  before update on public.monthly_closings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Realise mensuel agrege (base des comparaisons budget/realise)
-- ---------------------------------------------------------------------------

/*
  Realise par mois, compte et centre de couts pour un exercice.
  Seules les ecritures des societes accessibles a l'appelant sont retournees
  (security invoker : les policies RLS de accounting_entries s'appliquent).
*/
create or replace function public.monthly_actuals(target_company_id uuid, target_year integer)
returns table (
  month smallint,
  account_code text,
  cost_center_code text,
  debit numeric,
  credit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(month from e.date)::smallint as month,
    e.account_code,
    coalesce(e.cost_center_code, '') as cost_center_code,
    sum(e.debit) as debit,
    sum(e.credit) as credit
  from public.accounting_entries e
  where e.company_id = target_company_id
    and extract(year from e.date) = target_year
  group by 1, 2, 3;
$$;

grant execute on function public.monthly_actuals(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cloture / reouverture d'un mois
-- ---------------------------------------------------------------------------

/*
  Clot un mois : fige les indicateurs fournis par l'application et interdit
  toute nouvelle ecriture sur la periode. Reserve aux roles editeurs.
*/
create or replace function public.close_month(
  target_company_id uuid,
  target_year integer,
  target_month integer,
  target_indicators jsonb default '{}'::jsonb,
  target_notes text default null
)
returns public.monthly_closings
language plpgsql
security invoker
set search_path = public
as $$
declare
  closing public.monthly_closings;
  period_start date;
  period_end date;
  stats record;
begin
  if not public.is_company_editor(target_company_id) then
    raise exception 'insufficient privileges to close a period' using errcode = '42501';
  end if;

  period_start := make_date(target_year, target_month, 1);
  period_end := (period_start + interval '1 month')::date;

  select count(*) as entry_count,
         coalesce(sum(debit), 0) as total_debit,
         coalesce(sum(credit), 0) as total_credit,
         count(*) filter (where not is_validated) as draft_count
    into stats
  from public.accounting_entries
  where company_id = target_company_id
    and date >= period_start
    and date < period_end;

  if stats.draft_count > 0 then
    raise exception
      'cannot close %-%: % entries are still not validated',
      target_year, target_month, stats.draft_count
      using errcode = '23514', hint = 'validate all entries before closing';
  end if;

  if abs(stats.total_debit - stats.total_credit) > 0.005 then
    raise exception
      'cannot close %-%: period is not balanced (debit=%, credit=%)',
      target_year, target_month, stats.total_debit, stats.total_credit
      using errcode = '23514', hint = 'balanced entry required';
  end if;

  insert into public.monthly_closings as mc (
    company_id, year, month, status, indicators,
    entry_count, total_debit, total_credit, notes, closed_at, closed_by
  )
  values (
    target_company_id, target_year, target_month, 'closed', coalesce(target_indicators, '{}'::jsonb),
    stats.entry_count, stats.total_debit, stats.total_credit, target_notes, now(), auth.uid()
  )
  on conflict (company_id, year, month) do update
    set status = 'closed',
        indicators = excluded.indicators,
        entry_count = excluded.entry_count,
        total_debit = excluded.total_debit,
        total_credit = excluded.total_credit,
        notes = coalesce(excluded.notes, mc.notes),
        closed_at = now(),
        closed_by = auth.uid(),
        reopened_at = null,
        reopened_by = null
  returning * into closing;

  return closing;
end;
$$;

/* Reouvre un mois cloture. Reserve aux administrateurs. */
create or replace function public.reopen_month(
  target_company_id uuid,
  target_year integer,
  target_month integer,
  target_reason text default null
)
returns public.monthly_closings
language plpgsql
security invoker
set search_path = public
as $$
declare
  closing public.monthly_closings;
begin
  if not public.is_company_admin(target_company_id) then
    raise exception 'insufficient privileges to reopen a period' using errcode = '42501';
  end if;

  update public.monthly_closings
     set status = 'reopened',
         reopened_at = now(),
         reopened_by = auth.uid(),
         notes = coalesce(target_reason, notes)
   where company_id = target_company_id
     and year = target_year
     and month = target_month
  returning * into closing;

  if not found then
    raise exception 'period %-% is not closed', target_year, target_month
      using errcode = 'P0002';
  end if;

  return closing;
end;
$$;

grant execute on function public.close_month(uuid, integer, integer, jsonb, text) to authenticated;
grant execute on function public.reopen_month(uuid, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Verrouillage des periodes closes
-- ---------------------------------------------------------------------------

create or replace function public.prevent_closed_period_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_date date;
begin
  target_company_id := coalesce(new.company_id, old.company_id);
  target_date := coalesce(new.date, old.date);

  if exists (
    select 1
    from public.monthly_closings mc
    where mc.company_id = target_company_id
      and mc.status = 'closed'
      and mc.year = extract(year from target_date)
      and mc.month = extract(month from target_date)
  ) then
    raise exception 'accounting period % is closed', to_char(target_date, 'YYYY-MM')
      using errcode = '42501', hint = 'closed period';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists accounting_entries_closed_period on public.accounting_entries;

create trigger accounting_entries_closed_period
  before insert or update or delete on public.accounting_entries
  for each row
  execute function public.prevent_closed_period_change();
