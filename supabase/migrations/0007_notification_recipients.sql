-- Une notification dédupliquée peut être destinée à plusieurs utilisateurs.

drop index if exists public.notifications_company_dedupe_key_idx;

create unique index if not exists notifications_company_recipient_dedupe_key_idx
  on public.notifications(company_id, user_id, dedupe_key)
  where dedupe_key is not null;