create or replace function public.create_scanned_invoice_with_entries(
  target_invoice jsonb,
  target_entries jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_company_id uuid;
  target_invoice_number text;
  target_invoice_date date;
  target_invoice_amount numeric;
  total_debit numeric;
  total_credit numeric;
  entry_count integer;
  created_invoice_id uuid;
begin
  if coalesce(jsonb_typeof(target_invoice), '') <> 'object'
     or coalesce(jsonb_typeof(target_entries), '') <> 'array' then
    raise exception 'invalid scanned invoice payload' using errcode = '22023';
  end if;
  if jsonb_array_length(target_entries) not between 2 and 3 then
    raise exception 'invalid scanned invoice payload' using errcode = '22023';
  end if;

  target_company_id := nullif(target_invoice ->> 'company_id', '')::uuid;
  target_invoice_number := nullif(btrim(target_invoice ->> 'invoice_number'), '');
  target_invoice_date := (target_invoice ->> 'date')::date;
  target_invoice_amount := (target_invoice ->> 'amount_ttc')::numeric;

  if target_company_id is null or not public.is_company_editor(target_company_id) then
    raise exception 'company editor required' using errcode = '42501';
  end if;
  if target_invoice_number is null or target_invoice_date is null or target_invoice_amount <= 0 then
    raise exception 'invoice number, date and positive total are required' using errcode = '22023';
  end if;
  if target_invoice ->> 'type' not in ('client', 'fournisseur') then
    raise exception 'unsupported invoice type' using errcode = '22023';
  end if;
  if nullif(target_invoice ->> 'third_party_id', '') is not null
     and not exists (
       select 1
       from public.third_parties
       where id = (target_invoice ->> 'third_party_id')::uuid
         and company_id = target_company_id
     ) then
    raise exception 'third party does not belong to company' using errcode = '23503';
  end if;

  select count(*),
         coalesce(sum(coalesce(nullif(entry ->> 'debit', '')::numeric, 0)), 0),
         coalesce(sum(coalesce(nullif(entry ->> 'credit', '')::numeric, 0)), 0)
    into entry_count, total_debit, total_credit
  from jsonb_array_elements(target_entries) as entries(entry);

  if entry_count < 2
     or abs(total_debit - total_credit) > 0.005
     or abs(total_debit - target_invoice_amount) > 0.01
     or exists (
       select 1
       from jsonb_array_elements(target_entries) as entries(entry)
       where nullif(btrim(entry ->> 'account_code'), '') is null
          or coalesce(nullif(entry ->> 'debit', '')::numeric, 0) < 0
          or coalesce(nullif(entry ->> 'credit', '')::numeric, 0) < 0
          or (coalesce(nullif(entry ->> 'debit', '')::numeric, 0) > 0
              and coalesce(nullif(entry ->> 'credit', '')::numeric, 0) > 0)
     ) then
    raise exception 'invoice entries must be valid, balanced and equal the invoice total'
      using errcode = '23514';
  end if;

  insert into public.invoices (
    company_id, invoice_number, type, date, due_date, third_party_id,
    third_party_name, description, amount_ht, tva_rate, amount_tva,
    amount_ttc, status, file_path, file_url
  ) values (
    target_company_id,
    target_invoice_number,
    target_invoice ->> 'type',
    target_invoice_date,
    nullif(target_invoice ->> 'due_date', '')::date,
    nullif(target_invoice ->> 'third_party_id', '')::uuid,
    nullif(btrim(target_invoice ->> 'third_party_name'), ''),
    coalesce(target_invoice ->> 'description', ''),
    (target_invoice ->> 'amount_ht')::numeric,
    (target_invoice ->> 'tva_rate')::numeric,
    (target_invoice ->> 'amount_tva')::numeric,
    target_invoice_amount,
    'brouillon',
    nullif(target_invoice ->> 'file_path', ''),
    nullif(target_invoice ->> 'file_url', '')
  )
  returning id into created_invoice_id;

  insert into public.accounting_entries (
    company_id, entry_number, date, journal, account_code, account_label,
    label, debit, credit, reference, third_party_id, invoice_id,
    third_party_name, is_validated
  )
  select
    target_company_id,
    coalesce(entry ->> 'entry_number', coalesce(nullif(entry ->> 'journal', ''), 'OD') || '-' || target_invoice_number),
    target_invoice_date,
    coalesce(nullif(entry ->> 'journal', ''), 'OD'),
    entry ->> 'account_code',
    nullif(entry ->> 'account_label', ''),
    nullif(entry ->> 'label', ''),
    coalesce(nullif(entry ->> 'debit', '')::numeric, 0),
    coalesce(nullif(entry ->> 'credit', '')::numeric, 0),
    coalesce(nullif(entry ->> 'reference', ''), target_invoice_number),
    case
      when nullif(entry ->> 'third_party_id', '') is not null
        then nullif(target_invoice ->> 'third_party_id', '')::uuid
      else null
    end,
    created_invoice_id,
    case
      when nullif(entry ->> 'third_party_id', '') is not null
        then nullif(target_invoice ->> 'third_party_name', '')
      else null
    end,
    false
  from jsonb_array_elements(target_entries) as entries(entry);

  return created_invoice_id;
end;
$$;

revoke all on function public.create_scanned_invoice_with_entries(jsonb, jsonb) from public, anon;
grant execute on function public.create_scanned_invoice_with_entries(jsonb, jsonb) to authenticated;
