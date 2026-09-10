-- Contraintes d'integrite comptable et validation serveur des ecritures equilibrees.

alter table public.invoices
  add column if not exists file_path text;

-- ---------------------------------------------------------------------------
-- 1. Contraintes sur les montants comptables
-- ---------------------------------------------------------------------------

alter table public.accounting_entries
  drop constraint if exists accounting_entries_debit_non_negative,
  drop constraint if exists accounting_entries_credit_non_negative,
  drop constraint if exists accounting_entries_single_side,
  drop constraint if exists accounting_entries_amount_not_null,
  drop constraint if exists accounting_entries_journal_check;

-- NOT VALID : les nouvelles lignes sont controlees, l'historique existant n'est pas rejete.
-- Utiliser `alter table ... validate constraint ...` apres nettoyage des donnees legacy.
alter table public.accounting_entries
  add constraint accounting_entries_debit_non_negative check (debit >= 0) not valid,
  add constraint accounting_entries_credit_non_negative check (credit >= 0) not valid,
  -- Une ligne d'ecriture est soit au debit, soit au credit, jamais les deux.
  add constraint accounting_entries_single_side check (debit = 0 or credit = 0) not valid,
  add constraint accounting_entries_amount_not_null check (debit + credit > 0) not valid,
  add constraint accounting_entries_journal_check check (journal ~ '^[A-Z0-9]{2,6}$') not valid;

alter table public.invoices
  drop constraint if exists invoices_amount_ht_non_negative,
  drop constraint if exists invoices_amount_tva_non_negative,
  drop constraint if exists invoices_amount_ttc_non_negative,
  drop constraint if exists invoices_tva_rate_range,
  drop constraint if exists invoices_amounts_coherent,
  drop constraint if exists invoices_due_date_after_date;

alter table public.invoices
  add constraint invoices_amount_ht_non_negative check (amount_ht >= 0) not valid,
  add constraint invoices_amount_tva_non_negative check (amount_tva >= 0) not valid,
  add constraint invoices_amount_ttc_non_negative check (amount_ttc >= 0) not valid,
  add constraint invoices_tva_rate_range check (tva_rate >= 0 and tva_rate <= 100) not valid,
  -- Tolerance de 1 centime pour les arrondis de TVA ligne a ligne.
  add constraint invoices_amounts_coherent
    check (abs(amount_ttc - (amount_ht + amount_tva)) <= 0.01) not valid,
  add constraint invoices_due_date_after_date
    check (due_date is null or due_date >= date) not valid;

alter table public.bank_transactions
  drop constraint if exists bank_transactions_value_date_check;

alter table public.bank_transactions
  add constraint bank_transactions_value_date_check
    check (value_date is null or value_date >= transaction_date - interval '90 days') not valid;

-- ---------------------------------------------------------------------------
-- 2. Validation serveur : une piece comptable doit etre equilibree
-- ---------------------------------------------------------------------------

-- Somme debit/credit d'une piece (company_id + entry_number).
create or replace function public.entry_balance(target_company_id uuid, target_entry_number text)
returns table (total_debit numeric, total_credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  from public.accounting_entries
  where company_id = target_company_id
    and entry_number = target_entry_number;
$$;

/*
  Empeche de valider une piece desequilibree et empeche de deséquilibrer
  une piece deja validee. Le controle s'applique a la piece complete
  (toutes les lignes partageant company_id + entry_number).
*/
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
  target_company_id := coalesce(new.company_id, old.company_id);
  target_entry_number := coalesce(new.entry_number, old.entry_number);

  if target_entry_number is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), bool_or(is_validated)
    into total_debit, total_credit, has_validated
  from public.accounting_entries
  where company_id = target_company_id
    and entry_number = target_entry_number;

  if coalesce(has_validated, false) and abs(total_debit - total_credit) > 0.005 then
    raise exception
      'accounting entry % is not balanced (debit=%, credit=%)',
      target_entry_number, total_debit, total_credit
      using errcode = '23514',
            hint = 'balanced entry required';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists accounting_entries_enforce_balance on public.accounting_entries;

create constraint trigger accounting_entries_enforce_balance
  after insert or update or delete on public.accounting_entries
  deferrable initially deferred
  for each row
  execute function public.enforce_balanced_entry();

-- Verrouille une piece validee : plus aucune modification de montant possible.
create or replace function public.prevent_validated_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_validated
     and new.is_validated
     and (old.debit is distinct from new.debit
          or old.credit is distinct from new.credit
          or old.account_code is distinct from new.account_code
          or old.date is distinct from new.date) then
    raise exception 'validated accounting entry % cannot be modified', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists accounting_entries_lock_validated on public.accounting_entries;

create trigger accounting_entries_lock_validated
  before update on public.accounting_entries
  for each row
  execute function public.prevent_validated_entry_change();

-- ---------------------------------------------------------------------------
-- 3. Validation explicite d'une piece par l'application
-- ---------------------------------------------------------------------------

/*
  Valide une piece comptable en une seule transaction : verifie l'equilibre
  puis passe toutes les lignes en is_validated. Retourne le nombre de lignes.
*/
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
begin
  if not public.is_company_editor(target_company_id) then
    raise exception 'insufficient privileges to validate accounting entries'
      using errcode = '42501';
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into total_debit, total_credit, line_count
  from public.accounting_entries
  where company_id = target_company_id
    and entry_number = target_entry_number;

  if line_count = 0 then
    raise exception 'accounting entry % not found', target_entry_number
      using errcode = 'P0002';
  end if;

  if abs(total_debit - total_credit) > 0.005 then
    raise exception
      'accounting entry % is not balanced (debit=%, credit=%)',
      target_entry_number, total_debit, total_credit
      using errcode = '23514',
            hint = 'balanced entry required';
  end if;

  update public.accounting_entries
     set is_validated = true,
         updated_at = now()
   where company_id = target_company_id
     and entry_number = target_entry_number;

  return line_count;
end;
$$;

revoke all on function public.validate_accounting_entry(uuid, text) from public;
grant execute on function public.validate_accounting_entry(uuid, text) to authenticated;
grant execute on function public.entry_balance(uuid, text) to authenticated;
