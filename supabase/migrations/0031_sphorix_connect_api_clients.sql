create table public.integration_api_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  token_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint integration_api_clients_name_check
    check (char_length(name) between 2 and 100),
  constraint integration_api_clients_prefix_check
    check (key_prefix like 'spx_live_%'),
  constraint integration_api_clients_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint integration_api_clients_scopes_check
    check (
      cardinality(scopes) between 1 and 7
      and scopes <@ array[
        'connections:read', 'connections:write',
        'transfers:read', 'transfers:write', 'transfers:process', 'transfers:retry',
        'uploads:write'
      ]::text[]
    ),
  unique (id, company_id)
);

create index integration_api_clients_company_idx
  on public.integration_api_clients(company_id, created_at desc);

alter table public.integration_api_clients enable row level security;
revoke all on public.integration_api_clients from anon, authenticated;
grant all on public.integration_api_clients to service_role;