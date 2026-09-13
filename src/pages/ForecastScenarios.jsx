import React, { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { useAccountingEntries } from '@/components/hooks/useCompanyData';
import { useManagementSettings } from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { forecastScenario, SCENARIOS } from '@/lib/management';
import { toast } from 'sonner';

export default function ForecastScenarios() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const { data: entries = [] } = useAccountingEntries();
  const { data: settings } = useManagementSettings();
  const [remainingRevenue, setRemainingRevenue] = useState(0);
  const [remainingExpenses, setRemainingExpenses] = useState(0);
  const [remainingCashFlow, setRemainingCashFlow] = useState(0);

  const actual = useMemo(() => entries.reduce((summary, entry) => ({
    revenue: summary.revenue + (String(entry.account_code || '').startsWith('7') ? Number(entry.credit || 0) - Number(entry.debit || 0) : 0),
    expenses: summary.expenses + (String(entry.account_code || '').startsWith('6') ? Number(entry.debit || 0) - Number(entry.credit || 0) : 0),
    cash: summary.cash + (String(entry.account_code || '').startsWith('5') ? Number(entry.debit || 0) - Number(entry.credit || 0) : 0),
  }), { revenue: 0, expenses: 0, cash: 0 }), [entries]);

  const scenarios = useMemo(() => SCENARIOS.map((scenario) => {
    const defaultCoefficient = scenario.key === 'prudent' ? 0.85 : scenario.key === 'optimiste' ? 1.15 : 1;
    const coefficient = Number(settings?.[scenario.settingKey] ?? defaultCoefficient);
    return { ...scenario, coefficient, result: forecastScenario({ actualRevenue: actual.revenue, actualExpenses: actual.expenses, remainingRevenue, remainingExpenses, remainingCashFlow, currentCash: actual.cash, coefficient }) };
  }), [actual, remainingCashFlow, remainingExpenses, remainingRevenue, settings]);

  const saveMutation = useMutation({
    mutationFn: async (scenario) => {
      const { error } = await supabase.from('performance_costing_calculations').insert({ company_id: companyId, object_type: 'forecast_scenario', object_key: scenario.key, method: 'FORECAST', model_version: 1, inputs: { actual, remainingRevenue, remainingExpenses, remainingCashFlow, coefficient: scenario.coefficient }, result: scenario.result });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Scénario historisé'); },
    onError: (error) => toast.error(error.message || 'Scénario non historisé'),
  });

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Prévisions et scénarios" subtitle="Comparez les atterrissages prudent, réaliste et optimiste." /><Card><CardHeader><CardTitle>Hypothèses restantes</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><Field label="Produits restants" value={remainingRevenue} onChange={setRemainingRevenue} /><Field label="Charges restantes" value={remainingExpenses} onChange={setRemainingExpenses} /><Field label="Flux de trésorerie restant" value={remainingCashFlow} onChange={setRemainingCashFlow} /></CardContent></Card><div className="grid gap-4 lg:grid-cols-3">{scenarios.map((scenario) => <Card key={scenario.key}><CardHeader><CardTitle className="flex items-center justify-between"><span>{scenario.label}</span><Badge variant="outline">x{scenario.coefficient}</Badge></CardTitle></CardHeader><CardContent className="space-y-4"><Metric label="Produits projetés" value={scenario.result.projectedRevenue} /><Metric label="Résultat projeté" value={scenario.result.projectedResult} /><Metric label="Marge" value={scenario.result.projectedMarginRate} suffix=" %" /><Metric label="Trésorerie" value={scenario.result.projectedCash} /><Button onClick={() => saveMutation.mutate(scenario)} disabled={saveMutation.isPending} variant="outline" className="w-full gap-2"><Save className="h-4 w-4" />Historiser</Button></CardContent></Card>)}</div></div></ProtectedRoute>;
}

function Field({ label, value, onChange }) { return <label className="space-y-2 text-sm"><span className="block text-slate-600">{label}</span><input type="number" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} className="flex h-9 w-full rounded-md border px-3" /></label>; }
function Metric({ label, value, suffix = ' €' }) { return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{label}</span><strong className="text-slate-900">{Math.round(value || 0).toLocaleString('fr-FR')}{suffix}</strong></div>; }
