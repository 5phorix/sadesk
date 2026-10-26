import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calculator,
  CalendarCheck,
  Camera,
  CheckCircle2,
  CircleAlert,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Landmark,
  Lightbulb,
  Link2,
  Package,
  PieChart,
  Receipt,
  Scale,
  Settings,
  Shield,
  Target,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  Waves,
} from 'lucide-react';

export const navSections = [
  {
    title: 'Ventes et achats',
    description: 'Facturation, tiers et suivi des règlements',
    icon: FileText,
    dotColor: 'bg-violet-400',
    titleColor: 'text-violet-300',
    accentBorder: 'border-l-4 border-l-violet-400',
    iconTone: 'bg-violet-50 text-violet-700 border-violet-200',
    hoverBorder: 'hover:border-violet-300',
    items: [
      { name: 'Ventes', icon: FileText, page: 'Invoices' },
      { name: 'Factures fournisseurs', icon: FileText, page: 'Invoices', search: '?tab=suppliers' },
      { name: 'Clients et fournisseurs', icon: Building2, page: 'ThirdParties' },
      { name: 'Créances et relances', icon: CircleAlert, page: 'Receivables' },
    ],
  },
  {
    title: 'Collecte et imports',
    description: 'Numérisation, fichiers et intégrations',
    icon: Upload,
    dotColor: 'bg-cyan-400',
    titleColor: 'text-cyan-300',
    accentBorder: 'border-l-4 border-l-cyan-400',
    iconTone: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    hoverBorder: 'hover:border-cyan-300',
    items: [
      { name: 'Scanner une facture', icon: Camera, page: 'ScanInvoice' },
      { name: 'Importer ou exporter', icon: Upload, page: 'ImportExport' },
      { name: 'Sphorix Connect', icon: Link2, page: 'ImportExport', search: '?tab=connect' },
      { name: 'Documents et justificatifs', icon: FolderOpen, page: 'Documents' },
    ],
  },
  {
    title: 'Trésorerie et banques',
    description: 'Mouvements, rapprochements et prévisions',
    icon: Waves,
    dotColor: 'bg-emerald-400',
    titleColor: 'text-emerald-300',
    accentBorder: 'border-l-4 border-l-emerald-400',
    iconTone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    hoverBorder: 'hover:border-emerald-300',
    items: [
      { name: 'Prévision de trésorerie', icon: Waves, page: 'CashForecast' },
      { name: 'Rapprochement bancaire', icon: Calculator, page: 'BankReconciliation' },
      { name: 'Gestion financière', icon: Wallet, page: 'FinancialManagement' },
    ],
  },
  {
    title: 'Comptabilité',
    description: 'Écritures, contrôles et clôtures',
    icon: Receipt,
    dotColor: 'bg-blue-400',
    titleColor: 'text-blue-300',
    accentBorder: 'border-l-4 border-l-blue-400',
    iconTone: 'bg-blue-50 text-blue-800 border-blue-200',
    hoverBorder: 'hover:border-blue-300',
    items: [
      { name: 'Plan comptable', icon: BookOpen, page: 'Accounts' },
      { name: 'Écritures', icon: Receipt, page: 'Entries' },
      { name: 'Journaux', icon: BookOpen, page: 'Journals' },
      { name: 'Grand Livre et balance', icon: BarChart3, page: 'Reports' },
      { name: 'Lettrage', icon: Link2, page: 'Lettering' },
      { name: 'Immobilisations', icon: Landmark, page: 'FixedAssets' },
      { name: 'Clôtures mensuelles', icon: CalendarCheck, page: 'MonthlyClosing' },
      { name: 'Bilan et compte de résultat', icon: Scale, page: 'FinancialStatements' },
      { name: 'Contrôles comptables', icon: Shield, page: 'Controls' },
    ],
  },
  {
    title: 'Analyse et décisions',
    description: 'Indicateurs, budgets et rentabilité',
    icon: Activity,
    dotColor: 'bg-amber-400',
    titleColor: 'text-amber-300',
    accentBorder: 'border-l-4 border-l-amber-400',
    iconTone: 'bg-amber-50 text-amber-800 border-amber-200',
    hoverBorder: 'hover:border-amber-300',
    items: [
      { name: 'Analyse de l’activité', icon: Activity, page: 'Analysis' },
      { name: 'Analyses et agrégats', icon: TrendingUp, page: 'AnalysesAgregats' },
      { name: 'Comptabilité analytique', icon: Target, page: 'AnalyticalAccounting' },
      { name: 'Calcul des coûts', icon: Calculator, page: 'Costing' },
      { name: 'Rentabilité', icon: PieChart, page: 'Profitability' },
      { name: 'Suivi budgétaire', icon: Gauge, page: 'BudgetTracking' },
      { name: 'Indicateurs et objectifs', icon: Gauge, page: 'Performance' },
      { name: 'Aide à la décision', icon: Lightbulb, page: 'DecisionAssistant' },
    ],
  },
  {
    title: 'Opérations',
    description: 'Stocks, documents et tâches d’équipe',
    icon: Package,
    dotColor: 'bg-teal-400',
    titleColor: 'text-teal-300',
    accentBorder: 'border-l-4 border-l-teal-400',
    iconTone: 'bg-teal-50 text-teal-800 border-teal-200',
    hoverBorder: 'hover:border-teal-300',
    items: [
      { name: 'Gestion des stocks', icon: Package, page: 'StockManagement' },
      { name: 'Tâches et équipe', icon: CheckCircle2, page: 'Tasks' },
    ],
  },
  {
    title: 'Équipe et paramètres',
    description: 'Accès, sécurité et configuration',
    icon: Shield,
    dotColor: 'bg-slate-400',
    titleColor: 'text-slate-300',
    accentBorder: 'border-l-4 border-l-slate-400',
    iconTone: 'bg-slate-100 text-slate-700 border-slate-300',
    hoverBorder: 'hover:border-slate-400',
    items: [
      { name: 'Utilisateurs', icon: Users, page: 'CompanyUsers' },
      { name: 'Rôles et permissions', icon: Shield, page: 'RolesManagement' },
      { name: "Journal d'audit", icon: History, page: 'AuditLog' },
      { name: 'Sauvegarde et restauration', icon: History, page: 'BackupRestore' },
      { name: 'Notifications', icon: Bell, page: 'NotificationSettings' },
      { name: 'Paramètres', icon: Settings, page: 'Settings' },
      { name: 'Guide et documentation', icon: BookOpen, page: 'Documentation' },
    ],
  },
];

export const navigationLabel = (page) => {
  if (page === 'Dashboard') return 'Tableau de bord';
  if (page === 'QuickLinks') return 'Parcours rapides';
  return navSections.flatMap((section) => section.items).find((item) => item.page === page)?.name || page;
};

export function searchResultUrl(type, item) {
  const id = encodeURIComponent(item.id);
  if (type === 'invoice') return `/Invoices?id=${id}`;
  if (type === 'thirdparty') return `/ThirdPartyDetail?id=${id}`;
  if (type === 'entry') return `/Entries?id=${id}`;
  return '/';
}