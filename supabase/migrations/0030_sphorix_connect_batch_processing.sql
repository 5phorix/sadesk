-- Resumable processing for large file snapshots.

alter table public.integration_run_scopes
  add column next_record_number integer not null default 1,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add constraint integration_run_scopes_next_record_check check (next_record_number > 0);

create or replace function public.claim_integration_run_scope(
  target_run_id uuid,
  target_company_id uuid,
  target_object_type text,
  target_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_scope public.integration_run_scopes%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into target_scope
  from public.integration_run_scopes
  where run_id = target_run_id
    and company_id = target_company_id
    and object_type = target_object_type
  for update;

  if not found or target_scope.status in ('complete', 'complete_with_exceptions', 'failed') then
    return null;
  end if;
  if target_scope.lease_expires_at is not null and target_scope.lease_expires_at > now() then
    return null;
  end if;

  update public.integration_run_scopes
  set status = 'running',
      lease_token = target_lease_token,
      lease_expires_at = now() + interval '3 minutes',
      started_at = coalesce(started_at, now())
  where id = target_scope.id;

  update public.integration_runs
  set status = 'running',
      started_at = coalesce(started_at, now())
  where id = target_run_id
    and company_id = target_company_id;

  return jsonb_build_object(
    'next_record_number', target_scope.next_record_number,
    'total_count', target_scope.source_count,
    'checkpoint', target_scope.checkpoint,
    'lease_token', target_lease_token
  );
end;
$$;

create or replace function public.apply_integration_batch(
  target_run_id uuid,
  target_company_id uuid,
  target_connection_id uuid,
  target_object_type text,
  target_records jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record jsonb;
  source_record jsonb;
  current_record_number integer;
  item_status text;
  item_error_code text;
  item_error_details jsonb;
  source_external_id text;
  local_record_id uuid;
  counterparty_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_records) <> 'array' or jsonb_array_length(target_records) > 250 then
    raise exception 'batch must contain at most 250 records' using errcode = '22023';
  end if;
  if target_object_type not in ('invoices', 'third_parties') then
    raise exception 'unsupported integration object type' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.integration_runs
    where id = target_run_id and company_id = target_company_id
      and connection_id = target_connection_id and status = 'running'
  ) then
    raise exception 'integration run is not active' using errcode = '42501';
  end if;

  for target_record in select value from jsonb_array_elements(target_records)
  loop
    current_record_number := (target_record ->> 'record_number')::integer;
    source_record := target_record -> 'data';

    if exists (
      select 1 from public.integration_run_items
      where run_id = target_run_id and object_type = target_object_type
        and integration_run_items.record_number = current_record_number
    ) then
      continue;
    end if;

    item_status := null;
    item_error_code := null;
    item_error_details := '{}'::jsonb;

    if target_record ->> 'status' = 'invalid' then
      item_status := 'failed';
      item_error_code := coalesce(target_record -> 'errors' -> 0 ->> 'code', 'INVALID_SOURCE_RECORD');
      item_error_details := jsonb_build_object(
        'field', target_record -> 'errors' -> 0 ->> 'field'
      );
    elsif target_record ->> 'status' = 'duplicate' then
      item_status := 'ignored';
      item_error_code := 'DUPLICATE_IN_SOURCE';
    else
      begin
        if target_object_type = 'invoices' then
          source_external_id := coalesce(
            nullif(source_record ->> 'external_id', ''),
            'invoice-number:' || (source_record ->> 'invoice_number')
          );

          select link.local_record_id into local_record_id
          from public.integration_object_links as link
          where company_id = target_company_id
            and link.connection_id = target_connection_id
            and link.object_type = target_object_type
            and link.direction = 'inbound'
            and link.external_id = source_external_id;

          if found then
            item_status := 'ignored';
            item_error_code := 'ALREADY_LINKED';
          else
            counterparty_id := null;
            if nullif(source_record ->> 'counterparty_external_id', '') is not null then
              select link.local_record_id into counterparty_id
              from public.integration_object_links as link
              where link.company_id = target_company_id
                and link.connection_id = target_connection_id
                and link.object_type = 'third_parties'
                and link.direction = 'inbound'
                and link.external_id = source_record ->> 'counterparty_external_id';
              if not found then
                item_status := 'failed';
                item_error_code := 'COUNTERPARTY_NOT_IMPORTED';
                item_error_details := jsonb_build_object('field', 'counterparty_external_id');
              end if;
            end if;

            if item_status is null then
              select invoice.id into local_record_id
              from public.invoices as invoice
              where invoice.company_id = target_company_id
                and invoice.invoice_number = source_record ->> 'invoice_number'
              limit 1;

              if found then
                item_status := 'ignored';
                item_error_code := 'INVOICE_NUMBER_EXISTS';
              else
                insert into public.invoices (
                  company_id, invoice_number, type, date, due_date, third_party_id, third_party_name,
                  amount_ht, amount_tva, amount_ttc, tva_rate, status, notes
                ) values (
                  target_company_id,
                  source_record ->> 'invoice_number',
                  source_record ->> 'type',
                  (source_record ->> 'date')::date,
                  nullif(source_record ->> 'due_date', '')::date,
                  counterparty_id,
                  source_record ->> 'third_party_name',
                  (source_record ->> 'amount_ht')::numeric,
                  (source_record ->> 'amount_tva')::numeric,
                  (source_record ->> 'amount_ttc')::numeric,
                  (source_record ->> 'tva_rate')::numeric,
                  'brouillon',
                  source_record ->> 'notes'
                ) returning id into local_record_id;

                insert into public.integration_object_links (
                  company_id, connection_id, object_type, direction, external_id, local_record_id
                ) values (
                  target_company_id, target_connection_id, target_object_type,
                  'inbound', source_external_id, local_record_id
                );
                item_status := 'written';
              end if;
            end if;
          end if;
        else
          source_external_id := coalesce(
            nullif(source_record ->> 'external_id', ''),
            case when nullif(source_record ->> 'siret', '') is not null then 'siret:' || (source_record ->> 'siret') end,
            case when nullif(source_record ->> 'siren', '') is not null then 'siren:' || (source_record ->> 'siren') end,
            case when nullif(source_record ->> 'code', '') is not null then 'code:' || (source_record ->> 'code') end
          );

          select link.local_record_id into local_record_id
          from public.integration_object_links as link
          where company_id = target_company_id
            and link.connection_id = target_connection_id
            and link.object_type = target_object_type
            and link.direction = 'inbound'
            and link.external_id = source_external_id;

          if found then
            item_status := 'ignored';
            item_error_code := 'ALREADY_LINKED';
          else
            select id into local_record_id
            from public.third_parties
            where company_id = target_company_id
              and (
                (nullif(source_record ->> 'code', '') is not null and code = source_record ->> 'code')
                or (nullif(source_record ->> 'siret', '') is not null and siret = source_record ->> 'siret')
              )
            limit 1;

            if found then
              item_status := 'ignored';
              item_error_code := 'PARTY_IDENTITY_EXISTS';
            else
              insert into public.third_parties (
                company_id, code, type, name, contact_name, email, phone, address,
                address_line_2, postal_code, city, country, siret, siren, tva_number,
                legal_form, website, account_code, payment_terms, payment_method, notes
              ) values (
                target_company_id,
                nullif(source_record ->> 'code', ''),
                source_record ->> 'type',
                source_record ->> 'name',
                source_record ->> 'contact_name',
                source_record ->> 'email',
                source_record ->> 'phone',
                source_record ->> 'address',
                source_record ->> 'address_line_2',
                source_record ->> 'postal_code',
                source_record ->> 'city',
                source_record ->> 'country',
                source_record ->> 'siret',
                source_record ->> 'siren',
                coalesce(source_record ->> 'vat_number', source_record ->> 'tva_number'),
                source_record ->> 'legal_form',
                source_record ->> 'website',
                source_record ->> 'account_code',
                nullif(source_record ->> 'payment_terms', '')::integer,
                source_record ->> 'payment_method',
                source_record ->> 'notes'
              ) returning id into local_record_id;

              insert into public.integration_object_links (
                company_id, connection_id, object_type, direction, external_id, local_record_id
              ) values (
                target_company_id, target_connection_id, target_object_type,
                'inbound', source_external_id, local_record_id
              );
              item_status := 'written';
            end if;
          end if;
        end if;
      exception
        when unique_violation then
          item_status := 'ignored';
          item_error_code := 'DESTINATION_KEY_EXISTS';
          item_error_details := '{}'::jsonb;
        when others then
          item_status := 'failed';
          item_error_code := 'DESTINATION_WRITE_FAILED';
          item_error_details := jsonb_build_object('sqlstate', SQLSTATE);
      end;
    end if;

    insert into public.integration_run_items (
      company_id, run_id, object_type, record_number, external_id,
      status, error_code, error_details
    ) values (
      target_company_id, target_run_id, target_object_type, current_record_number,
      nullif(source_record ->> 'external_id', ''), item_status,
      item_error_code, item_error_details
    ) on conflict (run_id, object_type, record_number) do nothing;
  end loop;

  return jsonb_array_length(target_records);
end;
$$;

create or replace function public.complete_integration_run_batch(
  target_run_id uuid,
  target_company_id uuid,
  target_object_type text,
  target_lease_token uuid,
  target_next_record_number integer,
  target_has_more boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_scope public.integration_run_scopes%rowtype;
  target_counts record;
  target_run_status text;
  target_scope_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into target_scope
  from public.integration_run_scopes
  where run_id = target_run_id
    and company_id = target_company_id
    and object_type = target_object_type
    and lease_token = target_lease_token
  for update;
  if not found then
    raise exception 'integration batch lease expired' using errcode = '40001';
  end if;

  select
    count(*)::integer as read_count,
    count(*) filter (where status = 'written')::integer as written_count,
    count(*) filter (where status = 'ignored')::integer as ignored_count,
    count(*) filter (where status in ('failed', 'unmapped'))::integer as failed_count
  into target_counts
  from public.integration_run_items
  where run_id = target_run_id and object_type = target_object_type;

  target_scope_status := case
    when target_has_more then 'queued'
    when target_counts.failed_count > 0 or target_counts.ignored_count > 0 then 'complete_with_exceptions'
    else 'complete'
  end;
  target_run_status := case
    when target_has_more then 'queued'
    when target_counts.failed_count > 0 or target_counts.ignored_count > 0 then 'partially_succeeded'
    else 'succeeded'
  end;

  update public.integration_run_scopes
  set next_record_number = target_next_record_number,
      read_count = target_counts.read_count,
      archived_count = target_counts.read_count,
      written_count = target_counts.written_count,
      ignored_count = target_counts.ignored_count,
      failed_count = target_counts.failed_count,
      status = target_scope_status,
      lease_token = null,
      lease_expires_at = null,
      completed_at = case when target_has_more then null else now() end
  where id = target_scope.id;

  update public.integration_runs
  set status = target_run_status,
      read_count = target_counts.read_count,
      written_count = target_counts.written_count,
      ignored_count = target_counts.ignored_count,
      failed_count = target_counts.failed_count,
      completed_at = case when target_has_more then null else now() end
  where id = target_run_id and company_id = target_company_id;

  if not target_has_more then
    update public.integration_previews
    set status = 'consumed'
    where id = (
      select preview_id from public.integration_runs
      where id = target_run_id and company_id = target_company_id
    );

    if target_run_status = 'succeeded' and not exists (
      select 1 from public.integration_runs
      where id = target_run_id and company_id = target_company_id
        and parent_run_id is not null
    ) then
      delete from public.integration_preview_items
      where preview_id = (
        select preview_id from public.integration_runs
        where id = target_run_id and company_id = target_company_id
      )
        and company_id = target_company_id;
    end if;
  end if;

  return jsonb_build_object(
    'status', target_run_status,
    'read_count', target_counts.read_count,
    'written_count', target_counts.written_count,
    'ignored_count', target_counts.ignored_count,
    'failed_count', target_counts.failed_count
  );
end;
$$;

revoke all on function public.claim_integration_run_scope(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.apply_integration_batch(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_integration_run_batch(uuid, uuid, text, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.claim_integration_run_scope(uuid, uuid, text, uuid) to service_role;
grant execute on function public.apply_integration_batch(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.complete_integration_run_batch(uuid, uuid, text, uuid, integer, boolean) to service_role;