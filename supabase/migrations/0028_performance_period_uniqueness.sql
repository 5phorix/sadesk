-- Une seule période de performance par société et intervalle.
create unique index if not exists performance_periods_company_dates_unique
  on public.performance_periods(company_id, period_start, period_end);
