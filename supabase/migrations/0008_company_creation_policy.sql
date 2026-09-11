-- Autorise la première société même si le profil vient d'être créé à l'instant.
-- Le JWT Supabase est la source d'identité disponible dès l'inscription.

drop policy if exists companies_insert_authenticated on public.companies;

create policy companies_insert_authenticated on public.companies
  for insert to authenticated
  with check (
    lower(owner_email) = lower(coalesce(
      (select email from public.profiles where id = auth.uid()),
      auth.jwt() ->> 'email'
    ))
  );

drop policy if exists company_users_insert_admin on public.company_users;

create policy company_users_insert_admin on public.company_users
  for insert
  with check (
    public.is_company_admin(company_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1
        from public.companies c
        where c.id = company_id
          and lower(c.owner_email) = lower(coalesce(
            (select email from public.profiles where id = auth.uid()),
            auth.jwt() ->> 'email'
          ))
      )
    )
  );
