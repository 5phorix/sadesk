-- Regles fondamentales du moteur comptable.

alter table public.accounting_entries
  drop constraint if exists accounting_entries_entry_number_required,
  drop constraint if exists accounting_entries_fiscal_year_required;

alter table public.accounting_entries
  add constraint accounting_entries_entry_number_required
    check (nullif(trim(entry_number), '') is not null) not valid,
  add constraint accounting_entries_fiscal_year_required
    check (fiscal_year_id is not null) not valid;

create or replace function public.enforce_accounting_entry_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_is_active boolean;
  account_count integer;
  exercise_start date;
  exercise_end date;
  exercise_status text;
  exercise_count integer;
begin
  if new.account_code is null or nullif(trim(new.account_code), '') is null then
    raise exception 'accounting entry account is required' using errcode = '23514';
  end if;

  select count(*) into account_count
  from public.accounts
  where company_id = new.company_id;

  select is_active into account_is_active
  from public.accounts
  where company_id = new.company_id and code = new.account_code;

  if account_count > 0 and not found then
    raise exception 'account % does not exist for company', new.account_code using errcode = '23503';
  end if;
  if account_count > 0 and not account_is_active and (tg_op = 'INSERT' or old.account_code is distinct from new.account_code) then
    raise exception 'account % is inactive', new.account_code using errcode = '23514';
  end if;

  if new.fiscal_year_id is null then
    select id, start_date, end_date, status
      into new.fiscal_year_id, exercise_start, exercise_end, exercise_status
    from public.fiscal_years
    where company_id = new.company_id
      and new.date between start_date and end_date
      and status = 'open'
    order by start_date desc
    limit 1;

    if new.fiscal_year_id is null then
      select count(*) into exercise_count
      from public.fiscal_years
      where company_id = new.company_id;

      if exercise_count = 0 then
        insert into public.fiscal_years (company_id, name, year, start_date, end_date, status, is_current)
        values (
          new.company_id,
          extract(year from new.date)::text,
          extract(year from new.date)::integer,
          make_date(extract(year from new.date)::integer, 1, 1),
          make_date(extract(year from new.date)::integer, 12, 31),
          'open',
          true
        )
        returning id, start_date, end_date, status
        into new.fiscal_year_id, exercise_start, exercise_end, exercise_status;
      end if;
    end if;
  else
    select start_date, end_date, status
    into exercise_start, exercise_end, exercise_status
    from public.fiscal_years
    where id = new.fiscal_year_id and company_id = new.company_id;
  end if;

  if not found then
    raise exception 'fiscal year is required and must belong to company' using errcode = '23503';
  end if;
  if exercise_start is null or exercise_end is null or new.date not between exercise_start and exercise_end then
    raise exception 'accounting date % is outside fiscal year', new.date using errcode = '23514';
  end if;
  if exercise_status = 'closed' then
    raise exception 'fiscal year is closed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_entries_reference_rules on public.accounting_entries;
create trigger accounting_entries_reference_rules
  before insert or update on public.accounting_entries
  for each row execute function public.enforce_accounting_entry_reference();

create or replace function public.prevent_validated_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_validated and (
    old.company_id is distinct from new.company_id
    or old.entry_number is distinct from new.entry_number
    or old.date is distinct from new.date
    or old.journal is distinct from new.journal
    or old.account_code is distinct from new.account_code
    or old.account_label is distinct from new.account_label
    or old.label is distinct from new.label
    or old.debit is distinct from new.debit
    or old.credit is distinct from new.credit
    or old.reference is distinct from new.reference
    or old.third_party_id is distinct from new.third_party_id
    or old.invoice_id is distinct from new.invoice_id
    or old.lettering is distinct from new.lettering
    or old.fiscal_year_id is distinct from new.fiscal_year_id
  ) then
    raise exception 'validated accounting entry % cannot be modified', old.id using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.validate_accounting_entry(
  target_company_id uuid,
  target_entry_number text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  total_debit numeric;
  total_credit numeric;
  line_count integer;
  unbalanced_count integer;
begin
  if not public.is_company_editor(target_company_id) then
    raise exception 'insufficient privileges to validate accounting entries' using errcode = '42501';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*), count(*) filter (where account_code is null or trim(account_code) = '')
    into total_debit, total_credit, line_count, unbalanced_count
  from public.accounting_entries
  where company_id = target_company_id and entry_number = target_entry_number;

  if line_count < 2 then
    raise exception 'accounting entry % requires at least two lines', target_entry_number using errcode = '23514';
  end if;
  if unbalanced_count > 0 or abs(total_debit - total_credit) > 0.005 then
    raise exception 'accounting entry % is not balanced (debit=%, credit=%)', target_entry_number, total_debit, total_credit using errcode = '23514';
  end if;

  update public.accounting_entries
  set is_validated = true, updated_at = now()
  where company_id = target_company_id and entry_number = target_entry_number;
  return line_count;
end;
$$;
