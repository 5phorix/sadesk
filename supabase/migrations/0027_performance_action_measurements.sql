-- Mesure de l'efficacite des plans d'action.
alter table public.performance_action_plans
  add column if not exists baseline_value numeric(14, 2),
  add column if not exists target_value numeric(14, 2),
  add column if not exists actual_value numeric(14, 2),
  add column if not exists measurement_unit text,
  add column if not exists measured_at date;
