-- Administration PME : rattachement des invitations, permissions par
-- fonctionnalite, journal d'audit, parametres societe et archivage.

-- ---------------------------------------------------------------------------
-- 1. Invitations : rattachement automatique a l'inscription
-- ---------------------------------------------------------------------------

alter table public.company_users
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz;

/*
  A l'inscription, l'utilisateur recupere les invitations emises pour son
  adresse. Sans ce rattachement, user_id restait nul et les policies RLS
  (qui comparent user_id a auth.uid()) refusaient tout acces a l'invite.
*/
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_company_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;

  update public.company_users
     set user_id = new.id,
         status = 'active',
         accepted_at = now(),
         updated_at = now()
   where lower(user_email) = lower(new.email)
     and user_id is null;

  select company_id into first_company_id
  from public.company_users
  where user_id = new.id and status = 'active'
  order by created_at
  limit 1;

  if first_company_id is not null then
    update public.profiles
       set active_company_id = first_company_id
     where id = new.id and active_company_id is null;
  end if;

  return new;
end;
$$;

/* Rattache les invitations d'un utilisateur deja inscrit au moment de l'invitation. */
create or replace function public.link_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  -- Nom distinct de la colonne company_users.user_email : une variable homonyme
  -- serait resolue avant la colonne et rendrait la comparaison toujours vraie.
  current_email text;
begin
  select email into current_email from auth.users where id = auth.uid();
  if current_email is null then
    return 0;
  end if;

  update public.company_users
     set user_id = auth.uid(),
         status = 'active',
         accepted_at = now(),
         updated_at = now()
   where lower(company_users.user_email) = lower(current_email)
     and user_id is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.link_pending_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Permissions par fonctionnalite
-- ---------------------------------------------------------------------------

/*
  Droits accordes par defaut selon le role. Les permissions explicites de
  company_users.permissions ne peuvent que restreindre ce plafond.
*/
create or replace function public.role_default_permissions(target_role text)
returns jsonb
language sql
immutable
as $$
  select case target_role
    when 'owner' then '{
      "invoices": ["read","create","update","delete"],
      "entries": ["read","create","update","delete","validate"],
      "thirdparties": ["read","create","update","delete"],
      "accounts": ["read","create","update","delete"],
      "bank": ["read","create","update","delete"],
      "budgets": ["read","create","update","delete"],
      "closing": ["read","create","update","delete"],
      "reports": ["read","export"],
      "documents": ["read","create","update","delete"],
      "settings": ["read","update"],
      "users": ["read","create","update","delete"],
      "audit": ["read"]
    }'::jsonb
    when 'admin' then '{
      "invoices": ["read","create","update","delete"],
      "entries": ["read","create","update","delete","validate"],
      "thirdparties": ["read","create","update","delete"],
      "accounts": ["read","create","update","delete"],
      "bank": ["read","create","update","delete"],
      "budgets": ["read","create","update","delete"],
      "closing": ["read","create","update","delete"],
      "reports": ["read","export"],
      "documents": ["read","create","update","delete"],
      "settings": ["read","update"],
      "users": ["read","create","update","delete"],
      "audit": ["read"]
    }'::jsonb
    when 'accountant' then '{
      "invoices": ["read","create","update"],
      "entries": ["read","create","update","validate"],
      "thirdparties": ["read","create","update"],
      "accounts": ["read","create","update"],
      "bank": ["read","create","update"],
      "budgets": ["read","create","update"],
      "closing": ["read","create"],
      "reports": ["read","export"],
      "documents": ["read","create","update"],
      "settings": ["read"],
      "users": ["read"],
      "audit": []
    }'::jsonb
    else '{
      "invoices": ["read"],
      "entries": ["read"],
      "thirdparties": ["read"],
      "accounts": ["read"],
      "bank": ["read"],
      "budgets": ["read"],
      "closing": ["read"],
      "reports": ["read"],
      "documents": ["read"],
      "settings": [],
      "users": [],
      "audit": []
    }'::jsonb
  end;
$$;

create or replace function public.has_feature_permission(
  target_company_id uuid,
  target_feature text,
  target_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  membership record;
  granted jsonb;
  override jsonb;
begin
  select role, permissions into membership
  from public.company_users
  where company_id = target_company_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;

  if membership is null then
    return false;
  end if;

  granted := public.role_default_permissions(membership.role) -> target_feature;
  if granted is null or not (granted ? target_action) then
    return false;
  end if;

  override := membership.permissions -> target_feature;
  if override is null then
    return true;
  end if;

  return override ? target_action;
end;
$$;

grant execute on function public.role_default_permissions(text) to authenticated;
grant execute on function public.has_feature_permission(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Journal d'audit
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  -- Uniquement les champs reellement modifies, sous la forme {champ: [avant, apres]}.
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (action in ('insert', 'update', 'delete'))
);

create index if not exists audit_logs_company_created_idx
  on public.audit_logs(company_id, created_at desc);
create index if not exists audit_logs_entity_idx
  on public.audit_logs(company_id, entity_type, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select using (public.is_company_admin(company_id));

-- Le journal est alimente exclusivement par les triggers : aucune ecriture directe.
revoke insert, update, delete on public.audit_logs from authenticated;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  record_data jsonb;
  old_data jsonb;
  diff jsonb := '{}'::jsonb;
  key text;
  label_column text := coalesce(TG_ARGV[0], 'name');
  actor_email text;
  target_company_id uuid;
begin
  record_data := to_jsonb(coalesce(new, old));
  -- La table companies ne porte pas de company_id : sa cle primaire fait foi.
  if TG_TABLE_NAME = 'companies' then
    target_company_id := nullif(record_data ->> 'id', '')::uuid;
  else
    target_company_id := nullif(record_data ->> 'company_id', '')::uuid;
  end if;

  if TG_OP = 'UPDATE' then
    old_data := to_jsonb(old);
    for key in select jsonb_object_keys(record_data) loop
      if key not in ('updated_at', 'created_at')
         and (old_data -> key) is distinct from (record_data -> key) then
        diff := diff || jsonb_build_object(key, jsonb_build_array(old_data -> key, record_data -> key));
      end if;
    end loop;

    -- Une mise a jour sans changement fonctionnel ne merite pas de trace.
    if diff = '{}'::jsonb then
      return coalesce(new, old);
    end if;
  elsif TG_OP = 'DELETE' then
    diff := to_jsonb(old);
  else
    diff := record_data;
  end if;

  select email into actor_email from auth.users where id = auth.uid();

  insert into public.audit_logs (
    company_id, user_id, user_email, action, entity_type, entity_id, entity_label, changes
  )
  values (
    target_company_id,
    auth.uid(),
    actor_email,
    lower(TG_OP),
    TG_TABLE_NAME,
    nullif(record_data ->> 'id', '')::uuid,
    record_data ->> label_column,
    diff
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('accounting_entries', 'label'),
      ('invoices', 'invoice_number'),
      ('company_users', 'user_email'),
      ('companies', 'name'),
      ('fiscal_years', 'name'),
      ('third_parties', 'name'),
      ('accounts', 'label'),
      ('budgets', 'name'),
      ('monthly_closings', 'status')
    ) as t(table_name, label_column)
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', target.table_name);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$s
       for each row execute function public.audit_row_change(%2$L)',
      target.table_name, target.label_column
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Parametres societe etendus
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists rcs text,
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists vat_regime text,
  add column if not exists tax_regime text,
  add column if not exists default_payment_terms integer,
  add column if not exists legal_mentions text,
  add column if not exists notes_archive text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.companies
  drop constraint if exists companies_payment_terms_check,
  drop constraint if exists companies_vat_regime_check;

alter table public.companies
  add constraint companies_payment_terms_check
    check (default_payment_terms is null or default_payment_terms between 0 and 365) not valid,
  add constraint companies_vat_regime_check
    check (vat_regime is null or vat_regime in ('franchise', 'reel_simplifie', 'reel_normal')) not valid;

-- ---------------------------------------------------------------------------
-- 5. Archivage des societes
-- ---------------------------------------------------------------------------

create or replace function public.archive_company(target_company_id uuid, target_reason text default null)
returns public.companies
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.companies;
begin
  if not public.is_company_admin(target_company_id) then
    raise exception 'insufficient privileges to archive a company' using errcode = '42501';
  end if;

  update public.companies
     set archived_at = now(),
         archived_by = auth.uid(),
         is_active = false,
         notes_archive = target_reason
   where id = target_company_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.restore_company(target_company_id uuid)
returns public.companies
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.companies;
begin
  if not public.is_company_admin(target_company_id) then
    raise exception 'insufficient privileges to restore a company' using errcode = '42501';
  end if;

  update public.companies
     set archived_at = null,
         archived_by = null,
         is_active = true
   where id = target_company_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.archive_company(uuid, text) to authenticated;
grant execute on function public.restore_company(uuid) to authenticated;

/* Une societe archivee est consultable mais figee. */
create or replace function public.prevent_archived_company_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
begin
  target_company_id := coalesce(new.company_id, old.company_id);

  if exists (
    select 1 from public.companies
    where id = target_company_id and archived_at is not null
  ) then
    raise exception 'company is archived' using errcode = '42501', hint = 'archived company';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array['accounting_entries', 'invoices', 'third_parties', 'bank_transactions']
  loop
    execute format('drop trigger if exists archived_company_%1$s on public.%1$s', target);
    execute format(
      'create trigger archived_company_%1$s before insert or update or delete on public.%1$s
       for each row execute function public.prevent_archived_company_change()',
      target
    );
  end loop;
end;
$$;
