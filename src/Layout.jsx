import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  BookOpen, 
  BarChart3, 
  Upload, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Building2,
  Calculator,
  Menu,
  X,
  Camera,
  Search,
  Waves,
  Target,
  Link2,
  PieChart,
  CalendarCheck,
  Gauge,
  Package,
  Landmark,
  FolderOpen,
  Globe,
  LogOut,
  Shield,
  Bell,
  History,
  CheckCircle2,
  Lightbulb,
  Scale,
  Compass,
  Wallet,
  LineChart,
  TrendingUp,
  CircleAlert
} from 'lucide-react';import { cn } from '@/lib/utils';
import SearchCommand from '@/components/common/SearchCommand';
import NotificationBell from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Chaque module a une puce et un fin liseré colorés pour s'identifier une fois déplié,
// sur un fond neutre épuré : l'orange de marque reste le seul élément saturé (état actif).
const navSections = [
  {
    title: 'Comptabilité générale',
    dotColor: 'bg-blue-400',
    titleColor: 'text-blue-300',
    accentBorder: 'border-l-4 border-l-blue-400',
    items: [
      { name: 'Plan comptable', icon: BookOpen, page: 'Accounts' },
      { name: 'Écritures', icon: Receipt, page: 'Entries' },
      { name: 'Journaux', icon: BookOpen, page: 'Journals' },
      { name: 'Grand Livre & Balance', icon: BarChart3, page: 'Reports' },
      { name: 'Lettrage', icon: Link2, page: 'Lettering' },
      { name: 'Rapprochement bancaire', icon: Calculator, page: 'BankReconciliation' },
      { name: 'Immobilisations', icon: Landmark, page: 'FixedAssets' },
      { name: 'Clôtures mensuelles', icon: CalendarCheck, page: 'MonthlyClosing' },
      { name: 'Bilan & compte de résultat', icon: Scale, page: 'FinancialStatements' },
      { name: 'Contrôles comptables', icon: Shield, page: 'Controls' },
    ]
  },
  {
    title: 'Analyses et Agrégats',
    dotColor: 'bg-teal-400',
    titleColor: 'text-teal-300',
    accentBorder: 'border-l-4 border-l-teal-400',
    items: [
      { name: 'Analyses et agrégats', icon: TrendingUp, page: 'AnalysesAgregats' },
    ]
  },
  {
    title: 'Facturation & Tiers',
    dotColor: 'bg-violet-400',
    titleColor: 'text-violet-300',
    accentBorder: 'border-l-4 border-l-violet-400',
    items: [
      { name: 'Factures', icon: FileText, page: 'Invoices' },
      { name: 'Scanner facture', icon: Camera, page: 'ScanInvoice' },
      { name: 'Clients & Fournisseurs', icon: Building2, page: 'ThirdParties' },
      { name: 'Créances & Relances', icon: CircleAlert, page: 'Receivables' },
    ]
  },
  {
    title: 'Trésorerie & Financement',
    dotColor: 'bg-emerald-400',
    titleColor: 'text-emerald-300',
    accentBorder: 'border-l-4 border-l-emerald-400',
    items: [
      { name: 'Prévision de trésorerie', icon: Waves, page: 'CashForecast' },
      { name: 'Gestion financière', icon: Wallet, page: 'FinancialManagement' },
    ]
  },
  {
    title: 'Pilotage & Performance',
    dotColor: 'bg-indigo-400',
    titleColor: 'text-indigo-300',
    accentBorder: 'border-l-4 border-l-indigo-400',
    items: [
      { name: 'Analyser', icon: LineChart, page: 'Analysis' },
      { name: 'Compta analytique', icon: Target, page: 'AnalyticalAccounting' },
      { name: 'Calcul des coûts', icon: Calculator, page: 'Costing' },
      { name: 'Rentabilité', icon: PieChart, page: 'Profitability' },
      { name: 'Suivi budgétaire', icon: Gauge, page: 'BudgetTracking' },
      { name: 'Indicateurs & KPI', icon: Gauge, page: 'Performance' },
      { name: 'Aide à la décision', icon: Lightbulb, page: 'DecisionAssistant' },
    ]
  },
  {
    title: 'Stocks & Opérations',
    dotColor: 'bg-cyan-400',
    titleColor: 'text-cyan-300',
    accentBorder: 'border-l-4 border-l-cyan-400',
    items: [
      { name: 'Gestion des stocks', icon: Package, page: 'StockManagement' },
      { name: 'Documents & GED', icon: FolderOpen, page: 'Documents' },
      { name: 'Tâches & Équipe', icon: CheckCircle2, page: 'Tasks' },
    ]
  },
  {
    title: 'Administration & Système',
    dotColor: 'bg-slate-400',
    titleColor: 'text-slate-300',
    accentBorder: 'border-l-4 border-l-slate-400',
    items: [
      { name: 'Utilisateurs', icon: Users, page: 'CompanyUsers' },
      { name: 'Rôles & Permissions', icon: Shield, page: 'RolesManagement' },
      { name: "Journal d'audit", icon: History, page: 'AuditLog' },
      { name: 'Import / Export FEC', icon: Upload, page: 'ImportExport' },
      { name: 'Sauvegarde / Restauration', icon: History, page: 'BackupRestore' },
      { name: 'Notifications', icon: Bell, page: 'NotificationSettings' },
      { name: 'Paramètres', icon: Settings, page: 'Settings' },
      { name: 'Guide & Documentation', icon: BookOpen, page: 'Documentation' },
    ]
  }
];

// Raccourcis des pages les plus utilisées, affichés dans la navbar horizontale
const NAVBAR_LINKS = [
  { name: 'Tableau de bord', page: 'Dashboard', icon: LayoutDashboard },
  { name: 'Écritures', page: 'Entries', icon: Receipt },
  { name: 'Factures', page: 'Invoices', icon: FileText },
  { name: 'Trésorerie', page: 'CashForecast', icon: Waves },
  { name: 'Performance', page: 'Performance', icon: Gauge },
  { name: 'Stocks', page: 'StockManagement', icon: Package },
];

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  
  // Une seule section dépliée à la fois, pour une lecture plus claire de la barre latérale.
  const [openSection, setOpenSection] = useState(() => {
    const validTitles = navSections.map(s => s.title);
    const saved = localStorage.getItem('nav-section-open-v3');
    if (saved && validTitles.includes(saved)) return saved;
    return validTitles[0];
  });
  
  const { user } = useUser();

  // Ouvre automatiquement la section contenant la page en cours de visite
  React.useEffect(() => {
    if (!currentPageName) return;
    const currentSection = navSections.find(sec => sec.items.some(it => it.page === currentPageName));
    if (currentSection && currentSection.title !== openSection) {
      setOpenSection(currentSection.title);
      localStorage.setItem('nav-section-open-v3', currentSection.title);
    }
  }, [currentPageName]);

  const toggleSection = (title) => {
    setOpenSection(prev => {
      const next = prev === title ? null : title;
      localStorage.setItem('nav-section-open-v3', next || '');
      return next;
    });
  };

  const userDisplayName = user?.full_name || user?.display_name || user?.email || 'Utilisateur';
  const userInitials = userDisplayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const handleLogout = () => {
    supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-transparent" dir="ltr">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 flex-1">
            <button 
              onClick={() => setMobileOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu className="h-5 w-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <img 
                src="/logo_sadesk.png"
                alt="Sadesk Logo" 
                className="h-8 w-8 object-contain"
              />
              <div className="flex flex-col">
                <span className="font-semibold text-slate-800 text-sm">Sadesk</span>
                {user?.active_company_name && (
                  <span className="text-xs text-slate-500">{user.active_company_name}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="h-9 w-9"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full bg-[#142638] border-r border-[#263d50] z-50 transition-all duration-300 ease-in-out overflow-y-auto shadow-2xl shadow-slate-950/15",
        collapsed ? "w-20" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo & Company */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
              <img 
                src="/logo_sadesk.png"
                alt="Sadesk Logo" 
                className="h-10 w-10 object-contain flex-shrink-0"
              />
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-lg text-white tracking-tight">Sadesk</span>
                  {user?.active_company_name && (
                    <span className="text-xs text-slate-300 truncate">{user.active_company_name}</span>
                  )}
                </div>
              )}
            </Link>
          </div>
          {!collapsed && user?.active_company_currency && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1">
                  <Globe className="h-3 w-3" />
                  <span className="text-xs">{user.active_company_currency}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.location.href = createPageUrl('CompanySelector')}>
                  <Building2 className="h-4 w-4 mr-2" />
                  Changer de société
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button 
            className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Search button */}
        {!collapsed && (
          <div className="p-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/8 text-slate-300 hover:bg-white/15 transition-colors text-sm border border-white/10"
            >
              <Search className="h-4 w-4" />
              <span>Rechercher...</span>
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/10 px-1.5 font-mono text-xs text-slate-300">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="p-3 pb-24 space-y-3.5">
          {/* Lien direct Tableau de bord */}
          <div className="pb-1">
            <Link
              to={createPageUrl('Dashboard')}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? "Tableau de bord" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-sm border",
                currentPageName === 'Dashboard' 
                  ? "bg-[#1e3a5f] text-white font-bold shadow-md shadow-[#1e3a5f]/20 border-[#1e3a5f]" 
                  : "bg-white text-slate-800 hover:bg-slate-100 border-slate-200/80 font-semibold shadow-2xs"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-lg transition-colors flex items-center justify-center shrink-0",
                currentPageName === 'Dashboard' 
                  ? "bg-white/20 text-white" 
                  : "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white"
              )}>
                <LayoutDashboard className="h-4 w-4" />
              </div>
              {!collapsed && (
                <span className="truncate">Tableau de bord</span>
              )}
            </Link>
          </div>

          {/* Lien direct Liens rapides */}
          <div className="pb-1">
            <Link
              to={createPageUrl('QuickLinks')}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? "Liens rapides" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-sm border",
                currentPageName === 'QuickLinks' 
                  ? "bg-[#1e3a5f] text-white font-bold shadow-md shadow-[#1e3a5f]/20 border-[#1e3a5f]" 
                  : "bg-white text-slate-800 hover:bg-slate-100 border-slate-200/80 font-semibold shadow-2xs"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-lg transition-colors flex items-center justify-center shrink-0",
                currentPageName === 'QuickLinks' 
                  ? "bg-white/20 text-white" 
                  : "bg-orange-50 text-[#f5871f] group-hover:bg-[#f5871f] group-hover:text-white"
              )}>
                <Compass className="h-4 w-4" />
              </div>
              {!collapsed && (
                <span className="truncate">Liens rapides</span>
              )}
            </Link>
          </div>

          {/* Sections structurées en 4 grands pôles avec couleurs de fond dédiées */}
          <div className="pt-5 space-y-3.5">
          {navSections.map((section) => {
            const isOpen = section.title === openSection;
            return (
              <div 
                key={section.title} 
                className={cn(
                      "rounded-xl transition-all duration-200 border bg-white/5 border-white/10",
                      collapsed ? "p-1 space-y-1" : "p-1.5 space-y-1",
                      section.accentBorder
                )}
              >
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors text-slate-300 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-2 h-2 rounded-full shrink-0 shadow-xs", section.dotColor)} />
                      <span className={cn("truncate text-[11px]", section.titleColor)}>{section.title}</span>
                    </div>
                    <ChevronRight className={cn(
                      "h-3.5 w-3.5 transition-transform shrink-0 opacity-70",
                      isOpen && "rotate-90"
                    )} />
                  </button>
                )}
                {(collapsed || isOpen) && (
                  <div className="space-y-0.5 pt-0.5">
                    {section.items.map((item) => {
                      const isActive = currentPageName === item.page;
                      return (
                        <Link
                          key={item.page}
                          to={createPageUrl(item.page)}
                          onClick={() => setMobileOpen(false)}
                          title={collapsed ? item.name : undefined}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all duration-150 group text-xs",
                            isActive 
                              ? "bg-[#f5871f] text-[#142638] font-bold shadow-lg shadow-black/10"
                              : "text-slate-300 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <div className={cn(
                              "p-1 rounded-md transition-colors flex items-center justify-center shrink-0",
                            isActive 
                              ? "bg-black/10 text-[#142638]"
                              : "bg-white/10 text-slate-300 group-hover:bg-white/15"
                          )}>
                            <item.icon className="h-3.5 w-3.5" />
                          </div>
                          {!collapsed && (
                            <span className="truncate font-medium">{item.name}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </nav>

        {/* Collapse Button (Desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute bottom-4 right-4 h-8 w-8 items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-300" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-slate-300" />
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "transition-all duration-300 ease-in-out min-h-screen",
        collapsed ? "lg:ml-20" : "lg:ml-64",
        "pt-16 lg:pt-0"
      )}>
        {/* Navbar desktop : liens rapides, recherche, notifications, utilisateur */}
        <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 backdrop-blur px-6 xl:px-10">
          <nav className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
            {NAVBAR_LINKS.map((link) => {
              const isActive = currentPageName === link.page;
              return (
                <Link
                  key={link.page}
                  to={createPageUrl(link.page)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
                    isActive ? "text-[#142638]" : "text-slate-500 hover:text-[#142638] hover:bg-slate-100"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.name}
                  {isActive && <span className="absolute left-3 right-3 -bottom-[1px] h-0.5 rounded-full bg-[#f5871f]" />}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors text-sm"
            >
              <Search className="h-4 w-4" />
              <span className="hidden xl:inline">Rechercher...</span>
              <kbd className="hidden xl:inline-flex h-5 select-none items-center gap-1 rounded border border-slate-300 bg-white px-1.5 font-mono text-[10px] text-slate-500">⌘K</kbd>
            </button>

            <NotificationBell />

            <div className="h-8 w-px bg-slate-200" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-[#142638] text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {userInitials}
                  </div>
                  <div className="hidden xl:flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold text-slate-800 truncate max-w-[140px]">{userDisplayName}</span>
                    <span className="text-xs text-slate-500 truncate max-w-[140px]">{user?.active_company_name || 'Aucune société'}</span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold text-slate-800 truncate">{userDisplayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  {user?.role && <p className="mt-1 text-[11px] uppercase tracking-wide text-[#f5871f] font-semibold">{user.role}</p>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.href = createPageUrl('CompanySelector')}>
                  <Building2 className="h-4 w-4 mr-2" />
                  Changer de société
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = createPageUrl('Settings')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Paramètres
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="p-4 lg:p-8 xl:p-10">
          <div className="mx-auto max-w-[1680px]">
          {children}
          </div>
        </div>
      </main>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
      );
      }