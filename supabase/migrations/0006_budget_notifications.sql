-- Notifications budgétaires idempotentes.

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists notifications_company_dedupe_key_idx
  on public.notifications(company_id, dedupe_key)
  where dedupe_key is not null;