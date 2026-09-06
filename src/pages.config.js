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
import AnalyticalAccounting from './pages/AnalyticalAccounting';
import BankReconciliation from './pages/BankReconciliation';
import BudgetTracking from './pages/BudgetTracking';
import CompanySelector from './pages/CompanySelector';
import CompanyUsers from './pages/CompanyUsers';
import Dashboard from './pages/Dashboard';
import Documentation from './pages/Documentation';
import Documents from './pages/Documents';
import Entries from './pages/Entries';
import FinancialManagement from './pages/FinancialManagement';
import FinancialStatements from './pages/FinancialStatements';
import ImportExport from './pages/ImportExport';
import Invoices from './pages/Invoices';
import NotificationSettings from './pages/NotificationSettings';
import Reports from './pages/Reports';
import RolesManagement from './pages/RolesManagement';
import ScanInvoice from './pages/ScanInvoice';
import Settings from './pages/Settings';
import StockManagement from './pages/StockManagement';
import SubscriptionManagement from './pages/SubscriptionManagement';
import SubscriptionPlans from './pages/SubscriptionPlans';
import Tasks from './pages/Tasks';
import ThirdParties from './pages/ThirdParties';
import ThirdPartyDetail from './pages/ThirdPartyDetail';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Accounts": Accounts,
    "AnalyticalAccounting": AnalyticalAccounting,
    "BankReconciliation": BankReconciliation,
    "BudgetTracking": BudgetTracking,
    "CompanySelector": CompanySelector,
    "CompanyUsers": CompanyUsers,
    "Dashboard": Dashboard,
    "Documentation": Documentation,
    "Documents": Documents,
    "Entries": Entries,
    "FinancialManagement": FinancialManagement,
    "FinancialStatements": FinancialStatements,
    "ImportExport": ImportExport,
    "Invoices": Invoices,
    "NotificationSettings": NotificationSettings,
    "Reports": Reports,
    "RolesManagement": RolesManagement,
    "ScanInvoice": ScanInvoice,
    "Settings": Settings,
    "StockManagement": StockManagement,
    "SubscriptionManagement": SubscriptionManagement,
    "SubscriptionPlans": SubscriptionPlans,
    "Tasks": Tasks,
    "ThirdParties": ThirdParties,
    "ThirdPartyDetail": ThirdPartyDetail,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};