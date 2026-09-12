import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  DollarSign, 
  Percent,
  AlertTriangle,
  Target
} from 'lucide-react';
import { LineChart, Line, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import { fr } from 'date-fns/locale';
import AmountDisplay from '@/components/common/AmountDisplay';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

export default function FinancialManagement() {
  const { user } = useUser();
  const [period, setPeriod] = useState('month');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('invoices').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id).eq('is_validated', true); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  // Calcul des KPIs financiers
  const kpis = useMemo(() => {
    const currentMonth = new Date();
    const lastMonth = subMonths(currentMonth, 1);
    const yearStart = startOfYear(currentMonth);

    const filterByPeriod = (items, startDate, endDate) => {
      return items.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= startDate && itemDate <= endDate;
      });
    };

    // Chiffre d'affaires
    const currentMonthInvoices = filterByPeriod(invoices, startOfMonth(currentMonth), endOfMonth(currentMonth));
    const lastMonthInvoices = filterByPeriod(invoices, startOfMonth(lastMonth), endOfMonth(lastMonth));
    const yearInvoices = filterByPeriod(invoices, yearStart, new Date());

    const caMonth = currentMonthInvoices
      .filter(inv => (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée')
      .reduce((sum, inv) => sum + (inv.amount_ht || 0), 0);

    const caLastMonth = lastMonthInvoices
      .filter(inv => (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée')
      .reduce((sum, inv) => sum + (inv.amount_ht || 0), 0);

    const caYear = yearInvoices
      .filter(inv => (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée')
      .reduce((sum, inv) => sum + (inv.amount_ht || 0), 0);

    // Charges
    const chargesMonth = entries
      .filter(e => {
        const date = new Date(e.date);
        return date >= startOfMonth(currentMonth) && date <= endOfMonth(currentMonth) &&
               e.account_code?.startsWith('6');
      })
      .reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);

    const chargesYear = entries
      .filter(e => {
        const date = new Date(e.date);
        return date >= yearStart && e.account_code?.startsWith('6');
      })
      .reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);

    // Résultat
    const resultatMonth = caMonth - chargesMonth;
    const resultatYear = caYear - chargesYear;

    // Marge
    const margeMonth = caMonth > 0 ? (resultatMonth / caMonth) * 100 : 0;
    const margeYear = caYear > 0 ? (resultatYear / caYear) * 100 : 0;

    // Trésorerie
    const tresorerie = entries
      .filter(e => e.account_code?.startsWith('5'))
      .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0);

    // DSO (Days Sales Outstanding)
    const unpaidInvoices = invoices.filter(inv => 
      (inv.type?.trim() || 'fournisseur') === 'client' && inv.status !== 'payée' && inv.status !== 'annulée'
    );
    const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);
    const avgDailySales = caMonth / 30;
    const dso = avgDailySales > 0 ? unpaidAmount / avgDailySales : 0;

    // Évolution CA
    const caTrend = caLastMonth > 0 ? ((caMonth - caLastMonth) / caLastMonth * 100) : 0;

    return {
      caMonth,
      caYear,
      chargesMonth,
      chargesYear,
      resultatMonth,
      resultatYear,
      margeMonth,
      margeYear,
      tresorerie,
      dso,
      caTrend,
      unpaidAmount
    };
  }, [invoices, entries]);

  // Données pour graphiques
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      const monthInvoices = invoices.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate >= start && invDate <= end && (inv.type?.trim() || 'fournisseur') === 'client' && inv.status === 'payée';
      });

      const monthEntries = entries.filter(e => {
        const eDate = new Date(e.date);
        return eDate >= start && eDate <= end && e.account_code?.startsWith('6');
      });

      const ca = monthInvoices.reduce((sum, inv) => sum + (inv.amount_ht || 0), 0);
      const charges = monthEntries.reduce((sum, e) => sum + (e.debit || 0), 0);

      months.push({
        name: format(date, 'MMM', { locale: fr }),
        CA: Math.round(ca),
        Charges: Math.round(charges),
        Résultat: Math.round(ca - charges)
      });
    }
    return months;
  }, [invoices, entries]);

  const chargesRepartition = useMemo(() => {
    const classes = {
      '60': { name: 'Achats', value: 0 },
      '61': { name: 'Services extérieurs', value: 0 },
      '62': { name: 'Autres services', value: 0 },
      '63': { name: 'Impôts et taxes', value: 0 },
      '64': { name: 'Personnel', value: 0 },
      '65': { name: 'Autres charges', value: 0 },
    };

    entries.forEach(e => {
      if (e.account_code?.startsWith('6')) {
        const prefix = e.account_code.substring(0, 2);
        if (classes[prefix]) {
          classes[prefix].value += parseFloat(e.debit) || 0;
        }
      }
    });

    return Object.values(classes).filter(c => c.value > 0);
  }, [entries]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <ProtectedRoute>
      <div className="space-y-6">
      <PageHeader
        title="Gestion Financière"
        subtitle="Tableaux de bord et KPIs financiers"
      />

      {/* KPIs principaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="CA du mois"
          value={<AmountDisplay amount={kpis.caMonth} size="xl" />}
          icon={DollarSign}
          variant="primary"
          trend={kpis.caTrend > 0 ? 'up' : 'down'}
          trendValue={`${Math.abs(kpis.caTrend).toFixed(1)}%`}
        />
        <StatCard
          title="Résultat du mois"
          value={<AmountDisplay amount={kpis.resultatMonth} size="xl" />}
          icon={TrendingUp}
          variant={kpis.resultatMonth >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Marge nette"
          value={`${kpis.margeMonth.toFixed(1)}%`}
          icon={Percent}
          variant="default"
        />
        <StatCard
          title="Trésorerie"
          value={<AmountDisplay amount={kpis.tresorerie} size="xl" />}
          icon={Target}
          variant={kpis.tresorerie >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* KPIs secondaires */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Créances clients (DSO)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-slate-800">{kpis.dso.toFixed(0)} jours</p>
              <AmountDisplay amount={kpis.unpaidAmount} size="sm" className="text-slate-600" />
              <p className="text-xs text-slate-500">Délai moyen de paiement</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CA annuel (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <AmountDisplay amount={kpis.caYear} size="xl" className="text-slate-800" />
              <p className="text-xs text-slate-500">Depuis le 1er janvier</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Résultat annuel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <AmountDisplay 
                amount={kpis.resultatYear} 
                size="xl" 
                className={kpis.resultatYear >= 0 ? 'text-emerald-600' : 'text-red-600'} 
              />
              <p className="text-xs text-slate-500">Marge: {kpis.margeYear.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques */}
      <Tabs defaultValue="evolution" className="space-y-6">
        <TabsList>
          <TabsTrigger value="evolution">Évolution</TabsTrigger>
          <TabsTrigger value="charges">Charges</TabsTrigger>
          <TabsTrigger value="ratios">Ratios</TabsTrigger>
        </TabsList>

        <TabsContent value="evolution" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Évolution CA vs Charges</CardTitle>
              <CardDescription>Suivi mensuel des 6 derniers mois</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value.toLocaleString('fr-FR')} €`} />
                  <Legend />
                  <Line type="monotone" dataKey="CA" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="Charges" stroke="#ef4444" strokeWidth={2} />
                  <Line type="monotone" dataKey="Résultat" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charges" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Répartition des charges</CardTitle>
                <CardDescription>Par classe comptable</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RePieChart>
                    <Pie
                      data={chargesRepartition}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {chargesRepartition.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value.toLocaleString('fr-FR')} €`} />
                  </RePieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Détail des charges</CardTitle>
                <CardDescription>Montants par catégorie</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {chargesRepartition.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="font-medium text-slate-700">{item.name}</span>
                      </div>
                      <AmountDisplay amount={item.value} size="sm" className="font-semibold" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ratios" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Ratios de rentabilité</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl">
                  <span className="font-medium text-slate-700">Marge brute</span>
                  <span className="text-2xl font-bold text-blue-600">{kpis.margeMonth.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl">
                  <span className="font-medium text-slate-700">Taux de charges</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    {kpis.caMonth > 0 ? ((kpis.chargesMonth / kpis.caMonth) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ratios de liquidité</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-purple-50 rounded-xl">
                  <span className="font-medium text-slate-700">DSO (jours)</span>
                  <span className="text-2xl font-bold text-purple-600">{kpis.dso.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-amber-50 rounded-xl">
                  <span className="font-medium text-slate-700">Créances clients</span>
                  <AmountDisplay amount={kpis.unpaidAmount} size="lg" className="font-bold text-amber-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </ProtectedRoute>
  );
}