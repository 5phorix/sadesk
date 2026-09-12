import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from './useUser';
import { DEFAULT_MANAGEMENT_SETTINGS } from '@/lib/management';

/** Paramètres de seuils et de scénarios de la société active. */
export function useManagementSettings() {
  const { user } = useUser();
  const companyId = user?.active_company_id;

  return useQuery({
    queryKey: ['management-settings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('management_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_MANAGEMENT_SETTINGS, ...(data || {}) };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useSaveManagementSettings() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const companyId = user?.active_company_id;

  return useMutation({
    mutationFn: async (settings) => {
      const { data, error } = await supabase
        .from('management_settings')
        .upsert({ ...settings, company_id: companyId }, { onConflict: 'company_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['management-settings', companyId] }),
  });
}

/** Budgets de la société active. */
export function useBudgets() {
  const { user } = useUser();
  const companyId = user?.active_company_id;

  return useQuery({
    queryKey: ['budgets', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

/** Ventilation mensuelle de tous les budgets de la société active. */
export function useBudgetLines() {
  const { user } = useUser();
  const companyId = user?.active_company_id;

  return useQuery({
    queryKey: ['budget-lines', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_lines')
        .select('*')
        .eq('company_id', companyId)
        .order('month');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

/**
 * Remplace la ventilation mensuelle d'un budget.
 * `amounts` est un tableau de 12 montants (index 0 = janvier).
 */
export function useSaveBudgetLines() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const companyId = user?.active_company_id;

  return useMutation({
    mutationFn: async ({ budgetId, amounts }) => {
      const { error: deleteError } = await supabase
        .from('budget_lines')
        .delete()
        .eq('budget_id', budgetId);
      if (deleteError) throw deleteError;

      const rows = amounts
        .map((amount, index) => ({
          company_id: companyId,
          budget_id: budgetId,
          month: index + 1,
          amount: Number(amount) || 0,
        }))
        .filter((row) => row.amount > 0);

      if (rows.length === 0) return [];

      const { data, error } = await supabase.from('budget_lines').insert(rows).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-lines', companyId] });
      queryClient.invalidateQueries({ queryKey: ['budgets', companyId] });
    },
  });
}

/** Historique des clôtures mensuelles. */
export function useMonthlyClosings() {
  const { user } = useUser();
  const companyId = user?.active_company_id;

  return useQuery({
    queryKey: ['monthly-closings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_closings')
        .select('*')
        .eq('company_id', companyId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

export function useCloseMonth() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const companyId = user?.active_company_id;

  return useMutation({
    mutationFn: async ({ year, month, indicators = {}, notes = null }) => {
      const { data, error } = await supabase.rpc('close_month', {
        target_company_id: companyId,
        target_year: year,
        target_month: month,
        target_indicators: indicators,
        target_notes: notes,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-closings', companyId] });
      queryClient.invalidateQueries({ queryKey: ['entries', companyId] });
    },
  });
}

export function useReopenMonth() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const companyId = user?.active_company_id;

  return useMutation({
    mutationFn: async ({ year, month, reason = null }) => {
      const { data, error } = await supabase.rpc('reopen_month', {
        target_company_id: companyId,
        target_year: year,
        target_month: month,
        target_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthly-closings', companyId] }),
  });
}

/**
 * Écritures d'un exercice complet, sans la limite des hooks génériques :
 * les calculs de gestion doivent porter sur l'année entière.
 */
export function useYearEntries(year) {
  const { user } = useUser();
  const companyId = user?.active_company_id;

  return useQuery({
    queryKey: ['entries-year', companyId, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select(
          'id, date, journal, account_code, account_label, label, debit, credit, is_validated, third_party_id, third_party_name, cost_center_code, cost_center_name'
        )
        .eq('company_id', companyId)
        .eq('is_validated', true)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        .order('date');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!year,
    staleTime: 30_000,
  });
}
