-- Compatibilite avec les flux historiques qui inserent une piece deja validee.
-- Les validations utilisateur restent controlees par validate_accounting_entry().

drop trigger if exists accounting_entries_force_draft on public.accounting_entries;
