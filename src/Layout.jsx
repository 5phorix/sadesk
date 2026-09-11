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
  CheckCircle2
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
    title: 'Outils Administratifs',
    items: [
      { name: 'Tableau de bord', icon: LayoutDashboard, page: 'Dashboard' },
      { name: 'Tâches', icon: CheckCircle2, page: 'Tasks' },
      { name: 'Notifications', icon: Bell, page: 'NotificationSettings' },
      { name: 'Paramètres', icon: Settings, page: 'Settings' },
    ]
  },
  {
    title: 'Gestion Comptable',
    items: [
      { name: 'Factures', icon: FileText, page: 'Invoices' },
      { name: 'Scanner facture', icon: Camera, page: 'ScanInvoice' },
      { name: 'Écritures', icon: Receipt, page: 'Entries' },
      { name: 'Journaux', icon: BookOpen, page: 'Journals' },
      { name: 'Plan comptable', icon: BookOpen, page: 'Accounts' },
      { name: 'Lettrage', icon: Link2, page: 'Lettering' },
      { name: 'Rapprochement bancaire', icon: Calculator, page: 'BankReconciliation' },
      { name: 'États Financiers', icon: FileText, page: 'FinancialStatements' },
      { name: 'Créances et relances', icon: Bell, page: 'Receivables' },
      { name: 'Immobilisations', icon: Landmark, page: 'FixedAssets' },
    ]
  },
  {
    title: 'Contrôle de gestion',
    items: [
      { name: 'Suivi budgétaire', icon: Gauge, page: 'BudgetTracking' },
      { name: 'Rentabilité', icon: PieChart, page: 'Profitability' },
      { name: 'Analytique', icon: Target, page: 'AnalyticalAccounting' },
      { name: 'Clôtures mensuelles', icon: CalendarCheck, page: 'MonthlyClosing' },
    ]
  },
  {
    title: 'Gestion des Tiers',
    items: [
      { name: 'Tiers', icon: Building2, page: 'ThirdParties' },
    ]
  },
  {
    title: 'Gestion des Stocks',
    items: [
      { name: 'Stocks', icon: Package, page: 'StockManagement' },
    ]
  },
  {
    title: 'Gestion des Documents',
    items: [
      { name: 'Documents', icon: FolderOpen, page: 'Documents' },
    ]
  },
  {
    title: 'Utilisateurs et Permissions',
    items: [
      { name: 'Utilisateurs', icon: Users, page: 'CompanyUsers' },
      { name: 'Rôles & Permissions', icon: Shield, page: 'RolesManagement' },
      { name: "Journal d'audit", icon: History, page: 'AuditLog' },
    ]
  },
  {
    title: 'Rapports',
    items: [
      { name: 'Rapports', icon: BarChart3, page: 'Reports' },
    ]
  },
  {
    title: 'Import/Export',
    items: [
      { name: 'Import/Export', icon: Upload, page: 'ImportExport' },
    ]
  },
  {
    title: 'Gestion Financière',
    items: [
      { name: 'Gestion Financière', icon: TrendingUp, page: 'FinancialManagement' },
      { name: 'Prévision de trésorerie', icon: Waves, page: 'CashForecast' },
    ]
  },
  {
    title: 'Documentation',
    items: [
      { name: 'Documentation', icon: BookOpen, page: 'Documentation' },
    ]
  }
];

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openSections, setOpenSections] = useState(() => {
    const saved = localStorage.getItem('nav-sections-open');
    return saved ? JSON.parse(saved) : ['Outils Administratifs', 'Gestion Comptable'];
  });
  const { user } = useUser();

  const toggleSection = (title) => {
    setOpenSections(prev => {
      const newSections = prev.includes(title)
        ? prev.filter(s => s !== title)
        : [...prev, title];
      localStorage.setItem('nav-sections-open', JSON.stringify(newSections));
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
        <nav className="p-3 pb-20 space-y-6">
          {navSections.map((section) => {
            const isOpen = openSections.includes(section.title);
            return (
              <div key={section.title}>
                {!collapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center justify-between px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
                  >
                    <span>{section.title}</span>
                    <ChevronRight className={cn(
                      "h-3 w-3 transition-transform",
                      isOpen && "rotate-90"
                    )} />
                  </button>
                )}
                {(collapsed || isOpen) && (
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = currentPageName === item.page;
                      return (
                        <Link
                          key={item.page}
                          to={createPageUrl(item.page)}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                            isActive 
                              ? "bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] text-white shadow-lg shadow-slate-900/10" 
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          )}
                        >
                          <item.icon className={cn(
                            "h-5 w-5 flex-shrink-0 transition-transform",
                            !isActive && "group-hover:scale-110"
                          )} />
                          {!collapsed && (
                            <span className="font-medium text-sm">{item.name}</span>
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