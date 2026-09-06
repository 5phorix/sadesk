import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { RefreshCcw, TrendingUp, DollarSign } from 'lucide-react';
import AmountDisplay from '@/components/common/AmountDisplay';

export default function SubscriptionsWidget({ config = {} }) {
  const { user } = useUser();

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('subscriptions').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const stats = useMemo(() => {
    const active = subscriptions.filter(s => s.status === 'active');
    const monthlyRevenue = active
      .filter(s => s.type === 'income')
      .reduce((sum, s) => {
        const freq = s.frequency === 'monthly' ? 1 : 
                     s.frequency === 'quarterly' ? 0.333 : 
                     s.frequency === 'semi-annual' ? 0.167 : 0.083;
        return sum + (parseFloat(s.amount) || 0) * freq;
      }, 0);

    return {
      total: active.length,
      revenue: monthlyRevenue,
      income: active.filter(s => s.type === 'income').length,
      expense: active.filter(s => s.type === 'expense').length
    };
  }, [subscriptions]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-slate-500 mb-1">Actifs</div>
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-blue-600" />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
        </div>
        <div>
          <div className="text-sm text-slate-500 mb-1">MRR</div>
          <AmountDisplay amount={stats.revenue} size="lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-3 border-t text-sm">
        <div className="text-slate-600">
          <span className="font-medium text-emerald-600">{stats.income}</span> revenus
        </div>
        <div className="text-slate-600">
          <span className="font-medium text-red-600">{stats.expense}</span> dépenses
        </div>
      </div>
    </div>
  );
}