import React, { useMemo } from 'react';
import { ArrowUpRight, CheckCircle2, CircleAlert, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccountingEntries, useInvoices, useStocks } from '@/components/hooks/useCompanyData';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { computeIndicators } from '@/lib/management';
import { createPageUrl } from '@/utils';

export default function DecisionAssistant() {
  const year = new Date().getFullYear();
  const { data: entries = [] } = useAccountingEntries();
  const { data: invoices = [] } = useInvoices();
  const { data: stocks = [] } = useStocks();
  const recommendations = useMemo(() => {
    const indicators = computeIndicators(entries, { year });
    const overdue = invoices.filter((invoice) => invoice.type === 'client' && invoice.due_date && new Date(invoice.due_date) < new Date() && !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status));
    const overdueAmount = overdue.reduce((total, invoice) => total + Number(invoice.amount_ttc || 0), 0);
    const lowStock = stocks.filter((stock) => Number(stock.min_quantity || 0) > 0 && Number(stock.quantity || 0) <= Number(stock.min_quantity));
    const items = [];
    if (overdueAmount > 0) items.push({ tone: 'high', title: 'Accélérer le recouvrement client', reason: `${overdue.length} facture(s) échue(s) représentent ${Math.round(overdueAmount).toLocaleString('fr-FR')} €.`, action: 'Ouvrir les créances', page: 'Receivables' });
    if (indicators.cash < 0 || indicators.bfr > 0) items.push({ tone: 'medium', title: 'Surveiller la tension de trésorerie', reason: `La trésorerie est de ${Math.round(indicators.cash).toLocaleString('fr-FR')} € et le BFR de ${Math.round(indicators.bfr).toLocaleString('fr-FR')} €.`, action: 'Analyser la trésorerie', page: 'CashForecast' });
    if (lowStock.length > 0) items.push({ tone: 'medium', title: 'Réviser les seuils et approvisionnements', reason: `${lowStock.length} article(s) sont sous leur seuil configuré.`, action: 'Ouvrir les stocks', page: 'StockManagement' });
    if (indicators.result < 0) items.push({ tone: 'high', title: 'Examiner les charges', reason: `Le résultat de l’exercice est négatif de ${Math.abs(Math.round(indicators.result)).toLocaleString('fr-FR')} €.`, action: 'Analyser les charges', page: 'FinancialManagement' });
    if (!items.length) items.push({ tone: 'good', title: 'Aucune priorité détectée', reason: 'Les indicateurs disponibles ne déclenchent pas de recommandation urgente.', action: 'Consulter les contrôles', page: 'Controls' });
    return items;
  }, [entries, invoices, stocks, year]);

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Aider à décider" subtitle="Recommandations calculées à partir des données contrôlées." /><Card><CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-500" />Priorités explicables</CardTitle></CardHeader><CardContent className="space-y-3">{recommendations.map((recommendation, index) => <div key={`${recommendation.title}-${index}`} className="flex items-start gap-4 rounded-xl border border-slate-200 p-4"><div className={`rounded-lg p-2 ${recommendation.tone === 'high' ? 'bg-rose-50 text-rose-700' : recommendation.tone === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{recommendation.tone === 'good' ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{recommendation.title}</p><Badge variant="outline">Pourquoi : données comptables</Badge></div><p className="mt-1 text-sm text-slate-600">{recommendation.reason}</p><Link to={createPageUrl(recommendation.page)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#f5871f] hover:text-[#e07715]">{recommendation.action}<ArrowUpRight className="h-4 w-4" /></Link></div></div>)}</CardContent></Card></div></ProtectedRoute>;
}
