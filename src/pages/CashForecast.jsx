import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useInvoices } from '@/components/hooks/useCompanyData';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import AmountDisplay from '@/components/common/AmountDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarClock, Droplets, Gauge, Landmark, ShieldAlert, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, differenceInDays, format, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';

const scenarioConfig = {
  prudent: { label: 'Prudent', inflow: 0.8, outflow: 1.1, color: '#f97316' },
  realistic: { label: 'Réaliste', inflow: 1, outflow: 1, color: '#0891b2' },
  optimistic: { label: 'Optimiste', inflow: 1.1, outflow: 0.95, color: '#10b981' },
};

const amount = (value) => Math.round(value || 0).toLocaleString('fr-FR');

export default function CashForecast() {
  const { user } = useUser();
  const [scenario, setScenario] = useState('realistic');
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices({ limit: 1000 });
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['bank-transactions', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('bank_transactions').select('*').eq('company_id', user.active_company_id).order('transaction_date', { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const forecast = useMemo(() => {
    const config = scenarioConfig[scenario];
    const today = new Date();
    const currentBalance = transactions.find((transaction) => transaction.balance_after !== null && transaction.balance_after !== undefined)?.balance_after ?? transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const openClientInvoices = invoices.filter((invoice) => invoice.type === 'client' && !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status));
    const openSupplierInvoices = invoices.filter((invoice) => invoice.type === 'fournisseur' && !['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status));
    const weeks = Array.from({ length: 13 }, (_, index) => {
      const weekStart = startOfWeek(addDays(today, index * 7), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      const incoming = openClientInvoices.filter((invoice) => {
        const dueDate = invoice.due_date ? new Date(invoice.due_date) : today;
        return dueDate >= weekStart && dueDate <= weekEnd;
      }).reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
      const outgoing = openSupplierInvoices.filter((invoice) => {
        const dueDate = invoice.due_date ? new Date(invoice.due_date) : today;
        return dueDate >= weekStart && dueDate <= weekEnd;
      }).reduce((sum, invoice) => sum + Number(invoice.amount_ttc || 0), 0);
      const bankMovement = transactions.filter((transaction) => {
        const date = new Date(transaction.transaction_date);
        return date >= weekStart && date <= weekEnd;
      }).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      return { date: weekStart, label: format(weekStart, 'dd MMM', { locale: fr }), encaissements: incoming * config.inflow, décaissements: outgoing * config.outflow, mouvements: bankMovement, solde: 0 };
    });
    let balance = Number(currentBalance || 0);
    forecast.forEach((week) => { balance += week.encaissements - week.décaissements + week.mouvements; week.solde = balance; });
    const totalInflows = forecast.reduce((sum, week) => sum + week.encaissements, 0);
    const totalOutflows = forecast.reduce((sum, week) => sum + week.décaissements, 0);
    const lowest = forecast.reduce((lowestPoint, week) => week.solde < lowestPoint.solde ? week : lowestPoint, forecast[0]);
    return { currentBalance: Number(currentBalance || 0), forecast, totalInflows, totalOutflows, lowest, openClientInvoices, openSupplierInvoices };
  }, [invoices, scenario, transactions]);

  const daysToTension = forecast.lowest?.solde < 0 ? differenceInDays(forecast.lowest.date, new Date()) : null;
  const isLoading = invoicesLoading || transactionsLoading;

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader title="Prévision de trésorerie" subtitle="Anticipez vos encaissements, décaissements et besoins de financement" actions={<Select value={scenario} onValueChange={setScenario}><SelectTrigger className="w-[150px] bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(scenarioConfig).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}</SelectContent></Select>} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Landmark className="h-5 w-5" /></div><div><p className="text-sm text-slate-500">Solde actuel</p><AmountDisplay amount={forecast.currentBalance} size="lg" className="font-bold" /></div></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><ArrowDownRight className="h-5 w-5" /></div><div><p className="text-sm text-slate-500">Encaissements à 90 jours</p><AmountDisplay amount={forecast.totalInflows} size="lg" className="font-bold text-emerald-700" /></div></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><ArrowUpRight className="h-5 w-5" /></div><div><p className="text-sm text-slate-500">Décaissements à 90 jours</p><AmountDisplay amount={forecast.totalOutflows} size="lg" className="font-bold text-amber-700" /></div></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center gap-3"><div className={`rounded-xl p-2.5 ${forecast.lowest?.solde < 0 ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}><Gauge className="h-5 w-5" /></div><div><p className="text-sm text-slate-500">Point bas prévisionnel</p><AmountDisplay amount={forecast.lowest?.solde || 0} size="lg" className={`font-bold ${forecast.lowest?.solde < 0 ? 'text-rose-700' : ''}`} /></div></div></CardContent></Card>
        </div>

        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${forecast.lowest?.solde < 0 ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
          {forecast.lowest?.solde < 0 ? <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600" /> : <TrendingUp className="mt-0.5 h-5 w-5 text-emerald-600" />}
          <div><p className={`font-semibold ${forecast.lowest?.solde < 0 ? 'text-rose-800' : 'text-emerald-800'}`}>{forecast.lowest?.solde < 0 ? 'Tension de trésorerie à anticiper' : 'Position de trésorerie maîtrisée'}</p><p className="mt-1 text-sm text-slate-600">{forecast.lowest?.solde < 0 ? `Le solde devient négatif dans environ ${Math.max(0, daysToTension)} jours dans le scénario ${scenarioConfig[scenario].label.toLowerCase()}.` : `Le solde reste positif sur les 90 prochains jours dans le scénario ${scenarioConfig[scenario].label.toLowerCase()}.`}</p></div>
        </div>

        <Card className="border-slate-200/80 shadow-sm"><CardHeader className="border-b border-slate-100"><div className="flex items-center justify-between"><div><CardTitle className="text-lg">Projection glissante sur 90 jours</CardTitle><p className="mt-1 text-sm text-slate-500">Scénario {scenarioConfig[scenario].label.toLowerCase()} · données factures et banque</p></div><Badge variant="outline" className="gap-1"><CalendarClock className="h-3.5 w-3.5" /> 13 semaines</Badge></div></CardHeader><CardContent className="pt-6"><div className="h-[340px]">{isLoading ? <div className="flex h-full items-center justify-center text-sm text-slate-400">Chargement des mouvements...</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={forecast.forecast} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={scenarioConfig[scenario].color} stopOpacity={0.35} /><stop offset="100%" stopColor={scenarioConfig[scenario].color} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e8edf3" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => `${amount(value)} €`} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 12 }} /><Legend /><Area type="monotone" dataKey="solde" name="Solde prévisionnel" stroke={scenarioConfig[scenario].color} strokeWidth={3} fill="url(#cashFill)" /><Area type="monotone" dataKey="encaissements" name="Encaissements" stroke="#10b981" strokeWidth={2} fill="none" /><Area type="monotone" dataKey="décaissements" name="Décaissements" stroke="#f59e0b" strokeWidth={2} fill="none" /></AreaChart></ResponsiveContainer>}</div></CardContent></Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Encaissements attendus</CardTitle></CardHeader><CardContent className="space-y-3">{forecast.openClientInvoices.slice(0, 5).map((invoice) => <div key={invoice.id} className="flex items-center justify-between rounded-xl bg-emerald-50/70 p-3"><div><p className="text-sm font-semibold text-slate-800">{invoice.third_party_name || invoice.invoice_number}</p><p className="text-xs text-slate-500">Échéance : {invoice.due_date ? format(new Date(invoice.due_date), 'dd/MM/yyyy') : 'À définir'}</p></div><AmountDisplay amount={invoice.amount_ttc} size="sm" className="font-semibold text-emerald-700" /></div>)}{forecast.openClientInvoices.length === 0 && <p className="py-5 text-center text-sm text-slate-400">Aucun encaissement ouvert</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Décaissements attendus</CardTitle></CardHeader><CardContent className="space-y-3">{forecast.openSupplierInvoices.slice(0, 5).map((invoice) => <div key={invoice.id} className="flex items-center justify-between rounded-xl bg-amber-50/70 p-3"><div><p className="text-sm font-semibold text-slate-800">{invoice.third_party_name || invoice.invoice_number}</p><p className="text-xs text-slate-500">Échéance : {invoice.due_date ? format(new Date(invoice.due_date), 'dd/MM/yyyy') : 'À définir'}</p></div><AmountDisplay amount={invoice.amount_ttc} size="sm" className="font-semibold text-amber-700" /></div>)}{forecast.openSupplierInvoices.length === 0 && <p className="py-5 text-center text-sm text-slate-400">Aucun décaissement ouvert</p>}</CardContent></Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
