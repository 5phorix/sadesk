import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { useUser } from '@/components/hooks/useUser';
import {
  Compass,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Search,
  Receipt,
  BookOpen,
  Calculator,
  Scale,
  Landmark,
  CheckCircle2,
  Shield,
  Waves,
  Wallet,
  CircleAlert,
  Gauge,
  LineChart,
  TrendingUp,
  Target,
  PieChart,
  Lightbulb,
  Layers,
  Building2,
  Package,
  FolderOpen,
  Users,
  History,
  Bell,
  Settings,
  FileText,
  Camera,
  Link2,
} from 'lucide-react';

const QUICK_LINK_GROUPS = [
  {
    category: 'Comptabilité générale',
    description: 'Saisie, journaux, bilan & clôtures',
    icon: Receipt,
    links: [
      { name: 'Plan comptable', page: 'Accounts', icon: BookOpen },
      { name: 'Écritures', page: 'Entries', icon: Receipt },
      { name: 'Journaux', page: 'Journals', icon: BookOpen },
      { name: 'Grand Livre & Balance', page: 'Reports', icon: BarChart3 },
      { name: 'Lettrage', page: 'Lettering', icon: Link2 },
      { name: 'Rapprochement bancaire', page: 'BankReconciliation', icon: Calculator },
      { name: 'Immobilisations', page: 'FixedAssets', icon: Landmark },
      { name: 'Clôtures mensuelles', page: 'MonthlyClosing', icon: CheckCircle2 },
      { name: 'Bilan & compte de résultat', page: 'FinancialStatements', icon: Scale },
      { name: 'Contrôles comptables', page: 'Controls', icon: Shield },
    ]
  },
  {
    category: 'Analyses et Agrégats',
    description: 'Soldes intermédiaires, bilan fonctionnel & seuil de rentabilité',
    icon: TrendingUp,
    links: [
      { name: 'Analyses et agrégats', page: 'AnalysesAgregats', icon: TrendingUp },
    ]
  },
  {
    category: 'Facturation & Tiers',
    description: 'Factures, clients, fournisseurs & relances',
    icon: FileText,
    links: [
      { name: 'Factures', page: 'Invoices', icon: FileText },
      { name: 'Scanner facture', page: 'ScanInvoice', icon: Camera },
      { name: 'Clients & Fournisseurs', page: 'ThirdParties', icon: Building2 },
      { name: 'Créances & Relances', page: 'Receivables', icon: CircleAlert },
    ]
  },
  {
    category: 'Trésorerie & Financement',
    description: 'Prévision de trésorerie & gestion financière',
    icon: Waves,
    links: [
      { name: 'Prévision de trésorerie', page: 'CashForecast', icon: Waves },
      { name: 'Gestion financière', page: 'FinancialManagement', icon: Wallet },
    ]
  },
  {
    category: 'Pilotage & Performance',
    description: 'Analyse, budgets, coûts, rentabilité & KPI',
    icon: Gauge,
    links: [
      { name: 'Analyser', page: 'Analysis', icon: LineChart },
      { name: 'Compta analytique', page: 'AnalyticalAccounting', icon: Target },
      { name: 'Calcul des coûts', page: 'Costing', icon: Calculator },
      { name: 'Rentabilité', page: 'Profitability', icon: PieChart },
      { name: 'Suivi budgétaire', page: 'BudgetTracking', icon: Gauge },
      { name: 'Indicateurs & KPI', page: 'Performance', icon: Gauge },
      { name: 'Aide à la décision', page: 'DecisionAssistant', icon: Lightbulb },
    ]
  },
  {
    category: 'Stocks & Opérations',
    description: 'Stocks, documents & tâches d’équipe',
    icon: Package,
    links: [
      { name: 'Gestion des stocks', page: 'StockManagement', icon: Package },
      { name: 'Documents & GED', page: 'Documents', icon: FolderOpen },
      { name: 'Tâches & Équipe', page: 'Tasks', icon: CheckCircle2 },
    ]
  },
  {
    category: 'Administration & Système',
    description: 'Utilisateurs, audits, imports/exports & paramétrage',
    icon: Shield,
    links: [
      { name: 'Utilisateurs', page: 'CompanyUsers', icon: Users },
      { name: 'Rôles & Permissions', page: 'RolesManagement', icon: Shield },
      { name: "Journal d'audit", page: 'AuditLog', icon: History },
      { name: 'Import / Export FEC', page: 'ImportExport', icon: Layers },
      { name: 'Sauvegarde / Restauration', page: 'BackupRestore', icon: History },
      { name: 'Notifications', page: 'NotificationSettings', icon: Bell },
      { name: 'Paramètres', page: 'Settings', icon: Settings },
      { name: 'Guide & Documentation', page: 'Documentation', icon: BookOpen },
    ]
  }
];

export default function QuickLinks() {
  const { user } = useUser();
  const [openGroups, setOpenGroups] = useState(() => QUICK_LINK_GROUPS.map((g) => g.category));
  const [search, setSearch] = useState('');

  const toggleGroup = (category) => {
    setOpenGroups((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const allExpanded = openGroups.length === QUICK_LINK_GROUPS.length;

  const toggleAllGroups = () => {
    setOpenGroups(allExpanded ? [] : QUICK_LINK_GROUPS.map((g) => g.category));
  };

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return QUICK_LINK_GROUPS;
    const q = search.toLowerCase();
    return QUICK_LINK_GROUPS.map((group) => {
      const matchGroup = group.category.toLowerCase().includes(q) || group.description.toLowerCase().includes(q);
      const matchedLinks = group.links.filter((l) => l.name.toLowerCase().includes(q));
      if (matchGroup) return group;
      if (matchedLinks.length > 0) return { ...group, links: matchedLinks };
      return null;
    }).filter(Boolean);
  }, [search]);

  return (
    <ProtectedRoute>
      <div className="space-y-7">
        {/* Bannière */}
        <div className="relative overflow-hidden rounded-[1.25rem] border border-[#263d50] bg-[#142638] p-7 text-white shadow-xl shadow-slate-900/10 lg:p-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[#f5871f]/20" />
          <div className="absolute right-20 top-16 h-32 w-32 rounded-full border border-[#f5871f]/15" />
          <div className="relative flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5871f]/15 text-[#f5871f]">
              <Compass className="h-5 w-5" />
            </div>
            <span className="px-2.5 py-1 bg-[#f5871f]/15 rounded-md text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f5871f] border border-[#f5871f]/25">
              Liens rapides
            </span>
          </div>
          <h1 className="relative text-2xl lg:text-3xl font-semibold mb-1 tracking-[-0.03em]">
            Bonjour {user?.full_name?.split(' ')[0] || user?.display_name?.split(' ')[0] || 'Utilisateur'}, bienvenue dans votre espace comptable.
          </h1>
          <p className="relative max-w-xl text-slate-300 text-sm leading-6">
            Accédez rapidement à vos modules et gérez votre comptabilité en toute simplicité.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Accès rapide</h2>
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Filtrer les modules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-xl"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAllGroups}
              className="gap-1.5 rounded-xl text-xs h-8 bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
              {allExpanded ? 'Tout replier' : 'Tout déplier'}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredGroups.map((group) => {
            const IconComponent = group.icon;
            const isExpanded = openGroups.includes(group.category);

            return (
              <div key={group.category} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.category)}
                  className="w-full flex items-center justify-between text-left transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#f5871f]/50 text-[#f5871f]">
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#142638] text-sm truncate group-hover:text-[#f5871f]">
                        {group.category}
                      </h3>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{group.description}</p>
                    </div>
                  </div>
                  <div className="p-1 text-slate-500 shrink-0 ml-2">
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-50 duration-200">
                    {group.links.map((linkItem) => {
                      const ItemIcon = linkItem.icon;
                      return (
                        <Link
                          key={linkItem.name}
                          to={createPageUrl(linkItem.page)}
                          className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#f5871f]/50 hover:shadow-md"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#f5871f] group-hover:bg-[#f5871f] group-hover:text-white transition-colors">
                            <ItemIcon className="h-4 w-4" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#142638]">{linkItem.name}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#f5871f] group-hover:translate-x-0.5 transition-all" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bannière CTA */}
        <Link
          to={createPageUrl('Performance')}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-orange-100 bg-orange-50 p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5871f]/15 text-[#f5871f]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-[#142638]">Besoin d'une analyse ?</p>
              <p className="text-sm text-slate-600">Accédez à vos tableaux de bord et indicateurs pour piloter votre activité.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-[#f5871f] px-4 py-2 text-sm font-semibold text-[#142638]">
            Voir les tableaux de bord →
          </span>
        </Link>
      </div>
    </ProtectedRoute>
  );
}
