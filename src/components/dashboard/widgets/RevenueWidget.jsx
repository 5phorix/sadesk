import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { TrendingUp, TrendingDown } from 'lucide-react';
import AmountDisplay from '@/components/common/AmountDisplay';
import { startOfMonth, endOfMonth, startOfYear, format } from 'date-fns';

export default function RevenueWidget({ config = {} }) {
  const { user } = useUser();
  const { period = 'current_month' } = config;

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('invoices').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const stats = useMemo(() => {
    let startDate, endDate, previousStartDate, previousEndDate;
    const now = new Date();

    if (period === 'current_month') {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
      previousStartDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1));
      previousEndDate = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1));
    } else if (period === 'last_month') {
      startDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1));
      endDate = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1));
      previousStartDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 2));
      previousEndDate = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 2));
    } else if (period === 'current_year') {
      startDate = startOfYear(now);
      endDate = now;
      previousStartDate = startOfYear(new Date(now.getFullYear() - 1, 0));
      previousEndDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    const clientInvoices = invoices.filter(inv => 
      inv.type === 'client' && 
      inv.status === 'payée' &&
      inv.date >= format(startDate, 'yyyy-MM-dd') &&
      inv.date <= format(endDate, 'yyyy-MM-dd')
    );

    const previousInvoices = invoices.filter(inv => 
      inv.type === 'client' && 
      inv.status === 'payée' &&
      inv.date >= format(previousStartDate, 'yyyy-MM-dd') &&
      inv.date <= format(previousEndDate, 'yyyy-MM-dd')
    );

    const revenue = clientInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_ttc) || 0), 0);
    const previousRevenue = previousInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_ttc) || 0), 0);
    const change = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : 0;

    return { revenue, change, count: clientInvoices.length };
  }, [invoices, period]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <AmountDisplay amount={stats.revenue} size="xl" />
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className={`flex items-center gap-1 ${stats.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {stats.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span className="font-medium">{Math.abs(stats.change).toFixed(1)}%</span>
        </div>
        <span className="text-slate-500">vs période précédente</span>
      </div>
      <div className="text-sm text-slate-600">
        {stats.count} facture{stats.count > 1 ? 's' : ''} payée{stats.count > 1 ? 's' : ''}
      </div>
    </div>
  );
}