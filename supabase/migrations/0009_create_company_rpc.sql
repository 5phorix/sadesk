-- Création atomique de la première société et de son membership propriétaire.

create or replace function public.create_company_for_current_user(company_data jsonb)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  created_company public.companies;
begin
  if current_user_id is null then
    raise exception 'Utilisateur non authentifie' using errcode = '42501';
  end if;

  select email into current_email
  from auth.users
  where id = current_user_id;

  if current_email is null then
    raise exception 'Email utilisateur introuvable' using errcode = '42501';
  end if;

  if nullif(trim(company_data ->> 'name'), '') is null then
    raise exception 'Le nom de la société est obligatoire' using errcode = '23502';
  end if;

  insert into public.companies (
    name, siret, tva_number, address, postal_code, city, phone, email,
    legal_form, capital, currency, accounting_plan, country, logo_url,
    owner_email, is_active
  ) values (
    trim(company_data ->> 'name'),
    nullif(trim(company_data ->> 'siret'), ''),
    nullif(trim(company_data ->> 'tva_number'), ''),
    nullif(trim(company_data ->> 'address'), ''),
    nullif(trim(company_data ->> 'postal_code'), ''),
    nullif(trim(company_data ->> 'city'), ''),
    nullif(trim(company_data ->> 'phone'), ''),
    nullif(trim(company_data ->> 'email'), ''),
    nullif(trim(company_data ->> 'legal_form'), ''),
    nullif(trim(company_data ->> 'capital'), ''),
    coalesce(nullif(trim(company_data ->> 'currency'), ''), 'EUR'),
    coalesce(nullif(trim(company_data ->> 'accounting_plan'), ''), 'PCG'),
    coalesce(nullif(trim(company_data ->> 'country'), ''), 'France'),
    nullif(trim(company_data ->> 'logo_url'), ''),
    lower(current_email),
    true
  ) returning * into created_company;

  insert into public.company_users (
    company_id, user_id, user_email, user_name, role, status, permissions
  ) values (
    created_company.id,
    current_user_id,
    lower(current_email),
    coalesce((select display_name from public.profiles where id = current_user_id), current_email),
    'owner',
    'active',
    '{"invoices":{"create":true,"read":true,"update":true,"delete":true},"entries":{"create":true,"read":true,"update":true,"delete":true},"settings":true}'::jsonb
  );

  update public.profiles
  set active_company_id = created_company.id,
      updated_at = now()
  where id = current_user_id;

  return created_company;
end;
$$;

grant execute on function public.create_company_for_current_user(jsonb) to authenticated;
