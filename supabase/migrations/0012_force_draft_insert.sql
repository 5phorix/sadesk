-- Une insertion ne peut jamais créer directement une écriture validée.

create or replace function public.force_accounting_entry_draft()
returns trigger
language plpgsql
as $$
begin
  new.is_validated := false;
  return new;
end;
$$;

drop trigger if exists accounting_entries_force_draft on public.accounting_entries;
create trigger accounting_entries_force_draft
  before insert on public.accounting_entries
  for each row execute function public.force_accounting_entry_draft();
