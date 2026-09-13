import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { useBudgets, useBudgetLines, useYearEntries } from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import AmountDisplay from '@/components/common/AmountDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildMonthlyComparison, explainVariance, monthlyBudgetAmounts, round2 } from '@/lib/management';

const euro = (value) => `${Math.round(value || 0).toLocaleString('fr-FR')} €`;

export default function VarianceAnalysis() {
  const { user } = useUser();
  const year = new Date().getFullYear();
  const { data: budgets = [] } = useBudgets();
  const { data: budgetLines = [] } = useBudgetLines();
  const { data: entries = [] } = useYearEntries(year);
  const [budgetId, setBudgetId] = useState('');
  const selectedBudget = budgets.find((budget) => budget.id === (budgetId || budgets[0]?.id));
  const { data: objectives = [] } = useQuery({
    queryKey: ['performance-objectives', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('performance_objectives').select('*').eq('company_id', user.active_company_id).eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const analysis = useMemo(() => {
    if (!selectedBudget) return null;
    const budgeted = round2(monthlyBudgetAmounts(selectedBudget, budgetLines).reduce((sum, value) => sum + value, 0));
    const actualEntries = entries.filter((entry) => {
      if (selectedBudget.account_code && !entry.account_code?.startsWith(selectedBudget.account_code)) return false;
      if (selectedBudget.cost_center_code && entry.cost_center_code !== selectedBudget.cost_center_code) return false;
      return true;
    });
    const actual = actualEntries.reduce((sum, entry) => sum + (selectedBudget.category === 'revenue' ? Number(entry.credit || 0) : Number(entry.debit || 0)), 0);
    const objective = objectives.find((item) => item.name === selectedBudget.name)?.target_value ?? null;
    const explanation = explainVariance({ budgeted, actual, objective, category: selectedBudget.category, entries: actualEntries });
    const months = buildMonthlyComparison({ budget: selectedBudget, budgetLines, entries, year });
    return { ...explanation, budgeted, actual, months };
  }, [budgetLines, entries, objectives, selectedBudget, year]);

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Analyse des écarts" subtitle="Comprenez les écarts entre budget, réalisé et objectif." /><Card><CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Périmètre d’analyse</CardTitle></CardHeader><CardContent><Select value={selectedBudget?.id || ''} onValueChange={setBudgetId}><SelectTrigger className="max-w-md"><SelectValue placeholder="Sélectionner un budget" /></SelectTrigger><SelectContent>{budgets.map((budget) => <SelectItem key={budget.id} value={budget.id}>{budget.name}</SelectItem>)}</SelectContent></Select></CardContent></Card>{analysis && <><div className="grid gap-4 md:grid-cols-3"><Metric label="Budget" value={euro(analysis.budget.budgeted)} /><Metric label="Réalisé" value={euro(analysis.budget.actual)} /><Metric label="Écart" value={euro(analysis.budget.variance)} tone={analysis.budget.isFavorable ? 'text-emerald-600' : 'text-rose-600'} /></div><Card><CardHeader><CardTitle>Écart mensuel</CardTitle></CardHeader><CardContent><div className="divide-y">{analysis.months.map((month) => <div key={month.month} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{month.label}</span><span>{euro(month.budgeted)}</span><span>{euro(month.actual)}</span><span className={month.isFavorable ? 'text-emerald-600' : 'text-rose-600'}>{month.variance > 0 ? <ArrowUpRight className="inline h-4 w-4" /> : <ArrowDownRight className="inline h-4 w-4" />}{euro(month.variance)}</span></div>)}</div></CardContent></Card><Card><CardHeader><CardTitle>Drill-down des écritures responsables</CardTitle></CardHeader><CardContent><div className="space-y-3">{analysis.drivers.map((entry) => <div key={entry.id || `${entry.date}-${entry.label}`} className="flex items-center justify-between rounded-lg border p-3 text-sm"><div><p className="font-medium">{entry.label || 'Écriture sans libellé'}</p><p className="text-xs text-slate-500">{entry.date || 'Date inconnue'} · {entry.account_code || 'Compte inconnu'}</p></div><AmountDisplay amount={entry.amount} /></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">Source : écritures validées</Badge>{analysis.objective && <Badge variant="outline">Écart objectif : {euro(analysis.objective.variance)}</Badge>}</div></CardContent></Card></>}</div></ProtectedRoute>;
}

function Metric({ label, value, tone = 'text-slate-900' }) { return <Card><CardContent className="p-5"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></CardContent></Card>; }
