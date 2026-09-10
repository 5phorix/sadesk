import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from './useUser';
import { can, effectivePermissions } from '@/lib/permissions';

/**
 * Droits de l'utilisateur courant sur la société active.
 * Sert uniquement à masquer l'interface : les RLS restent la garantie réelle.
 */
export function usePermissions() {
  const { user, loading } = useUser();
  const companyId = user?.active_company_id;

  const { data: membership } = useQuery({
    queryKey: ['membership', companyId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_users')
        .select('role, permissions, status')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!user?.id,
    staleTime: 60_000,
  });

  const permissions = useMemo(
    () => (membership ? effectivePermissions(membership.role, membership.permissions) : {}),
    [membership]
  );

  const check = useCallback(
    (feature, action) => can(membership, feature, action),
    [membership]
  );

  return {
    loading,
    membership,
    role: membership?.role || null,
    permissions,
    can: check,
    isAdmin: ['owner', 'admin'].includes(membership?.role),
    isOwner: membership?.role === 'owner',
  };
}
