import React, { useMemo } from 'react';
import { BarChart3, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAccountingEntries } from '@/components/hooks/useCompanyData';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { computeIndicators, monthlyIndicatorSeries } from '@/lib/management';

const euro = (value) => `${Math.round(value || 0).toLocaleString('fr-FR')} €`;

export default function Analysis() {
  const year = new Date().getFullYear();
  const { data: entries = [], isLoading } = useAccountingEntries();
  const indicators = useMemo(() => computeIndicators(entries, { year }), [entries, year]);
  const series = useMemo(() => monthlyIndicatorSeries(entries, year).map((month) => ({ ...month, resultat: month.margin })), [entries, year]);
  const bestMonth = [...series].sort((left, right) => right.margin - left.margin)[0];
  const worstMonth = [...series].sort((left, right) => left.margin - right.margin)[0];

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Analyser" subtitle={`Lecture de l’activité et des équilibres financiers ${year}`} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><AnalysisCard label="Produits" value={euro(indicators.revenue)} icon={TrendingUp} tone="text-emerald-600" /><AnalysisCard label="Charges" value={euro(indicators.expenses)} icon={TrendingDown} tone="text-rose-600" /><AnalysisCard label="Résultat" value={euro(indicators.result)} icon={BarChart3} tone={indicators.result >= 0 ? 'text-emerald-600' : 'text-rose-600'} /><AnalysisCard label="Trésorerie" value={euro(indicators.cash)} icon={Wallet} tone={indicators.cash >= 0 ? 'text-emerald-600' : 'text-rose-600'} /></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]"><Card><CardHeader><CardTitle>Produits, charges et résultat mensuels</CardTitle></CardHeader><CardContent><div className="h-[320px]">{isLoading ? <p>Chargement...</p> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={series}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={(value) => euro(value)} /><Area type="monotone" dataKey="revenue" name="Produits" stroke="#059669" fill="#05966920" /><Area type="monotone" dataKey="expenses" name="Charges" stroke="#e11d48" fill="#e11d4820" /><Area type="monotone" dataKey="margin" name="Résultat" stroke="#1e3a5f" fill="#1e3a5f20" /></AreaChart></ResponsiveContainer>}</div></CardContent></Card><Card><CardHeader><CardTitle>Lecture rapide</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-slate-500">Meilleur mois</p><p className="font-semibold text-emerald-700">{bestMonth?.label || '—'} · {euro(bestMonth?.margin)}</p></div><div><p className="text-slate-500">Mois à surveiller</p><p className="font-semibold text-rose-700">{worstMonth?.label || '—'} · {euro(worstMonth?.margin)}</p></div><div><p className="text-slate-500">BFR</p><p className="font-semibold text-slate-800">{euro(indicators.bfr)}</p></div><div><p className="text-slate-500">Créances moins dettes</p><p className="font-semibold text-slate-800">{euro(indicators.receivables - indicators.payables)}</p></div></CardContent></Card></div></div></ProtectedRoute>;
}

function AnalysisCard({ label, value, icon: Icon, tone }) {
  return <Card><CardContent className="flex items-center justify-between gap-4 p-5"><div><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></div><Icon className={`h-6 w-6 ${tone}`} /></CardContent></Card>;
}
