-- Registres auxiliaires : créances, immobilisations et stocks.
-- Les écritures comptables validées restent la source de vérité financière.

create table public.receivable_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  level smallint not null default 1,
  scheduled_date date not null,
  sent_at timestamptz,
  status text not null default 'planned',
  channel text not null default 'email',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, level),
  constraint receivable_followups_level_check check (level between 1 and 3),
  constraint receivable_followups_status_check check (status in ('planned', 'sent', 'cancelled')),
  constraint receivable_followups_channel_check check (channel in ('email', 'manual'))
);

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  asset_code text not null,
  category text not null,
  acquisition_date date not null,
  in_service_date date not null,
  acquisition_cost numeric(14, 2) not null,
  residual_value numeric(14, 2) not null default 0,
  useful_life_months integer not null,
  depreciation_method text not null default 'straight_line',
  status text not null default 'active',
  invoice_id uuid references public.invoices(id) on delete set null,
  acquisition_account_code text,
  depreciation_account_code text,
  expense_account_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, asset_code),
  constraint fixed_assets_cost_check check (acquisition_cost >= 0),
  constraint fixed_assets_residual_check check (residual_value >= 0 and residual_value <= acquisition_cost),
  constraint fixed_assets_life_check check (useful_life_months > 0),
  constraint fixed_assets_method_check check (depreciation_method in ('straight_line')),
  constraint fixed_assets_status_check check (status in ('active', 'fully_depreciated', 'disposed')),
  constraint fixed_assets_dates_check check (in_service_date >= acquisition_date)
);

create table public.fixed_asset_depreciations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(14, 2) not null,
  accounting_entry_number text,
  is_posted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (asset_id, period_start, period_end),
  constraint fixed_asset_depreciations_amount_check check (amount > 0),
  constraint fixed_asset_depreciations_dates_check check (period_end >= period_start)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  movement_date date not null,
  movement_type text not null,
  quantity numeric(14, 3) not null,
  unit_cost numeric(14, 2) not null default 0,
  reference text,
  accounting_entry_number text,
  created_at timestamptz not null default now(),
  constraint stock_movements_type_check check (movement_type in ('receipt', 'issue', 'adjustment', 'write_down')),
  constraint stock_movements_quantity_check check (quantity <> 0),
  constraint stock_movements_unit_cost_check check (unit_cost >= 0)
);

create table public.stock_impairments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  assessment_date date not null,
  book_value numeric(14, 2) not null,
  recoverable_value numeric(14, 2) not null,
  impairment_amount numeric(14, 2) generated always as (greatest(book_value - recoverable_value, 0)) stored,
  accounting_entry_number text,
  is_posted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint stock_impairments_values_check check (book_value >= 0 and recoverable_value >= 0)
);

alter table public.receivable_followups enable row level security;
alter table public.fixed_assets enable row level security;
alter table public.fixed_asset_depreciations enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_impairments enable row level security;

create policy receivable_followups_member on public.receivable_followups for select using (public.is_company_member(company_id));
create policy receivable_followups_editor on public.receivable_followups for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy fixed_assets_member on public.fixed_assets for select using (public.is_company_member(company_id));
create policy fixed_assets_editor on public.fixed_assets for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy fixed_asset_depreciations_member on public.fixed_asset_depreciations for select using (public.is_company_member(company_id));
create policy fixed_asset_depreciations_editor on public.fixed_asset_depreciations for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy stock_movements_member on public.stock_movements for select using (public.is_company_member(company_id));
create policy stock_movements_editor on public.stock_movements for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create policy stock_impairments_member on public.stock_impairments for select using (public.is_company_member(company_id));
create policy stock_impairments_editor on public.stock_impairments for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));

create index receivable_followups_company_date_idx on public.receivable_followups(company_id, scheduled_date);
create index fixed_assets_company_status_idx on public.fixed_assets(company_id, status);
create index stock_movements_item_date_idx on public.stock_movements(stock_item_id, movement_date);

create trigger receivable_followups_set_updated_at before update on public.receivable_followups for each row execute function public.set_updated_at();
create trigger fixed_assets_set_updated_at before update on public.fixed_assets for each row execute function public.set_updated_at();

create or replace function public.stock_movement_updates_quantity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.stock_items
    set quantity = quantity + case when new.movement_type in ('receipt', 'adjustment') then new.quantity else -abs(new.quantity) end,
        total_value = (quantity + case when new.movement_type in ('receipt', 'adjustment') then new.quantity else -abs(new.quantity) end) * unit_price,
        updated_at = now()
    where id = new.stock_item_id and company_id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger stock_movements_update_quantity after insert on public.stock_movements for each row execute function public.stock_movement_updates_quantity();
