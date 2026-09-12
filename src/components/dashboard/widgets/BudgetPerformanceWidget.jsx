import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { startOfYear } from 'date-fns';

export default function BudgetPerformanceWidget({ config = {} }) {
  const { user } = useUser();

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('budgets').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id).eq('is_validated', true); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const performance = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const activeBudgets = budgets.filter(b => b.fiscal_year === currentYear && b.is_active);

    if (activeBudgets.length === 0) {
      return { items: [], onTrack: 0, overBudget: 0 };
    }

    const startDate = startOfYear(new Date()).toISOString().split('T')[0];

    const items = activeBudgets.slice(0, 3).map(budget => {
      const actual = entries
        .filter(e => 
          e.account_code === budget.account_code &&
          e.date >= startDate
        )
        .reduce((sum, e) => {
          return sum + (budget.category === 'expense' 
            ? (parseFloat(e.debit) || 0)
            : (parseFloat(e.credit) || 0));
        }, 0);

      const budgeted = parseFloat(budget.total_amount) || 0;
      const percentage = budgeted > 0 ? (actual / budgeted) * 100 : 0;
      const isOverBudget = percentage > (budget.alert_threshold || 90);

      return { name: budget.name, actual, budgeted, percentage, isOverBudget };
    });

    return {
      items,
      onTrack: items.filter(i => !i.isOverBudget).length,
      overBudget: items.filter(i => i.isOverBudget).length
    };
  }, [budgets, entries]);

  if (performance.items.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500">
        <Target className="h-8 w-8 mx-auto mb-2 text-slate-400" />
        <p className="text-sm">Aucun budget configuré</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {performance.items.map((item, idx) => (
        <div key={idx} className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{item.name}</span>
            <span className={item.isOverBudget ? 'text-red-600 font-semibold' : 'text-slate-600'}>
              {item.percentage.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={Math.min(item.percentage, 100)} 
            className={item.isOverBudget ? '[&>div]:bg-red-600' : '[&>div]:bg-emerald-600'}
          />
          <div className="text-xs text-slate-500">
            {item.actual.toFixed(2)} € / {item.budgeted.toFixed(2)} €
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2 pt-3 border-t text-sm">
        <div className="flex items-center gap-1 text-emerald-600">
          <TrendingUp className="h-4 w-4" />
          <span className="font-medium">{performance.onTrack}</span> en ligne
        </div>
        <div className="flex items-center gap-1 text-red-600">
          <TrendingDown className="h-4 w-4" />
          <span className="font-medium">{performance.overBudget}</span> dépassé
        </div>
      </div>
    </div>
  );
}