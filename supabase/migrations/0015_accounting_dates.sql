-- Dates comptables explicites et historisation de la validation.

alter table public.accounting_entries
  add column if not exists piece_date date,
  add column if not exists validated_at timestamptz;

update public.accounting_entries
set piece_date = date
where piece_date is null;

update public.accounting_entries
set validated_at = coalesce(updated_at, created_at, now())
where is_validated and validated_at is null;

alter table public.accounting_entries
  alter column piece_date set default current_date,
  alter column piece_date set not null;

create or replace function public.set_accounting_entry_dates()
returns trigger
language plpgsql
as $$
begin
  new.piece_date := coalesce(new.piece_date, new.date);

  if new.is_validated then
    new.validated_at := case
      when tg_op = 'UPDATE' and old.is_validated then old.validated_at
      else coalesce(new.validated_at, now())
    end;
  else
    new.validated_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_entries_dates on public.accounting_entries;
create trigger accounting_entries_dates
  before insert or update on public.accounting_entries
  for each row execute function public.set_accounting_entry_dates();

create or replace function public.prevent_validated_entry_date_change()
returns trigger
language plpgsql
as $$
begin
  if old.is_validated and old.piece_date is distinct from new.piece_date then
    raise exception 'validated accounting entry % cannot change piece date', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_entries_validated_date_lock on public.accounting_entries;
create trigger accounting_entries_validated_date_lock
  before update on public.accounting_entries
  for each row execute function public.prevent_validated_entry_date_change();

create index if not exists accounting_entries_validated_date_idx
  on public.accounting_entries(company_id, is_validated, date);
