-- Les imports historiques peuvent déposer une pièce déséquilibrée;
-- la validation et la clôture restent les points de contrôle obligatoires.

create or replace function public.enforce_balanced_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_entry_number text;
  total_debit numeric;
  total_credit numeric;
  has_validated boolean;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  target_company_id := coalesce(new.company_id, old.company_id);
  target_entry_number := coalesce(new.entry_number, old.entry_number);
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), bool_or(is_validated)
    into total_debit, total_credit, has_validated
  from public.accounting_entries
  where company_id = target_company_id and entry_number = target_entry_number;

  if coalesce(has_validated, false) and abs(total_debit - total_credit) > 0.005 then
    raise exception 'accounting entry % is not balanced (debit=%, credit=%)', target_entry_number, total_debit, total_credit
      using errcode = '23514', hint = 'balanced entry required';
  end if;
  return coalesce(new, old);
end;
$$;
