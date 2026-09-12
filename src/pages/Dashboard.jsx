import React, { useEffect, useMemo, useState } from 'react';
import { useInvoices, useAccountingEntries, useThirdParties } from '@/components/hooks/useCompanyData';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { useUser } from '@/components/hooks/useUser';
import { 
  TrendingUp, 
  TrendingDown, 
  FileText,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AmountDisplay from '../components/common/AmountDisplay';
import StatusBadge from '../components/common/StatusBadge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { cn } from '@/lib/utils';
import { loadDashboardPreferences } from '@/lib/dashboardPreferences';

export default function Dashboard() {
  const { user } = useUser();
  const [preferences, setPreferences] = useState(() => loadDashboardPreferences(user?.active_company_id));
  const { data: invoices = [], isLoading: loadingInvoices } = useInvoices();
  const { data: entries = [], isLoading: loadingEntries } = useAccountingEntries();
  const { data: thirdParties = [] } = useThirdParties();

  useEffect(() => {
    setPreferences(loadDashboardPreferences(user?.active_company_id));
  }, [user?.active_company_id]);

  // Calculs statistiques mémoïsés
  const stats = useMemo(() => {
    const currentMonth = new Date();
    const lastMonth = subMonths(currentMonth, 1);

    const filterByMonth = (items, date) => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      return items.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= start && itemDate <= end;
      });
    };

    const currentMonthInvoices = filterByMonth(invoices, currentMonth);
    const lastMonthInvoices = filterByMonth(invoices, lastMonth);
    const currentMonthEntries = filterByMonth(entries, currentMonth);

    // Calculer les ventes à partir des écritures comptables (compte 7XX)
    const salesCurrentMonth = currentMonthEntries
      .filter(e => e.account_code?.startsWith('7'))
      .reduce((sum, e) => sum + (e.credit || 0) - (e.debit || 0), 0);

    const salesLastMonth = lastMonthInvoices
      .filter(inv => (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée')
      .reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);

    // Calculer les achats à partir des écritures comptables (compte 6XX)
    const purchasesCurrentMonth = currentMonthEntries
      .filter(e => e.account_code?.startsWith('6'))
      .reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0);

    const unpaidInvoices = invoices.filter(inv => 
      (inv.type?.trim() || 'fournisseur') === 'client' && inv.status !== 'payée' && inv.status !== 'annulée'
    );

    const overdueInvoices = unpaidInvoices.filter(inv => {
      const dueDate = new Date(inv.due_date);
      return dueDate < new Date();
    });

    const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);

    const salesTrend = salesLastMonth > 0 
      ? ((salesCurrentMonth - salesLastMonth) / salesLastMonth * 100).toFixed(1)
      : 0;

    const recentInvoices = [...invoices]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    const topClients = invoices
      .filter(inv => (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée')
      .reduce((acc, inv) => {
        const name = inv.third_party_name || 'Inconnu';
        acc[name] = (acc[name] || 0) + (inv.amount_ttc || 0);
        return acc;
      }, {});

    const topClientsArray = Object.entries(topClients)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Agrégats supplémentaires pour toutes les factures
    const clientInvoices = invoices.filter(inv => (inv.type?.trim() || 'fournisseur') === 'client');
    const supplierInvoices = invoices.filter(inv => (inv.type?.trim() || 'fournisseur') === 'fournisseur');
    
    const totalClientInvoices = clientInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
    const totalSupplierInvoices = supplierInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
    
    const paidClientInvoices = clientInvoices.filter(inv => inv.status === 'payée');
    const paidSupplierInvoices = supplierInvoices.filter(inv => inv.status === 'payée');
    
    const totalPaidClient = paidClientInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
    const totalPaidSupplier = paidSupplierInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);

    return {
      salesCurrentMonth,
      salesTrend,
      purchasesCurrentMonth,
      unpaidAmount,
      overdueInvoices,
      recentInvoices,
      topClientsArray,
      totalClientInvoices,
      totalSupplierInvoices,
      totalPaidClient,
      totalPaidSupplier,
      clientInvoicesCount: clientInvoices.length,
      supplierInvoicesCount: supplierInvoices.length,
      paidClientCount: paidClientInvoices.length,
      paidSupplierCount: paidSupplierInvoices.length
    };
  }, [invoices, entries]);

  // Données pour graphique évolution 6 derniers mois
  const evolutionData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      const monthInvoices = invoices.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate >= start && invDate <= end && (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée';
      });

      const ca = monthInvoices.reduce((sum, inv) => sum + (inv.amount_ht || 0), 0);

      months.push({
        month: format(date, 'MMM', { locale: fr }),
        CA: Math.round(ca)
      });
    }
    return months;
  }, [invoices]);

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        {/* Hero Header */}
        <div className="bg-gradient-to-br from-[#1e3a5f] via-[#2d4a6f] to-[#1e3a5f] rounded-3xl p-8 text-white shadow-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold mb-2">
                Bienvenue, {user?.full_name?.split(' ')[0] || 'Utilisateur'}
              </h1>
              <p className="text-blue-100 text-lg">
                {user?.active_company_name}
              </p>
              <p className="text-blue-200/80 text-sm mt-1">
                {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
              </p>
            </div>
            <div className="flex gap-3">
              <Link to={createPageUrl('Invoices')}>
                <button className="px-6 py-3 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-xl transition-all font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Nouvelle facture
                </button>
              </Link>
              <Link to={createPageUrl('ScanInvoice')}>
                <button className="px-6 py-3 bg-white hover:bg-blue-50 text-[#1e3a5f] rounded-xl transition-all font-medium flex items-center gap-2 shadow-lg">
                  <ArrowUpRight className="h-4 w-4" />
                  Scanner
                </button>
              </Link>
            </div>
          </div>
        </div>

      {preferences.stats && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg hover:shadow-xl transition-all">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <TrendingUp className="h-6 w-6" />
              </div>
              {stats.salesTrend !== 0 && (
                <div className={cn("flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full", 
                  stats.salesTrend > 0 ? "bg-white/20" : "bg-black/10")}>
                  {stats.salesTrend > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(stats.salesTrend).toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-emerald-100 text-sm mb-1">Chiffre d'affaires</p>
            <AmountDisplay amount={stats.salesCurrentMonth} size="xl" className="text-white font-bold" />
            <p className="text-emerald-200/70 text-xs mt-2">Ce mois-ci</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl transition-all">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <TrendingDown className="h-6 w-6" />
              </div>
            </div>
            <p className="text-blue-100 text-sm mb-1">Achats & Charges</p>
            <AmountDisplay amount={stats.purchasesCurrentMonth} size="xl" className="text-white font-bold" />
            <p className="text-blue-200/70 text-xs mt-2">Ce mois-ci</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg hover:shadow-xl transition-all">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium">
                {stats.overdueInvoices.length}
              </div>
            </div>
            <p className="text-amber-100 text-sm mb-1">Créances impayées</p>
            <AmountDisplay amount={stats.unpaidAmount} size="xl" className="text-white font-bold" />
            <p className="text-amber-200/70 text-xs mt-2">À recouvrer</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-all">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <FileText className="h-6 w-6" />
              </div>
            </div>
            <p className="text-purple-100 text-sm mb-1">Factures totales</p>
            <p className="text-4xl font-bold mb-1">{invoices.length}</p>
            <p className="text-purple-200/70 text-xs mt-2">{thirdParties.length} tiers actifs</p>
          </CardContent>
        </Card>
      </div>}

      {preferences.evolution && <Card className="shadow-lg border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#1e3a5f]" />
                Évolution du chiffre d'affaires
              </CardTitle>
              <CardDescription>Tendance des 6 derniers mois</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={evolutionData}>
              <defs>
                <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
              <Tooltip 
                formatter={(value) => `${value.toLocaleString('fr-FR')} €`}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Area 
                type="monotone" 
                dataKey="CA" 
                stroke="#10b981" 
                strokeWidth={3}
                fill="url(#colorCA)"
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>}

      {preferences.invoiceSummary && <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-lg border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              Factures Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Total factures</span>
                <span className="font-semibold text-slate-800">{stats.clientInvoicesCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Payées</span>
                <span className="font-semibold text-emerald-600">{stats.paidClientCount}</span>
              </div>
              <div className="border-t border-slate-100 pt-3 mt-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600 text-sm">Montant total</span>
                  <AmountDisplay amount={stats.totalClientInvoices} size="sm" className="font-semibold" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 text-sm">Encaissé</span>
                  <AmountDisplay amount={stats.totalPaidClient} size="sm" className="font-semibold text-emerald-600" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingDown className="h-5 w-5 text-blue-600" />
              </div>
              Factures Fournisseurs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Total factures</span>
                <span className="font-semibold text-slate-800">{stats.supplierInvoicesCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Payées</span>
                <span className="font-semibold text-emerald-600">{stats.paidSupplierCount}</span>
              </div>
              <div className="border-t border-slate-100 pt-3 mt-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600 text-sm">Montant total</span>
                  <AmountDisplay amount={stats.totalSupplierInvoices} size="sm" className="font-semibold" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 text-sm">Décaissé</span>
                  <AmountDisplay amount={stats.totalPaidSupplier} size="sm" className="font-semibold text-red-600" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>}

      {preferences.alerts && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Factures en retard */}
        <Card className="shadow-lg border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-red-50 to-white">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              Factures en retard
              <Badge className="bg-red-500 text-white ml-2">{stats.overdueInvoices.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {stats.overdueInvoices.length === 0 ? (
              <p className="text-slate-400 text-center py-8 text-sm">
                Aucune facture en retard
              </p>
            ) : (
              <div className="space-y-3">
                {stats.overdueInvoices.slice(0, 5).map(invoice => (
                  <div 
                    key={invoice.id}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100"
                  >
                    <div>
                      <p className="font-medium text-slate-800 text-sm">
                        {invoice.third_party_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Échéance: {invoice.due_date ? (() => {
                          try {
                            return format(new Date(invoice.due_date), 'dd MMM yyyy', { locale: fr });
                          } catch {
                            return 'Date invalide';
                          }
                        })() : '-'}
                      </p>
                    </div>
                    <AmountDisplay amount={invoice.amount_ttc} size="sm" className="font-semibold" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top clients */}
        <Card className="shadow-lg border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-purple-50 to-white">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              Top 5 clients
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {stats.topClientsArray.length === 0 ? (
              <p className="text-slate-400 text-center py-8 text-sm">
                Aucune donnée disponible
              </p>
            ) : (
              <div className="space-y-3">
                {stats.topClientsArray.map(([name, amount], index) => (
                  <div key={name} className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-50 to-white rounded-xl hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold shadow-lg",
                        index === 0 ? "bg-gradient-to-br from-amber-400 to-amber-500" :
                        index === 1 ? "bg-gradient-to-br from-slate-300 to-slate-400" :
                        index === 2 ? "bg-gradient-to-br from-orange-400 to-orange-500" :
                        "bg-gradient-to-br from-purple-400 to-purple-500"
                      )}>
                        {index + 1}
                      </div>
                      <span className="font-medium text-slate-700">{name}</span>
                    </div>
                    <AmountDisplay amount={amount} size="sm" className="font-bold text-slate-800" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>}

      {preferences.recentActivity && <Card className="shadow-lg border-slate-200 overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-row items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="p-2 bg-slate-100 rounded-lg">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            Activité récente
          </CardTitle>
          <Link 
            to={createPageUrl('Invoices')}
            className="text-sm text-[#1e3a5f] hover:text-[#2d4a6f] font-semibold flex items-center gap-1 transition-colors"
          >
            Voir tout
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-400">Aucune facture récente</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.recentInvoices.map((invoice, idx) => (
                <Link
                  key={invoice.id}
                  to={createPageUrl('Invoices')}
                  className="flex items-center justify-between p-6 hover:bg-gradient-to-r hover:from-slate-50 hover:to-white transition-all group"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center font-bold text-white shadow-md group-hover:scale-110 transition-transform",
                      (invoice.type?.trim() || 'fournisseur') === 'client'
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
                        : "bg-gradient-to-br from-blue-400 to-blue-600"
                    )}>
                      {invoice.invoice_number?.slice(-2) || '00'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-800">{invoice.invoice_number}</p>
                        <StatusBadge status={invoice.type} />
                      </div>
                      <p className="text-sm text-slate-600">{invoice.third_party_name}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {invoice.date ? (() => {
                          try {
                            return format(new Date(invoice.date), 'dd MMM yyyy', { locale: fr });
                          } catch {
                            return 'Date invalide';
                          }
                        })() : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <AmountDisplay amount={invoice.amount_ttc} size="lg" className="font-bold text-slate-800" />
                      <StatusBadge status={invoice.status} className="mt-1" />
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-slate-400 group-hover:text-[#1e3a5f] group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}
      </div>
    </ProtectedRoute>
  );
}