import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Bell, Calculator, CheckSquare, Gauge, LineChart, Target, Wallet, Workflow } from 'lucide-react';
import { useAccountingEntries, useInvoices } from '@/components/hooks/useCompanyData';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { computeIndicators } from '@/lib/management';
import { createPageUrl } from '@/utils';

const euro = (value) => `${Math.round(value || 0).toLocaleString('fr-FR')} €`;

const modules = [
  { title: 'Tableau de bord', description: 'Vue synthétique des indicateurs et alertes.', page: 'Dashboard', icon: Gauge },
  { title: 'KPI & indicateurs', description: 'Définitions, objectifs, seuils et périodicité.', page: 'KpiManagement', icon: BarChart3 },
  { title: 'Objectifs', description: 'Objectifs annuels, mensuels et analytiques.', page: 'Objectives', icon: Target },
  { title: 'Budgets', description: 'Budgets, consommé, écarts et projections.', page: 'BudgetTracking', icon: Calculator },
  { title: 'Coûts', description: 'Coûts directs, indirects et centres de coûts.', page: 'Costing', icon: Workflow },
  { title: 'Rentabilité', description: 'Marge et contribution par objet d’analyse.', page: 'Profitability', icon: LineChart },
  { title: 'Écarts', description: 'Réalisé contre budget, objectif et période précédente.', page: 'VarianceAnalysis', icon: BarChart3 },
  { title: 'Prévisions', description: 'Atterrissage et scénarios de trésorerie.', page: 'ForecastScenarios', icon: Wallet },
  { title: 'Alertes', description: 'Signaux explicables et priorisés.', page: 'PerformanceAlerts', icon: Bell },
  { title: 'Plans d’action', description: 'Actions correctives et suivi des résultats.', page: 'ActionPlans', icon: CheckSquare },
];

export default function Performance() {
  const year = new Date().getFullYear();
  const { data: entries = [] } = useAccountingEntries();
  const { data: invoices = [] } = useInvoices();
  const indicators = useMemo(() => computeIndicators(entries, { year }), [entries, year]);
  const unpaid = invoices.filter((invoice) => invoice.type === 'client' && !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status));
  const unpaidAmount = unpaid.reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Performance" subtitle="Mesurer, comparer, expliquer et décider à partir des données de l’entreprise." /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Résultat" value={euro(indicators.result)} tone={indicators.result >= 0 ? 'text-emerald-600' : 'text-rose-600'} /><Metric label="Trésorerie" value={euro(indicators.cash)} tone={indicators.cash >= 0 ? 'text-emerald-600' : 'text-rose-600'} /><Metric label="BFR" value={euro(indicators.bfr)} tone="text-slate-900" /><Metric label="Créances clients" value={euro(unpaidAmount)} tone="text-amber-600" /></div><Card><CardHeader><CardTitle>Les dix briques du module</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{modules.map(({ title, description, page, icon: Icon }) => <Link key={title} to={createPageUrl(page)} className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-cyan-300 hover:bg-cyan-50/40"><div className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-cyan-100 group-hover:text-cyan-800"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div><ArrowUpRight className="h-4 w-4 text-slate-400" /></Link>)}</div></CardContent></Card><Card className="border-cyan-200 bg-cyan-50/40"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-semibold text-slate-900">Principe de décision</p><p className="mt-1 text-sm text-slate-600">Chaque recommandation doit citer la donnée, la période, le seuil et l’action proposée.</p></div><Badge variant="outline" className="border-cyan-300 bg-white text-cyan-800">Sources comptables contrôlées</Badge></CardContent></Card></div></ProtectedRoute>;
}

function Metric({ label, value, tone }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></CardContent></Card>;
}
