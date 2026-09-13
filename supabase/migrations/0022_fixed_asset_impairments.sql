-- Registre des tests de valeur et dépréciations des immobilisations.
create table if not exists public.fixed_asset_impairments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  assessment_date date not null,
  book_value numeric(14, 2) not null,
  recoverable_value numeric(14, 2) not null,
  impairment_amount numeric(14, 2) generated always as (greatest(book_value - recoverable_value, 0)) stored,
  accounting_entry_number text,
  is_posted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (asset_id, assessment_date),
  constraint fixed_asset_impairments_values_check check (book_value >= 0 and recoverable_value >= 0)
);

alter table public.fixed_asset_impairments enable row level security;
drop policy if exists fixed_asset_impairments_member on public.fixed_asset_impairments;
drop policy if exists fixed_asset_impairments_editor on public.fixed_asset_impairments;
create policy fixed_asset_impairments_member on public.fixed_asset_impairments for select using (public.is_company_member(company_id));
create policy fixed_asset_impairments_editor on public.fixed_asset_impairments for all using (public.is_company_editor(company_id)) with check (public.is_company_editor(company_id));
create index if not exists fixed_asset_impairments_company_date_idx on public.fixed_asset_impairments(company_id, assessment_date);
