-- Donnees de sortie necessaires au registre des immobilisations.
alter table public.fixed_assets
  add column if not exists disposal_date date,
  add column if not exists disposal_proceeds numeric(14, 2),
  add column if not exists disposal_reason text,
  add column if not exists disposal_entry_number text;

alter table public.fixed_assets
  drop constraint if exists fixed_assets_disposal_values_check,
  drop constraint if exists fixed_assets_disposal_date_check;

alter table public.fixed_assets
  add constraint fixed_assets_disposal_values_check
    check (disposal_proceeds is null or disposal_proceeds >= 0),
  add constraint fixed_assets_disposal_date_check
    check (disposal_date is null or disposal_date >= in_service_date);
