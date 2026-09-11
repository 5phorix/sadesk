import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { receivablesDue, reminderLevel } from '@/lib/auxiliaryAccounting';
import { Bell, Euro, CalendarClock } from 'lucide-react';

export default function Receivables() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const companyId = user?.active_company_id;
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['receivables', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*').eq('company_id', companyId).eq('type', 'client').order('due_date');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  const { data: followups = [] } = useQuery({
    queryKey: ['receivable-followups', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('receivable_followups').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  const followupMutation = useMutation({
    mutationFn: async ({ invoice, level }) => {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      const { error } = await supabase.from('receivable_followups').upsert({
        company_id: companyId,
        invoice_id: invoice.id,
        level,
        scheduled_date: scheduledDate.toISOString().slice(0, 10),
        status: 'planned',
        channel: 'manual',
      }, { onConflict: 'invoice_id,level' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivable-followups', companyId] });
      toast.success('Relance planifiée');
    },
  });
  const receivables = receivablesDue(invoices);
  const overdue = receivables.filter((item) => item.isOverdue);
  const total = overdue.reduce((sum, item) => sum + item.outstanding, 0);

  return <ProtectedRoute><div className="space-y-6">
    <PageHeader title="Créances clients" subtitle="Échéances, retards et relances à préparer" />
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Euro className="h-4 w-4" />Encours échu</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{total.toFixed(2)} €</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Factures échues</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{overdue.length}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" />Relances planifiées</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{followups.filter((item) => item.status === 'planned').length}</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Échéancier client</CardTitle></CardHeader><CardContent>{isLoading ? <p>Chargement…</p> : <div className="divide-y">{receivables.map(({ invoice, daysLate, outstanding, isOverdue }) => { const level = reminderLevel(daysLate); const planned = followups.some((item) => item.invoice_id === invoice.id && item.level === level); return <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{invoice.invoice_number} · {invoice.third_party_name || 'Client'}</p><p className="text-sm text-slate-500">Échéance : {invoice.due_date || 'non définie'}</p></div><div className="flex items-center gap-3"><Badge variant={isOverdue ? 'destructive' : 'outline'}>{isOverdue ? `${daysLate} j de retard` : 'À venir'}</Badge><span className="font-semibold">{outstanding.toFixed(2)} €</span>{level > 0 && <Button size="sm" variant="outline" disabled={planned} onClick={() => followupMutation.mutate({ invoice, level })}>{planned ? 'Relance planifiée' : `Préparer relance ${level}`}</Button>}</div></div>; })}</div>}</CardContent></Card>
  </div></ProtectedRoute>;
}
