import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const COLORS = ['#1e3a5f', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'];

export default function ExpensesByCategoryWidget({ config = {} }) {
  const { user } = useUser();
  const { period = 'current_month' } = config;

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const data = useMemo(() => {
    const now = new Date();
    const startDate = period === 'current_month' 
      ? startOfMonth(now) 
      : period === 'last_month' 
      ? startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1))
      : new Date(now.getFullYear(), 0, 1);
    
    const endDate = period === 'current_month' 
      ? endOfMonth(now)
      : period === 'last_month'
      ? endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1))
      : now;

    const expenses = entries.filter(e => 
      e.account_code?.startsWith('6') &&
      e.date >= format(startDate, 'yyyy-MM-dd') &&
      e.date <= format(endDate, 'yyyy-MM-dd')
    );

    const byCategory = {};
    expenses.forEach(e => {
      const category = e.account_code?.substring(0, 2) || '60';
      const categoryName = {
        '60': 'Achats',
        '61': 'Services ext.',
        '62': 'Autres services',
        '63': 'Impôts',
        '64': 'Charges pers.',
        '65': 'Autres charges',
        '66': 'Charges fin.',
        '67': 'Charges excep.',
        '68': 'Dotations'
      }[category] || 'Autres';

      byCategory[categoryName] = (byCategory[categoryName] || 0) + (parseFloat(e.debit) || 0);
    });

    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [entries, period]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip 
          formatter={(value) => `${value.toFixed(2)} €`}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}