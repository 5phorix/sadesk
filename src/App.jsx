import { Fragment, useState } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Home from './pages/Home';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import CompanySelector from './pages/CompanySelector';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => currentPageName === 'CompanySelector' ? children : Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, user, isPasswordRecovery } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Lien de réinitialisation de mot de passe : prioritaire sur tout le reste
  if (isPasswordRecovery) {
    return <ResetPassword />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return showLogin ? <Login /> : <Home onLogin={() => setShowLogin(true)} />;
    }
  }

  if (user && !user.active_company_id) {
    return <CompanySelector />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <ErrorBoundary key={mainPageKey}>
            <MainPage />
          </ErrorBoundary>
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Fragment key={path}>
          <Route
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <ErrorBoundary key={path}>
                  <Page />
                </ErrorBoundary>
              </LayoutWrapper>
            }
          />
          <Route
            path={`/app/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <ErrorBoundary key={`app-${path}`}>
                  <Page />
                </ErrorBoundary>
              </LayoutWrapper>
            }
          />
        </Fragment>
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
