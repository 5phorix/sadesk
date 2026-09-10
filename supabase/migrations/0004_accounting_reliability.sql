-- Fiabilite comptable : extourne, exercices ouverts/clotures, lettrage,
-- verrouillage renforce des ecritures validees et tracabilite du rapprochement.

-- ---------------------------------------------------------------------------
-- 1. Tracabilite des extournes
-- ---------------------------------------------------------------------------

alter table public.accounting_entries
  add column if not exists is_reversal boolean not null default false,
  add column if not exists reversed_entry_number text,
  add column if not exists reversal_reason text;

create index if not exists accounting_entries_reversed_idx
  on public.accounting_entries(company_id, reversed_entry_number)
  where reversed_entry_number is not null;

-- ---------------------------------------------------------------------------
-- 2. Exercices : normalisation des statuts
-- ---------------------------------------------------------------------------

-- L'interface ecrivait 'ouvert'/'cloture' alors que le schema prevoyait 'open' :
-- on unifie sur le vocabulaire anglais avant de poser la contrainte.
update public.fiscal_years
   set status = case
     when lower(status) in ('ouvert', 'open') then 'open'
     when lower(status) in ('cloture', 'clôturé', 'cloturé', 'clôture', 'closed') then 'closed'
     else 'open'
   end;

alter table public.fiscal_years
  drop constraint if exists fiscal_years_status_check;

alter table public.fiscal_years
  add constraint fiscal_years_status_check check (status in ('open', 'closed'));

alter table public.fiscal_years
  drop constraint if exists fiscal_years_period_order;

alter table public.fiscal_years
  add constraint fiscal_years_period_order
    check (start_date is null or end_date is null or end_date > start_date) not valid;

/* Exercice couvrant une date donnee, s'il existe. */
create or replace function public.fiscal_year_for_date(target_company_id uuid, target_date date)
returns public.fiscal_years
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.fiscal_years
  where company_id = target_company_id
    and start_date is not null
    and end_date is not null
    and target_date between start_date and end_date
  limit 1;
$$;

/*
  Interdit toute ecriture rattachee a un exercice clos.
  Les societes sans exercice defini ne sont pas contraintes.
*/
create or replace function public.prevent_closed_fiscal_year_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_date date;
  year_status text;
begin
  target_company_id := coalesce(new.company_id, old.company_id);
  target_date := coalesce(new.date, old.date);

  select status into year_status
  from public.fiscal_years
  where company_id = target_company_id
    and start_date is not null
    and end_date is not null
    and target_date between start_date and end_date
  limit 1;

  if year_status = 'closed' then
    raise exception 'fiscal year covering % is closed', target_date
      using errcode = '42501', hint = 'closed fiscal year';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists accounting_entries_closed_fiscal_year on public.accounting_entries;

create trigger accounting_entries_closed_fiscal_year
  before insert or update or delete on public.accounting_entries
  for each row
  execute function public.prevent_closed_fiscal_year_change();

-- ---------------------------------------------------------------------------
-- 3. Verrouillage renforce des ecritures validees
-- ---------------------------------------------------------------------------

/*
  Une ecriture validee ne peut plus etre supprimee : la correction passe
  obligatoirement par une extourne, qui laisse une trace.
*/
create or replace function public.prevent_validated_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_validated then
    raise exception 'validated accounting entry % cannot be deleted', old.id
      using errcode = '42501', hint = 'use a reversal entry';
  end if;
  return old;
end;
$$;

drop trigger if exists accounting_entries_block_validated_delete on public.accounting_entries;

create trigger accounting_entries_block_validated_delete
  before delete on public.accounting_entries
  for each row
  execute function public.prevent_validated_entry_delete();

-- ---------------------------------------------------------------------------
-- 4. Extourne
-- ---------------------------------------------------------------------------

/*
  Cree la contrepassation d'une piece : chaque ligne est reprise avec debit et
  credit inverses. La piece d'origine reste intacte (principe d'intangibilite).
*/
create or replace function public.reverse_accounting_entry(
  target_company_id uuid,
  target_entry_number text,
  target_date date default current_date,
  target_reason text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  reversal_number text;
  line_count integer;
begin
  if not public.is_company_editor(target_company_id) then
    raise exception 'insufficient privileges to reverse an accounting entry'
      using errcode = '42501';
  end if;

  select count(*) into line_count
  from public.accounting_entries
  where company_id = target_company_id
    and entry_number = target_entry_number
    and not is_reversal;

  if line_count = 0 then
    raise exception 'accounting entry % not found', target_entry_number
      using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.accounting_entries
    where company_id = target_company_id
      and reversed_entry_number = target_entry_number
  ) then
    raise exception 'accounting entry % has already been reversed', target_entry_number
      using errcode = '23505', hint = 'already reversed';
  end if;

  reversal_number := 'EXT-' || target_entry_number;

  insert into public.accounting_entries (
    company_id, entry_number, date, journal, account_code, account_label, label,
    debit, credit, reference, third_party_id, third_party_name,
    cost_center_id, cost_center_code, cost_center_name,
    invoice_id, is_validated, is_reversal, reversed_entry_number, reversal_reason
  )
  select
    company_id,
    reversal_number,
    target_date,
    journal,
    account_code,
    account_label,
    'Extourne - ' || coalesce(label, target_entry_number),
    credit,
    debit,
    reference,
    third_party_id,
    third_party_name,
    cost_center_id,
    cost_center_code,
    cost_center_name,
    invoice_id,
    false,
    true,
    target_entry_number,
    target_reason
  from public.accounting_entries
  where company_id = target_company_id
    and entry_number = target_entry_number
    and not is_reversal;

  return reversal_number;
end;
$$;

grant execute on function public.reverse_accounting_entry(uuid, text, date, text) to authenticated;
grant execute on function public.fiscal_year_for_date(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Lettrage / delettrage
-- ---------------------------------------------------------------------------

create table if not exists public.lettering_sequences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_value integer not null default 0
);

alter table public.lettering_sequences enable row level security;

drop policy if exists lettering_sequences_select_member on public.lettering_sequences;
drop policy if exists lettering_sequences_write_editor on public.lettering_sequences;
create policy lettering_sequences_select_member on public.lettering_sequences
  for select using (public.is_company_member(company_id));
create policy lettering_sequences_write_editor on public.lettering_sequences
  for all using (public.is_company_editor(company_id))
  with check (public.is_company_editor(company_id));

alter table public.accounting_entries
  add column if not exists lettered_at date;

create index if not exists accounting_entries_lettering_idx
  on public.accounting_entries(company_id, account_code, lettering);

/* Code de lettrage sequentiel par societe : AAA, AAB, ... */
create or replace function public.next_lettering_code(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
  code text := '';
  remainder integer;
begin
  insert into public.lettering_sequences (company_id, last_value)
  values (target_company_id, 1)
  on conflict (company_id) do update
    set last_value = public.lettering_sequences.last_value + 1
  returning last_value into next_value;

  remainder := next_value - 1;
  for i in 1..3 loop
    code := chr(65 + (remainder % 26)) || code;
    remainder := remainder / 26;
  end loop;

  return code;
end;
$$;

/*
  Lettre un groupe d'ecritures : meme compte, meme societe, et somme des
  debits egale a la somme des credits. Retourne le code attribue.
*/
create or replace function public.letter_entries(
  target_company_id uuid,
  target_entry_ids uuid[]
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  code text;
  total_debit numeric;
  total_credit numeric;
  account_count integer;
  line_count integer;
begin
  if not public.is_company_editor(target_company_id) then
    raise exception 'insufficient privileges to letter entries' using errcode = '42501';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0),
         count(distinct account_code), count(*)
    into total_debit, total_credit, account_count, line_count
  from public.accounting_entries
  where company_id = target_company_id
    and id = any(target_entry_ids);

  if line_count <> array_length(target_entry_ids, 1) then
    raise exception 'some entries do not belong to this company' using errcode = 'P0002';
  end if;

  if line_count < 2 then
    raise exception 'at least two entries are required to letter'
      using errcode = '23514', hint = 'lettering needs two entries';
  end if;

  if account_count > 1 then
    raise exception 'lettering requires a single account'
      using errcode = '23514', hint = 'lettering single account';
  end if;

  if abs(total_debit - total_credit) > 0.005 then
    raise exception
      'lettering group is not balanced (debit=%, credit=%)', total_debit, total_credit
      using errcode = '23514', hint = 'balanced entry required';
  end if;

  code := public.next_lettering_code(target_company_id);

  update public.accounting_entries
     set lettering = code,
         lettered_at = current_date,
         updated_at = now()
   where company_id = target_company_id
     and id = any(target_entry_ids);

  return code;
end;
$$;

/* Retire un code de lettrage de toutes les ecritures qui le portent. */
create or replace function public.unletter_entries(
  target_company_id uuid,
  target_code text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if not public.is_company_editor(target_company_id) then
    raise exception 'insufficient privileges to unletter entries' using errcode = '42501';
  end if;

  update public.accounting_entries
     set lettering = null,
         lettered_at = null,
         updated_at = now()
   where company_id = target_company_id
     and lettering = target_code;

  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'lettering code % not found', target_code using errcode = 'P0002';
  end if;

  return affected;
end;
$$;

grant execute on function public.next_lettering_code(uuid) to authenticated;
grant execute on function public.letter_entries(uuid, uuid[]) to authenticated;
grant execute on function public.unletter_entries(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rapprochement bancaire
-- ---------------------------------------------------------------------------

alter table public.bank_transactions
  add column if not exists reconciliation_mode text,
  add column if not exists reconciliation_score numeric(5, 2);

alter table public.bank_transactions
  drop constraint if exists bank_transactions_reconciliation_mode_check,
  drop constraint if exists bank_transactions_reconciliation_consistency;

alter table public.bank_transactions
  add constraint bank_transactions_reconciliation_mode_check
    check (reconciliation_mode is null or reconciliation_mode in ('manual', 'auto')),
  -- Une transaction rapprochee doit designer l'ecriture correspondante.
  add constraint bank_transactions_reconciliation_consistency
    check (not is_reconciled or reconciled_entry_id is not null) not valid;

create index if not exists bank_transactions_reconciled_entry_idx
  on public.bank_transactions(company_id, reconciled_entry_id)
  where reconciled_entry_id is not null;
