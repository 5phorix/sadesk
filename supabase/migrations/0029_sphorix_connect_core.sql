-- Private archive and tenant-scoped transfer metadata for Sphorix Connect.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sphorix-connect-archives',
  'sphorix-connect-archives',
  false,
  52428800,
  array['text/csv', 'application/json', 'text/plain', 'application/octet-stream']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connector_key text not null,
  display_name text not null,
  status text not null default 'active',
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_status_check
    check (status in ('active', 'disabled', 'error')),
  constraint integration_connections_config_check
    check (jsonb_typeof(configuration) = 'object'),
  unique (id, company_id)
);

create index integration_connections_company_idx
  on public.integration_connections(company_id, created_at desc);

create trigger integration_connections_set_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

create table public.integration_previews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null,
  object_type text not null,
  direction text not null default 'inbound',
  source_path text not null,
  source_file_name text not null,
  source_content_type text not null,
  source_size_bytes bigint not null,
  source_sha256 text not null,
  total_count integer not null default 0,
  valid_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  status text not null default 'ready',
  summary jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint integration_previews_object_check
    check (object_type in ('invoices', 'third_parties')),
  constraint integration_previews_direction_check
    check (direction = 'inbound'),
  constraint integration_previews_counts_check
    check (total_count >= 0 and valid_count >= 0 and duplicate_count >= 0 and invalid_count >= 0),
  constraint integration_previews_size_check
    check (source_size_bytes between 1 and 52428800),
  constraint integration_previews_status_check
    check (status in ('ready', 'consumed', 'expired')),
  constraint integration_previews_summary_check
    check (jsonb_typeof(summary) = 'object'),
  constraint integration_previews_path_check
    check (source_path like company_id::text || '/%'),
  unique (id, company_id),
  foreign key (connection_id, company_id)
    references public.integration_connections(id, company_id) on delete cascade
);

create index integration_previews_company_created_idx
  on public.integration_previews(company_id, created_at desc);

create table public.integration_preview_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  preview_id uuid not null,
  object_type text not null,
  record_number integer not null,
  external_id text,
  source_record jsonb not null,
  status text not null,
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint integration_preview_items_record_check check (record_number > 0),
  constraint integration_preview_items_status_check check (status in ('valid', 'duplicate', 'invalid')),
  constraint integration_preview_items_json_check check (jsonb_typeof(source_record) = 'object' and jsonb_typeof(validation_errors) = 'array'),
  unique (preview_id, record_number),
  foreign key (preview_id, company_id)
    references public.integration_previews(id, company_id) on delete cascade
);

alter table public.integration_preview_items enable row level security;
revoke all on public.integration_preview_items from anon, authenticated;
grant all on public.integration_preview_items to service_role;

create table public.integration_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null,
  preview_id uuid not null,
  parent_run_id uuid references public.integration_runs(id) on delete set null,
  direction text not null default 'inbound',
  mode text not null default 'snapshot',
  status text not null default 'queued',
  idempotency_key text not null,
  total_count integer not null default 0,
  read_count integer not null default 0,
  written_count integer not null default 0,
  ignored_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint integration_runs_direction_check
    check (direction = 'inbound'),
  constraint integration_runs_mode_check
    check (mode in ('snapshot', 'incremental')),
  constraint integration_runs_status_check
    check (status in ('queued', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled')),
  constraint integration_runs_counts_check
    check (total_count >= 0 and read_count >= 0 and written_count >= 0 and ignored_count >= 0 and failed_count >= 0),
  unique (company_id, idempotency_key),
  unique (id, company_id),
  foreign key (connection_id, company_id)
    references public.integration_connections(id, company_id) on delete cascade,
  foreign key (preview_id, company_id)
    references public.integration_previews(id, company_id) on delete restrict
);

create index integration_runs_company_created_idx
  on public.integration_runs(company_id, created_at desc);

create index integration_runs_queue_idx
  on public.integration_runs(status, created_at)
  where status = 'queued';

create unique index integration_runs_one_initial_preview_idx
  on public.integration_runs(preview_id)
  where parent_run_id is null;

create table public.integration_run_scopes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid not null,
  object_type text not null,
  status text not null default 'queued',
  checkpoint jsonb not null default '{}'::jsonb,
  source_count integer,
  read_count integer not null default 0,
  archived_count integer not null default 0,
  written_count integer not null default 0,
  ignored_count integer not null default 0,
  failed_count integer not null default 0,
  reconciliation jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  constraint integration_run_scopes_status_check
    check (status in ('queued', 'running', 'complete', 'complete_with_exceptions', 'partial', 'failed')),
  constraint integration_run_scopes_counts_check
    check (coalesce(source_count, 0) >= 0 and read_count >= 0 and archived_count >= 0 and written_count >= 0 and ignored_count >= 0 and failed_count >= 0),
  constraint integration_run_scopes_json_check
    check (jsonb_typeof(checkpoint) = 'object' and jsonb_typeof(reconciliation) = 'object'),
  unique (run_id, object_type),
  foreign key (run_id, company_id)
    references public.integration_runs(id, company_id) on delete cascade
);

create index integration_run_scopes_company_run_idx
  on public.integration_run_scopes(company_id, run_id);

create table public.integration_run_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid not null,
  object_type text not null,
  record_number integer not null,
  external_id text,
  status text not null,
  error_code text,
  error_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint integration_run_items_status_check
    check (status in ('written', 'ignored', 'failed', 'unmapped')),
  constraint integration_run_items_error_check
    check (jsonb_typeof(error_details) = 'object'),
  unique (run_id, object_type, record_number),
  foreign key (run_id, company_id)
    references public.integration_runs(id, company_id) on delete cascade
);

create index integration_run_items_company_run_idx
  on public.integration_run_items(company_id, run_id, status);

create table public.integration_object_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null,
  object_type text not null,
  direction text not null,
  external_id text not null,
  local_record_id uuid not null,
  source_updated_at timestamptz,
  source_checksum text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint integration_object_links_direction_check
    check (direction in ('inbound', 'outbound')),
  unique (connection_id, object_type, direction, external_id),
  foreign key (connection_id, company_id)
    references public.integration_connections(id, company_id) on delete cascade
);

create index integration_object_links_local_record_idx
  on public.integration_object_links(company_id, object_type, local_record_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'integration_connections',
    'integration_previews',
    'integration_runs',
    'integration_run_scopes',
    'integration_run_items',
    'integration_object_links'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_company_member(company_id))',
      table_name || '_select_member', table_name
    );
  end loop;
end;
$$;