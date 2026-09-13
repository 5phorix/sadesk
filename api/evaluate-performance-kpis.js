import { createClient } from '@supabase/supabase-js';
import { evaluateKpiAlert, round2 } from '../src/lib/management.js';

const formulaValue = (formula, entries) => {
  const normalized = String(formula || '').toUpperCase().trim();
  const accountPrefix = normalized.match(/ACCOUNT\s+([0-9]+)/)?.[1];
  const selected = accountPrefix ? entries.filter((entry) => String(entry.account_code || '').startsWith(accountPrefix)) : entries;
  if (normalized.includes('CASH')) return round2(selected.filter((entry) => String(entry.account_code || '').startsWith('5')).reduce((sum, entry) => sum + Number(entry.debit || 0) - Number(entry.credit || 0), 0));
  if (normalized.includes('REVENUE') || normalized.includes('CREDIT')) return round2(selected.reduce((sum, entry) => sum + Number(entry.credit || 0), 0));
  if (normalized.includes('EXPENSE') || normalized.includes('DEBIT')) return round2(selected.reduce((sum, entry) => sum + Number(entry.debit || 0), 0));
  return null;
};

export async function evaluateCompanyKpis(adminClient, companyId, periodStart = new Date().toISOString().slice(0, 7) + '-01') {
  const periodEnd = new Date(new Date(`${periodStart}T00:00:00Z`).getUTCFullYear(), new Date(`${periodStart}T00:00:00Z`).getUTCMonth() + 1, 0).toISOString().slice(0, 10);
  const [{ data: kpis, error: kpiError }, { data: entries, error: entryError }] = await Promise.all([
    adminClient.from('kpi_definitions').select('*').eq('company_id', companyId).eq('is_active', true),
    adminClient.from('accounting_entries').select('account_code, debit, credit, date').eq('company_id', companyId).eq('is_validated', true).gte('date', periodStart).lte('date', periodEnd),
  ]);
  if (kpiError) throw kpiError;
  if (entryError) throw entryError;
  const { data: period, error: periodError } = await adminClient.from('performance_periods').upsert({ company_id: companyId, label: periodStart.slice(0, 7), period_start: periodStart, period_end: periodEnd, status: 'open' }, { onConflict: 'company_id,period_start,period_end' }).select().single();
  if (periodError) throw periodError;

  let evaluated = 0;
  let alerts = 0;
  for (const kpi of kpis || []) {
    const value = formulaValue(kpi.formula, entries || []);
    if (value === null) continue;
    const { error: valueError } = await adminClient.from('kpi_values').upsert({ company_id: companyId, kpi_id: kpi.id, period_id: period.id, value, target_value: kpi.target_value, source_snapshot: { formula: kpi.formula, entry_count: entries?.length || 0, period_start: periodStart, period_end: periodEnd } }, { onConflict: 'kpi_id,period_id' });
    if (valueError) throw valueError;
    evaluated += 1;
    const alert = evaluateKpiAlert(kpi, value);
    if (!alert) continue;
    const { data: existing, error: existingError } = await adminClient.from('performance_alerts').select('id').eq('company_id', companyId).eq('kpi_id', kpi.id).eq('status', 'open').limit(1);
    if (existingError) throw existingError;
    if (existing?.length) continue;
    const { data: createdAlert, error: alertError } = await adminClient.from('performance_alerts').insert({ company_id: companyId, kpi_id: kpi.id, level: alert.level, title: `Alerte KPI ${kpi.name}`, message: alert.message, value, threshold: alert.threshold, status: 'open' }).select('id').single();
    if (alertError) throw alertError;
    if (alert.level === 'critical') {
      const { error: actionError } = await adminClient.from('performance_action_plans').insert({
        company_id: companyId,
        alert_id: createdAlert.id,
        title: `Plan d’action - ${kpi.name}`,
        problem: alert.message,
        cause: `Le seuil critique du KPI ${kpi.code} a été franchi.`,
        action: 'Analyser la cause et définir une action corrective.',
        priority: 'critical',
        status: 'todo',
        baseline_value: value,
        target_value: kpi.target_value,
        measurement_unit: kpi.unit,
        expected_result: `Ramener ${kpi.name} sous le seuil de ${alert.threshold}.`,
      });
      if (actionError) throw actionError;
    }
    alerts += 1;
  }
  return { evaluated, alerts, period: periodStart.slice(0, 7) };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) return response.status(401).json({ error: 'Cron non authentifie' });
  try {
    const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: companies, error } = await adminClient.from('companies').select('id');
    if (error) throw error;
    const results = await Promise.all((companies || []).map((company) => evaluateCompanyKpis(adminClient, company.id)));
    return response.status(200).json({ success: true, results });
  } catch (error) {
    console.error('KPI evaluation failed:', error);
    return response.status(500).json({ error: 'Erreur lors de l’évaluation des KPI' });
  }
}
