import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { differenceInDays, parseISO } from 'date-fns';

export default function PaymentAlertsWidget({ config = {} }) {
  const { user } = useUser();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('invoices').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const alerts = useMemo(() => {
    const today = new Date();
    const unpaidInvoices = invoices.filter(inv => 
      ['brouillon', 'validée'].includes(inv.status) && inv.due_date
    );

    const overdue = unpaidInvoices.filter(inv => 
      differenceInDays(today, parseISO(inv.due_date)) > 0
    ).length;

    const dueSoon = unpaidInvoices.filter(inv => {
      const diff = differenceInDays(parseISO(inv.due_date), today);
      return diff >= 0 && diff <= 7;
    }).length;

    const totalAmount = unpaidInvoices.reduce((sum, inv) => 
      sum + (parseFloat(inv.amount_ttc) || 0), 0
    );

    return { overdue, dueSoon, totalAmount, total: unpaidInvoices.length };
  }, [invoices]);

  return (
    <div className="space-y-3">
      {alerts.overdue > 0 && (
        <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <div className="font-semibold text-red-900">En retard</div>
              <div className="text-sm text-red-700">{alerts.overdue} facture{alerts.overdue > 1 ? 's' : ''}</div>
            </div>
          </div>
          <Badge className="bg-red-600 text-white">{alerts.overdue}</Badge>
        </div>
      )}

      {alerts.dueSoon > 0 && (
        <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-600" />
            <div>
              <div className="font-semibold text-orange-900">À venir (7j)</div>
              <div className="text-sm text-orange-700">{alerts.dueSoon} facture{alerts.dueSoon > 1 ? 's' : ''}</div>
            </div>
          </div>
          <Badge className="bg-orange-600 text-white">{alerts.dueSoon}</Badge>
        </div>
      )}

      {alerts.overdue === 0 && alerts.dueSoon === 0 && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <div className="text-sm text-emerald-700">
            Aucune alerte de paiement
          </div>
        </div>
      )}

      <div className="pt-3 border-t text-sm text-slate-600">
        <div className="font-medium">{alerts.total} facture{alerts.total > 1 ? 's' : ''} impayée{alerts.total > 1 ? 's' : ''}</div>
        <div className="text-slate-500">Montant total : {alerts.totalAmount.toFixed(2)} €</div>
      </div>
    </div>
  );
}