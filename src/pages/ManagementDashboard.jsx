import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvoices, useAccountingEntries, useThirdParties, useStocks } from '@/components/hooks/useCompanyData';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import AmountDisplay from '@/components/common/AmountDisplay';
import StatusBadge from '@/components/common/StatusBadge';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  FilePlus2,
  Landmark,
  ReceiptText,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  WalletCards,
  Receipt,
  Scale,
  Package,
} from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const formatAmount = (value) => `${Math.round(value || 0).toLocaleString('fr-FR')} €`;

function Sparkline({ values, color }) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="mt-3 flex items-end gap-0.5 h-6">
      {values.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-t"
          style={{ height: `${Math.max(10, (Math.abs(value) / max) * 100)}%`, backgroundColor: color, opacity: 0.35 + (index / values.length) * 0.65 }}
        />
      ))}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, accent, trend, sparkline, sparklineColor }) {
  return (
    <Card className="border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`rounded-full p-2 ${accent}`}><Icon className="h-4 w-4" /></div>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
          </div>
          {trend !== undefined && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="mt-4 text-2xl font-bold tracking-tight text-[#142638]">{value}</p>
        <p className="mt-1 text-xs text-slate-400">{note}</p>
        {sparkline && <Sparkline values={sparkline} color={sparklineColor} />}
      </CardContent>
    </Card>
  );
}

export default function ManagementDashboard() {
  const { user } = useUser();
  const [period, setPeriod] = useState('6');
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: entries = [], isLoading: entriesLoading } = useAccountingEntries();
  const { data: thirdParties = [] } = useThirdParties();
  const { data: stocks = [] } = useStocks();

  const metrics = useMemo(() => {
    const today = new Date();
    const currentStart = startOfMonth(today);
    const previousStart = startOfMonth(subMonths(today, 1));
    const currentInvoices = invoices.filter((invoice) => new Date(invoice.date) >= currentStart);
    const previousInvoices = invoices.filter((invoice) => new Date(invoice.date) >= previousStart && new Date(invoice.date) < currentStart);
    const sales = invoices.filter((invoice) => invoice.type === 'client');
    const purchases = invoices.filter((invoice) => invoice.type === 'fournisseur');
    const totalSales = sales.reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
    const totalPurchases = purchases.reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
    const currentSales = currentInvoices.filter((invoice) => invoice.type === 'client').reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
    const previousSales = previousInvoices.filter((invoice) => invoice.type === 'client').reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
    const outstanding = sales.filter((invoice) => !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    const overdue = sales.filter((invoice) => invoice.due_date && new Date(invoice.due_date) < today && !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status));
    const payableDebt = purchases.filter((invoice) => !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    const paidSales = sales.filter((invoice) => ['payee', 'payée'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    const paidPurchases = purchases.filter((invoice) => ['payee', 'payée'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
    const treasury = paidSales - paidPurchases;
    const validatedEntries = entries.filter((entry) => entry.is_validated);
    const stockValue = stocks.reduce((sum, stock) => sum + Number(stock.quantity || 0) * Number(stock.unit_price || 0), 0);
    const lowStockItems = stocks.filter((stock) => Number(stock.min_quantity || 0) > 0 && Number(stock.quantity || 0) <= Number(stock.min_quantity));
    const trend = previousSales ? ((currentSales - previousSales) / previousSales) * 100 : 0;
    const months = Number(period);
    const chart = Array.from({ length: months }, (_, index) => {
      const month = subMonths(today, months - index - 1);
      const monthStart = startOfMonth(month);
      const nextMonth = startOfMonth(subMonths(today, months - index - 2));
      const monthSales = sales.filter((invoice) => {
        const date = new Date(invoice.date);
        return date >= monthStart && date < nextMonth;
      }).reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
      const monthPurchases = purchases.filter((invoice) => {
        const date = new Date(invoice.date);
        return date >= monthStart && date < nextMonth;
      }).reduce((sum, invoice) => sum + Number(invoice.amount_ht || 0), 0);
      return { month: format(month, 'MMM', { locale: fr }), ventes: monthSales, achats: monthPurchases };
    });
    return { totalSales, totalPurchases, currentSales, outstanding, overdue, payableDebt, treasury, validatedEntries, stockValue, lowStockItems, trend, chart };
  }, [entries, invoices, period, stocks]);

  const recentInvoices = [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const isLoading = invoicesLoading || entriesLoading;
  const marginRate = metrics.totalSales ? ((metrics.totalSales - metrics.totalPurchases) / metrics.totalSales) * 100 : 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen space-y-7 bg-[#f5f7fa] p-1 pb-16">
        {/* Hero Header */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#142638] px-6 py-7 text-white shadow-xl shadow-slate-900/10 lg:px-8">
          <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full border-[36px] border-[#f5871f]/10" />
          <div className="absolute bottom-[-80px] right-40 h-52 w-52 rounded-full border-[24px] border-[#f5871f]/10" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#f5871f]">
                <Activity className="h-4 w-4" /> Vue direction
              </div>
              <h1 className="max-w-2xl text-3xl font-bold tracking-tight lg:text-4xl">Bonjour {user?.display_name?.split(' ')[0] || 'Utilisateur'}, voici la situation de {user?.active_company_name || 'votre société'}.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Une lecture claire de votre activité, de votre rentabilité et des décisions à prendre aujourd’hui.</p>
            </div>
            <p className="hidden lg:block relative italic text-[#ffb774] font-medium text-sm text-right max-w-[220px] pb-3">
              Une comptabilité claire, une gestion plus sereine.
              <svg className="absolute -bottom-1 right-0 w-40" viewBox="0 0 160 12" fill="none">
                <path d="M2 8c26-10 52-10 78-2s52 8 78-2" stroke="#f5871f" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </p>
          </div>
          <div className="relative mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <Link to={createPageUrl('Invoices')}><Button className="gap-2 bg-[#f5871f] text-[#142638] hover:bg-[#e07715] shadow-sm font-semibold"><FilePlus2 className="h-4 w-4" /> Nouvelle facture</Button></Link>
              <Link to={createPageUrl('Entries')}><Button className="gap-2 bg-white/10 text-white hover:bg-white/20 border border-white/20 shadow-sm"><Receipt className="h-4 w-4" /> Saisir écriture</Button></Link>
              <Link to={createPageUrl('FinancialStatements')}><Button variant="outline" className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Scale className="h-4 w-4" /> États Financiers</Button></Link>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300"><CalendarDays className="h-4 w-4 text-[#f5871f]" /> Mis à jour le {format(new Date(), 'd MMMM yyyy', { locale: fr })}</div>
          </div>
        </section>

        {/* Indicateurs Clés */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="Trésorerie" value={formatAmount(metrics.treasury)} note="Encaissé - décaissé (payé)" icon={WalletCards} accent="bg-slate-100 text-slate-600" sparkline={metrics.chart.map((m) => m.ventes - m.achats)} sparklineColor="#64748b" />
          <MetricCard label="Chiffre d'affaires" value={formatAmount(metrics.totalSales)} note="Total facturé hors taxes" icon={TrendingUp} accent="bg-[#f5871f]/10 text-[#f5871f]" trend={metrics.trend} sparkline={metrics.chart.map((m) => m.ventes)} sparklineColor="#f5871f" />
          <MetricCard label="Résultat" value={formatAmount(metrics.totalSales - metrics.totalPurchases)} note={`Marge de ${marginRate.toFixed(1)} %`} icon={Target} accent="bg-slate-100 text-slate-600" sparkline={metrics.chart.map((m) => m.ventes - m.achats)} sparklineColor="#64748b" />
          <MetricCard label="Créances clients" value={formatAmount(metrics.outstanding)} note={`${metrics.overdue.length} facture(s) en retard`} icon={Users} accent={metrics.overdue.length ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'} sparkline={metrics.chart.map((m) => m.ventes * 0.2)} sparklineColor={metrics.overdue.length ? '#d97706' : '#64748b'} />
          <MetricCard label="Dettes fournisseurs" value={formatAmount(metrics.payableDebt)} note="Factures fournisseurs à régler" icon={Landmark} accent="bg-slate-100 text-slate-600" sparkline={metrics.chart.map((m) => m.achats)} sparklineColor="#64748b" />
          <MetricCard label="Niveau des stocks" value={formatAmount(metrics.stockValue)} note={metrics.lowStockItems.length ? `${metrics.lowStockItems.length} article(s) sous seuil` : 'Aucun article sous seuil'} icon={Package} accent={metrics.lowStockItems.length ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'} sparkline={metrics.chart.map((m) => m.achats * 0.4)} sparklineColor={metrics.lowStockItems.length ? '#e11d48' : '#64748b'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div><CardTitle className="text-lg text-slate-950">Performance commerciale</CardTitle><p className="mt-1 text-sm text-slate-500">Ventes et achats sur les dernières périodes</p></div>
              <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-[132px] bg-slate-50"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="6">6 mois</SelectItem><SelectItem value="12">12 mois</SelectItem></SelectContent></Select>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[310px] w-full">{isLoading ? <div className="flex h-full items-center justify-center text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Chargement des indicateurs...</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={metrics.chart} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#142638" stopOpacity={0.3} /><stop offset="100%" stopColor="#142638" stopOpacity={0} /></linearGradient><linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5871f" stopOpacity={0.25} /><stop offset="100%" stopColor="#f5871f" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e8edf3" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => formatAmount(value)} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 24px rgba(15,23,42,.08)' }} /><Area type="monotone" dataKey="ventes" name="Ventes" stroke="#142638" strokeWidth={3} fill="url(#salesFill)" /><Area type="monotone" dataKey="achats" name="Achats" stroke="#f5871f" strokeWidth={2} fill="url(#purchaseFill)" /></AreaChart></ResponsiveContainer>}</div>
              <div className="mt-4 flex gap-5 text-xs font-medium text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#142638]" /> Ventes</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#f5871f]" /> Achats</span></div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-5"><CardTitle className="text-lg text-slate-950">À surveiller</CardTitle><p className="mt-1 text-sm text-slate-500">Les sujets qui méritent votre attention</p></CardHeader>
            <CardContent className="space-y-3 pt-5">
              <Link to={createPageUrl('Invoices')} className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${metrics.overdue.length ? 'border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className={`rounded-full p-2 ${metrics.overdue.length ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}><CircleAlert className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">Créances en retard</p><p className="text-xs text-slate-500">{metrics.overdue.length ? `${metrics.overdue.length} facture(s) à relancer` : 'Aucune relance urgente'}</p></div><ArrowUpRight className={`h-4 w-4 ${metrics.overdue.length ? 'text-rose-500' : 'text-slate-400'}`} /></Link>
              <Link to={createPageUrl('Entries')} className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${entries.length - metrics.validatedEntries.length ? 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className={`rounded-full p-2 ${entries.length - metrics.validatedEntries.length ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}><Clock3 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">Écritures à contrôler</p><p className="text-xs text-slate-500">{entries.length - metrics.validatedEntries.length} écriture(s) non validée(s)</p></div><ArrowUpRight className={`h-4 w-4 ${entries.length - metrics.validatedEntries.length ? 'text-amber-600' : 'text-slate-400'}`} /></Link>
              <Link to={createPageUrl('ThirdParties')} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"><div className="rounded-full bg-slate-100 p-2 text-slate-500"><Users className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">Portefeuille actif</p><p className="text-xs text-slate-500">{thirdParties.length} clients et fournisseurs suivis</p></div><ArrowUpRight className="h-4 w-4 text-slate-400" /></Link>
              <div className="mt-5 rounded-xl bg-[#142638] p-4 text-white"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-300">Factures du mois</span><ReceiptText className="h-4 w-4 text-[#f5871f]" /></div><p className="mt-2 text-2xl font-bold">{invoices.filter((invoice) => new Date(invoice.date) >= startOfMonth(new Date())).length}</p><p className="mt-1 text-xs text-slate-400">{formatAmount(metrics.currentSales)} de ventes HT</p></div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-5"><div><CardTitle className="text-lg text-slate-950">Derniers mouvements</CardTitle><p className="mt-1 text-sm text-slate-500">Les factures les plus récentes de votre activité</p></div><Link to={createPageUrl('Invoices')}><Button variant="ghost" className="gap-2 text-[#f5871f] hover:bg-orange-50">Voir toutes les factures <ArrowUpRight className="h-4 w-4" /></Button></Link></CardHeader>
          <CardContent className="p-0">{recentInvoices.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">Aucune facture récente</div> : <div className="divide-y divide-slate-100">{recentInvoices.map((invoice) => <Link key={invoice.id} to={createPageUrl('Invoices')} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 lg:px-6"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${invoice.type === 'client' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><ReceiptText className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-slate-800">{invoice.invoice_number}</p><Badge variant="outline" className="text-[10px]">{invoice.type === 'client' ? 'Client' : 'Fournisseur'}</Badge></div><p className="mt-1 truncate text-xs text-slate-500">{invoice.third_party_name || 'Tiers non renseigné'} · {invoice.date ? format(new Date(invoice.date), 'dd/MM/yyyy') : '-'}</p></div><div className="text-right"><AmountDisplay amount={invoice.amount_ttc} size="sm" className="font-semibold text-slate-800" /><StatusBadge status={invoice.status} className="mt-1" /></div><ArrowUpRight className="hidden h-4 w-4 text-slate-300 sm:block" /></Link>)}</div>}</CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
