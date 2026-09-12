import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

export function resolveActiveCompanyId(profileCompanyId, companyIds = []) {
  return profileCompanyId && companyIds.includes(profileCompanyId) ? profileCompanyId : null;
}

/**
 * Hook centralisé pour gérer l'utilisateur et s'assurer que company_ids est toujours un array
 * Évite les erreurs "$in needs an array" en initialisant correctement company_ids
 */
export function useUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authUser) throw new Error('Utilisateur non authentifié');

      const [{ data: profile, error: profileError }, { data: memberships, error: membershipsError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('company_users').select('*').eq('user_id', authUser.id).eq('status', 'active')
      ]);
      if (profileError) throw profileError;
      if (membershipsError) throw membershipsError;

      const companyIds = (memberships || []).map((membership) => membership.company_id);
      const activeCompanyId = resolveActiveCompanyId(profile?.active_company_id, companyIds);
      const activeMembership = (memberships || []).find((membership) => membership.company_id === activeCompanyId);

      setUser({
        id: authUser.id,
        email: authUser.email,
        ...profile,
        company_ids: companyIds,
        active_company_id: activeCompanyId,
        role: activeMembership?.role || null,
        active_company_name: activeMembership?.company_name || null
      });
      setError(null);
    } catch (err) {
      console.error('Error loading user:', err);
      setError(err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (data) => {
    try {
      const { error: updateError } = await supabase.from('profiles').update(data).eq('id', (await supabase.auth.getUser()).data.user.id);
      if (updateError) throw updateError;
      await loadUser();
    } catch (err) {
      console.error('Error updating user:', err);
      throw err;
    }
  };

  return { user, loading, error, updateUser, reload: loadUser };
}