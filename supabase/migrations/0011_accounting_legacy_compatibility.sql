-- Compatibilite des anciens flux : les champs obligatoires sont completes par le serveur.

alter table public.accounting_entries
  drop constraint if exists accounting_entries_entry_number_required;

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
  if tg_op = 'INSERT' then
    -- Une validation ne peut passer que par validate_accounting_entry().
    new.is_validated := false;
  end if;

  if nullif(trim(new.entry_number), '') is null then
    new.entry_number := coalesce(new.journal, 'OD') || '-' || to_char(new.date, 'YYYYMMDD') || '-' || left(replace(new.id::text, '-', ''), 8);
  end if;

  if new.account_code is null or nullif(trim(new.account_code), '') is null then
    raise exception 'accounting entry account is required' using errcode = '23514';
  end if;

  select count(*) into account_count from public.accounts where company_id = new.company_id;
  select is_active into account_is_active
  from public.accounts where company_id = new.company_id and code = new.account_code;
  if account_count > 0 and not found then
    raise exception 'account % does not exist for company', new.account_code using errcode = '23503';
  end if;
  if account_count > 0 and not account_is_active and (tg_op = 'INSERT' or old.account_code is distinct from new.account_code) then
    raise exception 'account % is inactive', new.account_code using errcode = '23514';
  end if;

  if new.fiscal_year_id is null then
    select id, start_date, end_date, status into new.fiscal_year_id, exercise_start, exercise_end, exercise_status
    from public.fiscal_years
    where company_id = new.company_id and new.date between start_date and end_date and status = 'open'
    order by start_date desc limit 1;
    if new.fiscal_year_id is null then
      select count(*) into exercise_count from public.fiscal_years where company_id = new.company_id;
      if exercise_count = 0 then
        insert into public.fiscal_years (company_id, name, year, start_date, end_date, status, is_current)
        values (new.company_id, extract(year from new.date)::text, extract(year from new.date)::integer,
          make_date(extract(year from new.date)::integer, 1, 1), make_date(extract(year from new.date)::integer, 12, 31), 'open', true)
        returning id, start_date, end_date, status into new.fiscal_year_id, exercise_start, exercise_end, exercise_status;
      end if;
    end if;
  else
    select start_date, end_date, status into exercise_start, exercise_end, exercise_status
    from public.fiscal_years where id = new.fiscal_year_id and company_id = new.company_id;
  end if;

  if new.fiscal_year_id is null then
    raise exception 'fiscal year is required and date is outside available periods' using errcode = '23514';
  end if;
  if new.date not between exercise_start and exercise_end then
    raise exception 'accounting date % is outside fiscal year', new.date using errcode = '23514';
  end if;
  if exercise_status = 'closed' then
    raise exception 'fiscal year is closed' using errcode = '42501';
  end if;
  return new;
end;
$$;
