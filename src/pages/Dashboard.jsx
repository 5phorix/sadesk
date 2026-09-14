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
  BarChart3,
  Receipt,
  BookOpen,
  Calculator,
  Scale,
  PieChart,
  Building2,
  Package,
  FolderOpen,
  Shield,
  Layers,
  Sparkles,
  Link2,
  Waves,
  Camera,
  CheckCircle2,
  Gauge,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Bell,
  History,
  Settings
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { loadDashboardPreferences } from '@/lib/dashboardPreferences';

const DASHBOARD_MODULES = [
  {
    category: 'Comptabilité & Déclarations',
    description: 'Saisie, facturation, états légaux & clôtures',
    badge: 'Comptabilité',
    cardBg: 'bg-linear-to-b from-blue-50/80 via-white to-white border-blue-200/90 hover:border-blue-400',
    headerBadge: 'bg-blue-100 text-blue-800 border-blue-200',
    iconBg: 'bg-blue-600 text-white shadow-sm shadow-blue-500/30',
    pillBg: 'bg-blue-50/70 text-blue-900 border-blue-200/80 hover:bg-blue-600 hover:text-white hover:border-blue-600',
    icon: Receipt,
    links: [
      { name: 'Écritures', page: 'Entries', icon: Receipt },
      { name: 'Journaux', page: 'Journals', icon: BookOpen },
      { name: 'Plan comptable', page: 'Accounts', icon: BookOpen },
      { name: 'Factures', page: 'Invoices', icon: FileText },
      { name: 'Scanner facture', page: 'ScanInvoice', icon: Camera },
      { name: 'Lettrage', page: 'Lettering', icon: Link2 },
      { name: 'Rapprochement', page: 'BankReconciliation', icon: Calculator },
      { name: 'Bilan & SIG', page: 'FinancialStatements', icon: Scale },
      { name: 'Grand Livre & Balance', page: 'Reports', icon: BarChart3 },
      { name: 'Immobilisations', page: 'FixedAssets', icon: Landmark },
      { name: 'Clôtures mensuelles', page: 'MonthlyClosing', icon: CheckCircle2 },
      { name: 'Contrôles comptables', page: 'Controls', icon: Shield },
    ]
  },
  {
    category: 'Trésorerie & Gestion',
    description: 'Flux financiers, budgets, rentabilité & KPI',
    badge: 'Finance & Gestion',
    cardBg: 'bg-linear-to-b from-teal-50/80 via-white to-white border-teal-200/90 hover:border-teal-400',
    headerBadge: 'bg-teal-100 text-teal-800 border-teal-200',
    iconBg: 'bg-teal-600 text-white shadow-sm shadow-teal-500/30',
    pillBg: 'bg-teal-50/70 text-teal-900 border-teal-200/80 hover:bg-teal-600 hover:text-white hover:border-teal-600',
    icon: Waves,
    links: [
      { name: 'Prévision trésorerie', page: 'CashForecast', icon: Waves },
      { name: 'Gestion Financière', page: 'FinancialManagement', icon: TrendingUp },
      { name: 'Créances & relances', page: 'Receivables', icon: AlertCircle },
      { name: 'Suivi budgétaire', page: 'BudgetTracking', icon: Gauge },
      { name: 'Rentabilité', page: 'Profitability', icon: PieChart },
      { name: 'Compta analytique', page: 'AnalyticalAccounting', icon: Layers },
      { name: 'Calcul des coûts', page: 'Costing', icon: Calculator },
      { name: 'Vue Performance', page: 'Performance', icon: Gauge },
      { name: 'Aide à la décision', page: 'DecisionAssistant', icon: Sparkles },
    ]
  },
  {
    category: 'Commercial & Opérations',
    description: 'Partenaires, stocks, documents & tâches',
    badge: 'Opérations',
    cardBg: 'bg-linear-to-b from-amber-50/80 via-white to-white border-amber-200/90 hover:border-amber-400',
    headerBadge: 'bg-amber-100 text-amber-800 border-amber-200',
    iconBg: 'bg-amber-600 text-white shadow-sm shadow-amber-500/30',
    pillBg: 'bg-amber-50/70 text-amber-900 border-amber-200/80 hover:bg-amber-600 hover:text-white hover:border-amber-600',
    icon: Building2,
    links: [
      { name: 'Clients & Fournisseurs', page: 'ThirdParties', icon: Building2 },
      { name: 'Gestion des stocks', page: 'StockManagement', icon: Package },
      { name: 'Documents & GED', page: 'Documents', icon: FolderOpen },
      { name: 'Tâches & Équipe', page: 'Tasks', icon: CheckCircle2 },
    ]
  },
  {
    category: 'Administration & Système',
    description: 'Utilisateurs, audits, imports/exports & paramétrage',
    badge: 'Administration',
    cardBg: 'bg-linear-to-b from-slate-100/80 via-white to-white border-slate-300/90 hover:border-slate-400',
    headerBadge: 'bg-slate-200 text-slate-800 border-slate-300',
    iconBg: 'bg-slate-700 text-white shadow-sm shadow-slate-600/30',
    pillBg: 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-800',
    icon: Shield,
    links: [
      { name: 'Utilisateurs', page: 'CompanyUsers', icon: Users },
      { name: 'Rôles & Permissions', page: 'RolesManagement', icon: Shield },
      { name: "Journal d'audit", page: 'AuditLog', icon: History },
      { name: 'Import / Export FEC', page: 'ImportExport', icon: Layers },
      { name: 'Sauvegarde / Restauration', page: 'BackupRestore', icon: CheckCircle2 },
      { name: 'Notifications', page: 'NotificationSettings', icon: Bell },
      { name: 'Paramètres société', page: 'Settings', icon: Settings },
      { name: 'Guide & Documentation', page: 'Documentation', icon: BookOpen },
    ]
  }
];

export default function Dashboard() {
  const { user } = useUser();
  const [preferences, setPreferences] = useState(() => loadDashboardPreferences(user?.active_company_id));
  const [openModules, setOpenModules] = useState(() => DASHBOARD_MODULES.map(m => m.category));
  const [moduleSearch, setModuleSearch] = useState('');
  const { data: invoices = [], isLoading: loadingInvoices } = useInvoices();
  const { data: entries = [], isLoading: loadingEntries } = useAccountingEntries();
  const { data: thirdParties = [] } = useThirdParties();

  useEffect(() => {
    setPreferences(loadDashboardPreferences(user?.active_company_id));
  }, [user?.active_company_id]);

  const toggleModule = (category) => {
    setOpenModules((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const allExpanded = openModules.length === DASHBOARD_MODULES.length;

  const toggleAllModules = () => {
    if (allExpanded) {
      setOpenModules([]);
    } else {
      setOpenModules(DASHBOARD_MODULES.map(m => m.category));
    }
  };

  const filteredModules = useMemo(() => {
    if (!moduleSearch.trim()) return DASHBOARD_MODULES;
    const q = moduleSearch.toLowerCase();
    return DASHBOARD_MODULES.map(mod => {
      const matchCat = mod.category.toLowerCase().includes(q) || mod.description.toLowerCase().includes(q);
      const matchedLinks = mod.links.filter(l => l.name.toLowerCase().includes(q));
      if (matchCat) return mod;
      if (matchedLinks.length > 0) return { ...mod, links: matchedLinks };
      return null;
    }).filter(Boolean);
  }, [moduleSearch]);

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
              <div className="flex items-center gap-2.5 mb-2">
                <span className="px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-semibold uppercase tracking-wider text-blue-100 border border-white/20">
                  Vue générale d'entreprise
                </span>
                <span className="text-xs text-blue-200">
                  • {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold mb-1 tracking-tight">
                Bonjour, {user?.full_name?.split(' ')[0] || user?.display_name?.split(' ')[0] || 'Utilisateur'}
              </h1>
              <p className="text-blue-100 text-base">
                {user?.active_company_name || 'Votre entreprise'} · Accédez directement à tous vos modules de gestion
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link to={createPageUrl('Invoices')}>
                <button className="px-5 py-2.5 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-xl transition-all text-sm font-medium flex items-center gap-2 border border-white/20">
                  <FileText className="h-4 w-4" />
                  Nouvelle facture
                </button>
              </Link>
              <Link to={createPageUrl('ScanInvoice')}>
                <button className="px-5 py-2.5 bg-white hover:bg-blue-50 text-[#1e3a5f] rounded-xl transition-all text-sm font-semibold flex items-center gap-2 shadow-lg">
                  <Camera className="h-4 w-4" />
                  Scanner facture
                </button>
              </Link>
              <Link to={createPageUrl('Entries')}>
                <button className="px-5 py-2.5 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl transition-all text-sm font-medium flex items-center gap-2 shadow-md">
                  <Receipt className="h-4 w-4" />
                  Saisir écriture
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* MODULES & ACCÈS DIRECTS                                              */}
        {/* ==================================================================== */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2.5">
              <div className="h-3 w-3 rounded-full bg-[#1e3a5f]" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Modules et accès rapides
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-60">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filtrer les modules..."
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-xl"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleAllModules}
                className="gap-1.5 rounded-xl text-xs h-8 bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                {allExpanded ? 'Tout replier' : 'Tout déplier'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredModules.map((mod) => {
              const IconComponent = mod.icon;
              const isExpanded = openModules.includes(mod.category);

              return (
                <div 
                  key={mod.category}
                  className={cn(
                    "rounded-2xl border shadow-xs transition-all duration-200 overflow-hidden",
                    mod.cardBg,
                    isExpanded ? "shadow-md" : "hover:border-slate-300"
                  )}
                >
                  {/* Header cliquable pour déplier/replier */}
                  <button
                    type="button"
                    onClick={() => toggleModule(mod.category)}
                    className="w-full p-4 flex items-center justify-between text-left transition-colors hover:bg-black/5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("p-2 rounded-xl flex items-center justify-center shrink-0", mod.iconBg)}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm truncate">
                            {mod.category}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {mod.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="p-1 rounded-lg bg-white/60 text-slate-600 border border-slate-200/60">
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </div>
                  </button>

                  {/* Zone dépliante / accordéon avec les liens */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100/80 animate-in fade-in-50 duration-200">
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {mod.links.map((linkItem) => {
                          const ItemIcon = linkItem.icon;
                          return (
                            <Link
                              key={linkItem.name}
                              to={createPageUrl(linkItem.page)}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border shadow-2xs group",
                                mod.pillBg
                              )}
                            >
                              <ItemIcon className="h-3.5 w-3.5 opacity-75 group-hover:opacity-100 transition-opacity shrink-0" />
                              <span className="truncate">{linkItem.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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