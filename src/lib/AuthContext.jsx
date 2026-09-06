import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        return;
      }

      const [{ data: profile, error: profileError }, { data: memberships, error: membershipsError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('company_users').select('*').eq('user_id', session.user.id).eq('status', 'active')
      ]);

      if (profileError) throw profileError;
      if (membershipsError) throw membershipsError;

      const companyIds = (memberships || []).map((membership) => membership.company_id);
      const activeCompanyId = profile?.active_company_id && companyIds.includes(profile.active_company_id)
        ? profile.active_company_id
        : companyIds[0] || null;
      const activeMembership = (memberships || []).find((membership) => membership.company_id === activeCompanyId);

      setUser({
        id: session.user.id,
        email: session.user.email,
        ...profile,
        company_ids: companyIds,
        active_company_id: activeCompanyId,
        role: activeMembership?.role || null,
        active_company_name: activeMembership?.company_name || null
      });
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError({ type: 'unknown', message: error.message || 'Failed to load user' });
    }
  };

  const logout = (shouldRedirect = true) => {
    supabase.auth.signOut().catch((error) => console.error('Logout failed:', error));
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) window.location.reload();
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkUserAuth();
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
