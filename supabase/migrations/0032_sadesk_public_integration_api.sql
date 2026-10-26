create table public.sadesk_api_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  key_prefix text not null check (key_prefix like 'sds_live_%'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 2
    and scopes <@ array['imports:write', 'imports:read']::text[]
  ),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index sadesk_api_clients_company_idx
  on public.sadesk_api_clients(company_id, created_at desc);

create table public.sadesk_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_system text not null check (source_system ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  source_connection text not null check (char_length(source_connection) between 1 and 160),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'accepted'
    check (status in ('accepted', 'processing', 'succeeded', 'partially_succeeded', 'failed')),
  total_count integer not null default 0 check (total_count between 0 and 250),
  created_count integer not null default 0 check (created_count >= 0),
  ignored_count integer not null default 0 check (ignored_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (company_id, idempotency_key),
  unique (id, company_id)
);

create index sadesk_import_batches_company_idx
  on public.sadesk_import_batches(company_id, created_at desc);

create table public.sadesk_external_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_system text not null,
  source_connection text not null,
  object_type text not null check (object_type in ('invoices', 'third_parties')),
  external_id text not null check (char_length(external_id) between 1 and 255),
  local_record_id uuid not null,
  local_record_number text,
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_system, source_connection, object_type, external_id)
);

create table public.sadesk_import_batch_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid not null,
  object_type text,
  record_number integer not null check (record_number > 0),
  external_id text,
  status text not null check (status in ('created', 'ignored', 'rejected')),
  error_code text,
  error_field text,
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (batch_id, record_number),
  foreign key (batch_id, company_id)
    references public.sadesk_import_batches(id, company_id) on delete cascade
);

create index sadesk_import_batch_items_page_idx
  on public.sadesk_import_batch_items(batch_id, record_number);

alter table public.sadesk_api_clients enable row level security;
alter table public.sadesk_import_batches enable row level security;
alter table public.sadesk_external_records enable row level security;
alter table public.sadesk_import_batch_items enable row level security;

revoke all on public.sadesk_api_clients from anon, authenticated;
revoke all on public.sadesk_import_batches from anon, authenticated;
revoke all on public.sadesk_external_records from anon, authenticated;
revoke all on public.sadesk_import_batch_items from anon, authenticated;
grant all on public.sadesk_api_clients to service_role;
grant all on public.sadesk_import_batches to service_role;
grant all on public.sadesk_external_records to service_role;
grant all on public.sadesk_import_batch_items to service_role;

create or replace function public.process_sadesk_import_batch(
  target_batch_id uuid,
  target_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch public.sadesk_import_batches%rowtype;
  target_record jsonb;
  target_payload jsonb;
  current_record_number integer := 0;
  current_object_type text;
  current_external_id text;
  current_source_system text;
  current_source_connection text;
  current_company_currency text;
  current_local_record_id uuid;
  current_invoice_number text;
  current_party_name text;
  current_party_type text;
  current_error_code text;
  current_error_field text;
  current_created integer := 0;
  current_ignored integer := 0;
  current_rejected integer := 0;
  current_checksum text;
  amount_ht numeric;
  amount_tva numeric;
  amount_ttc numeric;
  tax_rate numeric;
  issue_date date;
  due_date date;
  counterparty_id uuid;
  result_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_records) <> 'array' or jsonb_array_length(target_records) not between 1 and 250 then
    raise exception 'records must contain between 1 and 250 items' using errcode = '22023';
  end if;

  select * into target_batch
  from public.sadesk_import_batches
  where id = target_batch_id
  for update;
  if not found then
    raise exception 'import batch not found' using errcode = 'P0002';
  end if;
  if target_batch.status in ('succeeded', 'partially_succeeded', 'failed') then
    return jsonb_build_object(
      'id', target_batch.id,
      'status', target_batch.status,
      'total_count', target_batch.total_count,
      'created_count', target_batch.created_count,
      'ignored_count', target_batch.ignored_count,
      'rejected_count', target_batch.rejected_count
    );
  end if;

  update public.sadesk_import_batches
  set status = 'processing', total_count = jsonb_array_length(target_records)
  where id = target_batch.id;

  select currency into current_company_currency
  from public.companies
  where id = target_batch.company_id and is_active;
  if not found then
    raise exception 'company is unavailable' using errcode = '42501';
  end if;

  current_source_system := target_batch.source_system;
  current_source_connection := target_batch.source_connection;

  for target_record in select value from jsonb_array_elements(target_records)
  loop
    current_record_number := current_record_number + 1;
    current_object_type := target_record ->> 'object_type';
    current_external_id := nullif(btrim(target_record ->> 'external_id'), '');
    target_payload := target_record -> 'payload';
    current_error_code := null;
    current_error_field := null;
    current_local_record_id := null;
    result_status := 'rejected';

    begin
      if current_object_type not in ('invoices', 'third_parties') then
        current_error_code := 'UNSUPPORTED_OBJECT_TYPE';
        current_error_field := 'object_type';
      elsif current_external_id is null or char_length(current_external_id) > 255 then
        current_error_code := 'EXTERNAL_ID_REQUIRED';
        current_error_field := 'external_id';
      elsif jsonb_typeof(target_payload) <> 'object' then
        current_error_code := 'INVALID_PAYLOAD';
        current_error_field := 'payload';
      elsif exists (
        select 1 from public.sadesk_external_records
        where company_id = target_batch.company_id
          and source_system = current_source_system
          and source_connection = current_source_connection
          and object_type = current_object_type
          and external_id = current_external_id
      ) then
        result_status := 'ignored';
        current_error_code := 'ALREADY_IMPORTED';
      else
        current_checksum := encode(extensions.digest(convert_to(target_payload::text, 'UTF8'), 'sha256'), 'hex');

        if current_object_type = 'third_parties' then
          current_party_name := nullif(btrim(target_payload ->> 'name'), '');
          current_party_type := case target_payload ->> 'role'
            when 'customer' then 'client'
            when 'supplier' then 'fournisseur'
            else null
          end;

          if current_party_name is null then
            current_error_code := 'NAME_REQUIRED';
            current_error_field := 'name';
          elsif current_party_type is null then
            current_error_code := 'INVALID_ROLE';
            current_error_field := 'role';
          else
            insert into public.third_parties (
              company_id, code, type, name, contact_name, email, phone, address,
              address_line_2, postal_code, city, country, siret, siren, tva_number,
              website, payment_terms, notes
            ) values (
              target_batch.company_id,
              nullif(target_payload ->> 'code', ''),
              current_party_type,
              current_party_name,
              nullif(target_payload ->> 'contact_name', ''),
              nullif(target_payload ->> 'email', ''),
              nullif(target_payload ->> 'phone', ''),
              coalesce(target_payload #>> '{address,line1}', target_payload ->> 'address'),
              coalesce(target_payload #>> '{address,line2}', target_payload ->> 'address_line_2'),
              coalesce(target_payload #>> '{address,postal_code}', target_payload ->> 'postal_code'),
              coalesce(target_payload #>> '{address,city}', target_payload ->> 'city'),
              coalesce(target_payload #>> '{address,country}', target_payload ->> 'country'),
              nullif(target_payload ->> 'siret', ''),
              nullif(target_payload ->> 'siren', ''),
              coalesce(nullif(target_payload ->> 'vat_number', ''), nullif(target_payload ->> 'tva_number', '')),
              nullif(target_payload ->> 'website', ''),
              nullif(target_payload ->> 'payment_terms', '')::integer,
              nullif(target_payload ->> 'notes', '')
            ) returning id into current_local_record_id;
            result_status := 'created';
          end if;
        else
          current_invoice_number := nullif(btrim(target_payload ->> 'invoice_number'), '');
          issue_date := nullif(target_payload ->> 'issue_date', '')::date;
          due_date := nullif(target_payload ->> 'due_date', '')::date;
          amount_ht := nullif(target_payload #>> '{totals,net}', '')::numeric;
          amount_tva := nullif(target_payload #>> '{totals,tax}', '')::numeric;
          amount_ttc := nullif(target_payload #>> '{totals,gross}', '')::numeric;
          tax_rate := nullif(target_payload ->> 'tax_rate', '')::numeric;
          current_party_type := case target_payload ->> 'direction'
            when 'outbound' then 'client'
            when 'inbound' then 'fournisseur'
            else null
          end;

          if current_invoice_number is null then
            current_error_code := 'INVOICE_NUMBER_REQUIRED';
            current_error_field := 'invoice_number';
          elsif issue_date is null then
            current_error_code := 'ISSUE_DATE_REQUIRED';
            current_error_field := 'issue_date';
          elsif current_party_type is null then
            current_error_code := 'INVALID_DIRECTION';
            current_error_field := 'direction';
          elsif coalesce(nullif(target_payload ->> 'currency', ''), current_company_currency) <> current_company_currency then
            current_error_code := 'CURRENCY_NOT_SUPPORTED';
            current_error_field := 'currency';
          elsif amount_ht is null or amount_tva is null or amount_ttc is null or tax_rate is null
            or amount_ht < 0 or amount_tva < 0 or amount_ttc < 0 or tax_rate < 0 or tax_rate > 100 then
            current_error_code := 'INVALID_TOTALS';
            current_error_field := 'totals';
          elsif abs(amount_ttc - (amount_ht + amount_tva)) > 0.01 then
            current_error_code := 'INCOHERENT_TOTALS';
            current_error_field := 'totals.gross';
          else
            if nullif(target_payload #>> '{counterparty,external_id}', '') is not null then
              select local_record_id into counterparty_id
              from public.sadesk_external_records
              where company_id = target_batch.company_id
                and source_system = current_source_system
                and source_connection = current_source_connection
                and object_type = 'third_parties'
                and external_id = target_payload #>> '{counterparty,external_id}';
            else
              counterparty_id := null;
            end if;

            insert into public.invoices (
              company_id, invoice_number, type, date, due_date, third_party_id, third_party_name,
              amount_ht, amount_tva, amount_ttc, tva_rate, status, notes
            ) values (
              target_batch.company_id,
              current_invoice_number,
              current_party_type,
              issue_date,
              due_date,
              counterparty_id,
              nullif(target_payload #>> '{counterparty,name}', ''),
              amount_ht,
              amount_tva,
              amount_ttc,
              tax_rate,
              'brouillon',
              nullif(target_payload ->> 'notes', '')
            ) returning id into current_local_record_id;
            result_status := 'created';
          end if;
        end if;

        if result_status = 'created' then
          insert into public.sadesk_external_records (
            company_id, source_system, source_connection, object_type,
            external_id, local_record_id, local_record_number, source_checksum
          ) values (
            target_batch.company_id, current_source_system, current_source_connection,
            current_object_type, current_external_id, current_local_record_id,
            case when current_object_type = 'invoices' then current_invoice_number else null end,
            current_checksum
          );
        end if;
      end if;
    exception
      when unique_violation then
        result_status := 'rejected';
        current_error_code := 'DESTINATION_CONFLICT';
        current_error_field := case when current_object_type = 'invoices' then 'invoice_number' else 'external_id' end;
      when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
        result_status := 'rejected';
        current_error_code := 'INVALID_FIELD_VALUE';
        current_error_field := case when current_object_type = 'invoices' then 'issue_date_or_totals' else 'payment_terms' end;
      when others then
        result_status := 'rejected';
        current_error_code := 'RECORD_REJECTED';
        current_error_field := null;
    end;

    insert into public.sadesk_import_batch_items (
      company_id, batch_id, object_type, record_number, external_id,
      status, error_code, error_field, retryable
    ) values (
      target_batch.company_id, target_batch.id, current_object_type, current_record_number,
      current_external_id, result_status, current_error_code, current_error_field, false
    );

    if result_status = 'created' then current_created := current_created + 1;
    elsif result_status = 'ignored' then current_ignored := current_ignored + 1;
    else current_rejected := current_rejected + 1;
    end if;
  end loop;

  update public.sadesk_import_batches
  set status = case
        when current_rejected > 0 then 'partially_succeeded'
        else 'succeeded'
      end,
      total_count = current_record_number,
      created_count = current_created,
      ignored_count = current_ignored,
      rejected_count = current_rejected,
      completed_at = now()
  where id = target_batch.id
  returning * into target_batch;

  return jsonb_build_object(
    'id', target_batch.id,
    'status', target_batch.status,
    'total_count', target_batch.total_count,
    'created_count', target_batch.created_count,
    'ignored_count', target_batch.ignored_count,
    'rejected_count', target_batch.rejected_count
  );
end;
$$;

revoke all on function public.process_sadesk_import_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.process_sadesk_import_batch(uuid, jsonb) to service_role;
