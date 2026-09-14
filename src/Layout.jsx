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
  TrendingUp,
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
  Scale
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

const navSections = [
  {
    title: 'Comptabilité & Déclarations',
    color: 'text-blue-700',
    dotColor: 'bg-blue-600',
    sectionBg: 'bg-blue-50/35 border-blue-200/70',
    headerBg: 'bg-blue-100/50 text-blue-950 hover:bg-blue-100/80',
    activeBg: 'bg-blue-700 text-white shadow-sm shadow-blue-700/20',
    hoverBg: 'text-slate-700 hover:bg-blue-100/60 hover:text-blue-950',
    iconDefault: 'bg-blue-100/80 text-blue-700',
    items: [
      { name: 'Écritures', icon: Receipt, page: 'Entries', iconColor: 'text-blue-600' },
      { name: 'Journaux', icon: BookOpen, page: 'Journals', iconColor: 'text-blue-600' },
      { name: 'Plan comptable', icon: BookOpen, page: 'Accounts', iconColor: 'text-blue-600' },
      { name: 'Factures', icon: FileText, page: 'Invoices', iconColor: 'text-blue-600' },
      { name: 'Scanner facture', icon: Camera, page: 'ScanInvoice', iconColor: 'text-blue-600' },
      { name: 'Lettrage', icon: Link2, page: 'Lettering', iconColor: 'text-blue-600' },
      { name: 'Rapprochement', icon: Calculator, page: 'BankReconciliation', iconColor: 'text-blue-600' },
      { name: 'Bilan & SIG', icon: Scale, page: 'FinancialStatements', iconColor: 'text-blue-600' },
      { name: 'Grand Livre & Balance', icon: BarChart3, page: 'Reports', iconColor: 'text-blue-600' },
      { name: 'Immobilisations', icon: Landmark, page: 'FixedAssets', iconColor: 'text-blue-600' },
      { name: 'Clôtures mensuelles', icon: CalendarCheck, page: 'MonthlyClosing', iconColor: 'text-blue-600' },
      { name: 'Contrôles comptables', icon: Shield, page: 'Controls', iconColor: 'text-blue-600' },
    ]
  },
  {
    title: 'Trésorerie & Gestion',
    color: 'text-teal-700',
    dotColor: 'bg-teal-600',
    sectionBg: 'bg-teal-50/35 border-teal-200/70',
    headerBg: 'bg-teal-100/50 text-teal-950 hover:bg-teal-100/80',
    activeBg: 'bg-teal-700 text-white shadow-sm shadow-teal-700/20',
    hoverBg: 'text-slate-700 hover:bg-teal-100/60 hover:text-teal-950',
    iconDefault: 'bg-teal-100/80 text-teal-700',
    items: [
      { name: 'Prévision trésorerie', icon: Waves, page: 'CashForecast', iconColor: 'text-teal-600' },
      { name: 'Gestion Financière', icon: TrendingUp, page: 'FinancialManagement', iconColor: 'text-teal-600' },
      { name: 'Créances & Relances', icon: Bell, page: 'Receivables', iconColor: 'text-teal-600' },
      { name: 'Suivi budgétaire', icon: Gauge, page: 'BudgetTracking', iconColor: 'text-teal-600' },
      { name: 'Rentabilité', icon: PieChart, page: 'Profitability', iconColor: 'text-teal-600' },
      { name: 'Compta analytique', icon: Target, page: 'AnalyticalAccounting', iconColor: 'text-teal-600' },
      { name: 'Calcul des coûts', icon: Calculator, page: 'Costing', iconColor: 'text-teal-600' },
      { name: 'Indicateurs Performance', icon: Gauge, page: 'Performance', iconColor: 'text-teal-600' },
      { name: 'Aide à la décision', icon: Lightbulb, page: 'DecisionAssistant', iconColor: 'text-teal-600' },
    ]
  },
  {
    title: 'Commercial & Opérations',
    color: 'text-amber-700',
    dotColor: 'bg-amber-600',
    sectionBg: 'bg-amber-50/35 border-amber-200/70',
    headerBg: 'bg-amber-100/50 text-amber-950 hover:bg-amber-100/80',
    activeBg: 'bg-amber-700 text-white shadow-sm shadow-amber-700/20',
    hoverBg: 'text-slate-700 hover:bg-amber-100/60 hover:text-amber-950',
    iconDefault: 'bg-amber-100/80 text-amber-700',
    items: [
      { name: 'Clients & Fournisseurs', icon: Building2, page: 'ThirdParties', iconColor: 'text-amber-600' },
      { name: 'Gestion des stocks', icon: Package, page: 'StockManagement', iconColor: 'text-amber-600' },
      { name: 'Documents & GED', icon: FolderOpen, page: 'Documents', iconColor: 'text-amber-600' },
      { name: 'Tâches & Équipe', icon: CheckCircle2, page: 'Tasks', iconColor: 'text-amber-600' },
    ]
  },
  {
    title: 'Administration & Système',
    color: 'text-slate-700',
    dotColor: 'bg-slate-600',
    sectionBg: 'bg-slate-100/45 border-slate-200/80',
    headerBg: 'bg-slate-200/60 text-slate-950 hover:bg-slate-200/90',
    activeBg: 'bg-slate-800 text-white shadow-sm shadow-slate-800/20',
    hoverBg: 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-950',
    iconDefault: 'bg-slate-200/80 text-slate-700',
    items: [
      { name: 'Utilisateurs', icon: Users, page: 'CompanyUsers', iconColor: 'text-slate-600' },
      { name: 'Rôles & Permissions', icon: Shield, page: 'RolesManagement', iconColor: 'text-slate-600' },
      { name: "Journal d'audit", icon: History, page: 'AuditLog', iconColor: 'text-slate-600' },
      { name: 'Import / Export FEC', icon: Upload, page: 'ImportExport', iconColor: 'text-slate-600' },
      { name: 'Sauvegarde / Restauration', icon: History, page: 'BackupRestore', iconColor: 'text-slate-600' },
      { name: 'Notifications', icon: Bell, page: 'NotificationSettings', iconColor: 'text-slate-600' },
      { name: 'Paramètres', icon: Settings, page: 'Settings', iconColor: 'text-slate-600' },
      { name: 'Guide & Documentation', icon: BookOpen, page: 'Documentation', iconColor: 'text-slate-600' },
    ]
  }
];

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  
  // Section active par défaut en fonction de la page affichée
  const [openSections, setOpenSections] = useState(() => {
    const validTitles = navSections.map(s => s.title);
    const saved = localStorage.getItem('nav-sections-open-v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(t => validTitles.includes(t));
        }
      } catch {
        // ignore
      }
    }
    return validTitles; // Par défaut, tout est visible et accessible
  });
  
  const { user } = useUser();

  // Ouvre automatiquement la section contenant la page en cours de visite
  React.useEffect(() => {
    if (!currentPageName) return;
    const currentSection = navSections.find(sec => sec.items.some(it => it.page === currentPageName));
    if (currentSection) {
      setOpenSections(prev => {
        if (!prev.includes(currentSection.title)) {
          const updated = [...prev, currentSection.title];
          localStorage.setItem('nav-sections-open-v2', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    }
  }, [currentPageName]);

  const toggleSection = (title) => {
    setOpenSections(prev => {
      const newSections = prev.includes(title)
        ? prev.filter(s => s !== title)
        : [...prev, title];
      localStorage.setItem('nav-sections-open-v2', JSON.stringify(newSections));
      return newSections;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="ltr">
      <style>{`
        :root {
          --primary: #1e3a5f;
          --primary-light: #2d4a6f;
          --accent: #3b82f6;
          --success: #10b981;
          --danger: #ef4444;
        }
      `}</style>

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
                src="/logo%20sadesk.png" 
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
        "fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-50 transition-all duration-300 ease-in-out overflow-y-auto",
        collapsed ? "w-20" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo & Company */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
              <img 
                src="/logo%20sadesk.png" 
                alt="Sadesk Logo" 
                className="h-10 w-10 object-contain flex-shrink-0"
              />
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-lg text-slate-800 tracking-tight">Sadesk</span>
                  {user?.active_company_name && (
                    <span className="text-xs text-slate-500 truncate">{user.active_company_name}</span>
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
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors text-sm"
            >
              <Search className="h-4 w-4" />
              <span>Rechercher...</span>
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-xs text-slate-600">
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

          {/* Sections structurées en 4 grands pôles avec couleurs de fond dédiées */}
          {navSections.map((section) => {
            const isOpen = openSections.includes(section.title);
            return (
              <div 
                key={section.title} 
                className={cn(
                  "rounded-2xl transition-all duration-200 border",
                  collapsed ? "p-1 space-y-1 bg-white border-slate-200" : cn("p-1.5 space-y-1 shadow-2xs", section.sectionBg)
                )}
              >
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors",
                      section.headerBg
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-2 h-2 rounded-full shrink-0 shadow-xs", section.dotColor || 'bg-slate-400')} />
                      <span className="truncate text-[11px]">{section.title}</span>
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
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl transition-all duration-150 group text-xs",
                            isActive 
                              ? section.activeBg 
                              : section.hoverBg
                          )}
                        >
                          <div className={cn(
                            "p-1 rounded-lg transition-colors flex items-center justify-center shrink-0",
                            isActive 
                              ? "bg-white/20 text-white" 
                              : cn("group-hover:bg-white group-hover:shadow-2xs", section.iconDefault)
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
        </nav>

        {/* Collapse Button (Desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute bottom-4 right-4 h-8 w-8 items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-600" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "transition-all duration-300 ease-in-out min-h-screen",
        collapsed ? "lg:ml-20" : "lg:ml-64",
        "pt-16 lg:pt-0"
      )}>
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
      );
      }