/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Accounts from './pages/Accounts';
import AnalysesAgregats from './pages/AnalysesAgregats';
import AnalyticalAccounting from './pages/AnalyticalAccounting';
import AuditLog from './pages/AuditLog';
import Analysis from './pages/Analysis';
import BankReconciliation from './pages/BankReconciliation';
import BackupRestore from './pages/BackupRestore';
import BudgetTracking from './pages/BudgetTracking';
import DecisionAssistant from './pages/DecisionAssistant';
import CompanySelector from './pages/CompanySelector';
import CompanyUsers from './pages/CompanyUsers';
import Controls from './pages/Controls';
import Dashboard from './pages/ManagementDashboard';
import Documentation from './pages/Documentation';
import Documents from './pages/Documents';
import Entries from './pages/Entries';
import FinancialManagement from './pages/FinancialManagement';
import CashForecast from './pages/CashForecast';
import FinancialStatements from './pages/FinancialStatements';
import FixedAssets from './pages/FixedAssets';
import ImportExport from './pages/ImportExport';
import Invoices from './pages/Invoices';
import Journals from './pages/Journals';
import Lettering from './pages/Lettering';
import MonthlyClosing from './pages/MonthlyClosing';
import NotificationSettings from './pages/NotificationSettings';
import Profitability from './pages/Profitability';
import Performance from './pages/Performance';
import QuickLinks from './pages/QuickLinks';
import KpiManagement from './pages/KpiManagement';
import Objectives from './pages/Objectives';
import VarianceAnalysis from './pages/VarianceAnalysis';
import Costing from './pages/Costing';
import ForecastScenarios from './pages/ForecastScenarios';
import PerformanceAlerts from './pages/PerformanceAlerts';
import ActionPlans from './pages/ActionPlans';
import Reports from './pages/Reports';
import Receivables from './pages/Receivables';
import RolesManagement from './pages/RolesManagement';
import ScanInvoice from './pages/ScanInvoice';
import Settings from './pages/Settings';
import StockManagement from './pages/StockManagement';
import Tasks from './pages/Tasks';
import ThirdParties from './pages/ThirdParties';
import ThirdPartyDetail from './pages/ThirdPartyDetail';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Accounts": Accounts,
    "AnalysesAgregats": AnalysesAgregats,
    "AnalyticalAccounting": AnalyticalAccounting,
    "AuditLog": AuditLog,
    "Analysis": Analysis,
    "QuickLinks": QuickLinks,
    "BankReconciliation": BankReconciliation,
    "BackupRestore": BackupRestore,
    "BudgetTracking": BudgetTracking,
    "DecisionAssistant": DecisionAssistant,
    "CompanySelector": CompanySelector,
    "CompanyUsers": CompanyUsers,
    "Controls": Controls,
    "Dashboard": Dashboard,
    "Documentation": Documentation,
    "Documents": Documents,
    "Entries": Entries,
    "FinancialManagement": FinancialManagement,
    "CashForecast": CashForecast,
    "FinancialStatements": FinancialStatements,
    "FixedAssets": FixedAssets,
    "ImportExport": ImportExport,
    "Invoices": Invoices,
    "Journals": Journals,
    "Lettering": Lettering,
    "MonthlyClosing": MonthlyClosing,
    "NotificationSettings": NotificationSettings,
    "Profitability": Profitability,
    "Performance": Performance,
    "KpiManagement": KpiManagement,
    "Objectives": Objectives,
    "VarianceAnalysis": VarianceAnalysis,
    "Costing": Costing,
    "ForecastScenarios": ForecastScenarios,
    "PerformanceAlerts": PerformanceAlerts,
    "ActionPlans": ActionPlans,
    "Reports": Reports,
    "Receivables": Receivables,
    "RolesManagement": RolesManagement,
    "ScanInvoice": ScanInvoice,
    "Settings": Settings,
    "StockManagement": StockManagement,
    "Tasks": Tasks,
    "ThirdParties": ThirdParties,
    "ThirdPartyDetail": ThirdPartyDetail,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};