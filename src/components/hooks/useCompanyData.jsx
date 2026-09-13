import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from './useUser';

/**
 * Hook optimisé pour charger les données d'une entité pour la société active
 * Utilise .list() au lieu de .filter() pour éviter les erreurs avec company_ids
 * Les RLS (Row Level Security) filtrent automatiquement par company_id
 */
export function useCompanyData(entityName, options = {}) {
  const { user } = useUser();
  const { 
    staleTime = 30000, 
    enabled = true,
    sortBy = '-created_date',
    limit
  } = options;

  return useQuery({
    queryKey: [entityName.toLowerCase(), user?.active_company_id],
    queryFn: async () => {
      // Les RLS filtrent automatiquement par company_id
      // Utiliser .list() est plus sûr que .filter()
      const tableByEntity = {
        Invoice: 'invoices',
        ThirdParty: 'third_parties',
        AccountingEntry: 'accounting_entries',
        Account: 'accounts',
        BankTransaction: 'bank_transactions',
        Document: 'documents',
        Stock: 'stock_items',
        CostCenter: 'cost_centers'
      };
      const table = tableByEntity[entityName];
      if (!table) throw new Error(`Entity ${entityName} not found`);
      const ascending = !sortBy.startsWith('-');
      const column = sortBy.replace(/^-/, '').replace('created_date', 'created_at');
      let query = supabase.from(table).select('*').eq('company_id', user.active_company_id).order(column, { ascending });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!user?.active_company_id,
    staleTime
  });
}

/**
 * Hooks spécialisés pour chaque entité
 */
export function useInvoices(options = {}) {
  return useCompanyData('Invoice', { sortBy: '-date', limit: 500, ...options });
}

export function useThirdParties(options = {}) {
  return useCompanyData('ThirdParty', { sortBy: 'name', ...options });
}

export function useAccountingEntries(options = {}) {
  return useCompanyData('AccountingEntry', { sortBy: '-date', limit: 500, ...options });
}

export function useAccounts(options = {}) {
  return useCompanyData('Account', { sortBy: 'code', ...options });
}

export function useBankTransactions(options = {}) {
  return useCompanyData('BankTransaction', { sortBy: '-transaction_date', ...options });
}

export function useDocuments(options = {}) {
  return useCompanyData('Document', { sortBy: '-created_date', ...options });
}

export function useStocks(options = {}) {
  return useCompanyData('Stock', { sortBy: 'product_code', ...options });
}

export function useCostCenters(options = {}) {
  return useCompanyData('CostCenter', { sortBy: 'code', ...options });
}