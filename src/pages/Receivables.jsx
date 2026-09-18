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
import { buildReceivableProvisionEntries, receivablesDue, receivableProvisionRate, reminderLevel } from '@/lib/auxiliaryAccounting';
import { Bell, Euro, CalendarClock, ShieldAlert } from 'lucide-react';
import { usePagination } from '@/components/common/usePagination';
import PaginationBar from '@/components/common/PaginationBar';

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
  const { data: existingProvisions = [] } = useQuery({
    queryKey: ['receivable-provisions', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_entries').select('entry_number').eq('company_id', companyId).like('entry_number', 'OD-PROV-CLI-%');
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
  const { paginatedItems: pagedReceivables, currentPage, totalPages, totalItems, goToPrevious, goToNext } = usePagination(receivables, 10);

  // Provisionne automatiquement les créances douteuses selon un barème d'ancienneté (60/90/180 jours).
  const provisionMutation = useMutation({
    mutationFn: async () => {
      const provisioned = [];
      for (const { invoice, daysLate, outstanding } of overdue) {
        const rate = receivableProvisionRate(daysLate);
        if (rate <= 0) continue;
        const entryNumber = `OD-PROV-CLI-${invoice.invoice_number}`;
        if (existingProvisions.some((entry) => entry.entry_number === entryNumber)) continue;
        const entries = buildReceivableProvisionEntries(invoice, outstanding * rate, companyId);
        if (!entries.length) continue;
        const { error } = await supabase.from('accounting_entries').insert(entries);
        if (error) throw error;
        provisioned.push(invoice.invoice_number);
      }
      return provisioned;
    },
    onSuccess: (provisioned) => {
      queryClient.invalidateQueries({ queryKey: ['receivable-provisions', companyId] });
      queryClient.invalidateQueries({ queryKey: ['entries', companyId] });
      toast.success(provisioned.length ? `${provisioned.length} provision(s) générée(s) en brouillon` : 'Aucune nouvelle créance douteuse à provisionner');
    },
    onError: (error) => toast.error(error.message || 'Impossible de générer les provisions'),
  });

  return <ProtectedRoute><div className="space-y-6">
    <PageHeader
      title="Créances clients"
      subtitle="Échéances, retards et relances à préparer"
      actions={<Button variant="outline" className="gap-2" disabled={provisionMutation.isPending} onClick={() => provisionMutation.mutate()}><ShieldAlert className="h-4 w-4" />Générer les provisions créances douteuses</Button>}
    />
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Euro className="h-4 w-4" />Encours échu</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{total.toFixed(2)} €</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Factures échues</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{overdue.length}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" />Relances planifiées</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{followups.filter((item) => item.status === 'planned').length}</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Échéancier client</CardTitle></CardHeader><CardContent className="p-0">{isLoading ? <p className="p-6">Chargement…</p> : <div className="divide-y">{pagedReceivables.map(({ invoice, daysLate, outstanding, isOverdue }) => { const level = reminderLevel(daysLate); const planned = followups.some((item) => item.invoice_id === invoice.id && item.level === level); return <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{invoice.invoice_number} · {invoice.third_party_name || 'Client'}</p><p className="text-sm text-slate-500">Échéance : {invoice.due_date || 'non définie'}</p></div><div className="flex items-center gap-3"><Badge variant={isOverdue ? 'destructive' : 'outline'}>{isOverdue ? `${daysLate} j de retard` : 'À venir'}</Badge><span className="font-semibold">{outstanding.toFixed(2)} €</span>{level > 0 && <Button size="sm" variant="outline" disabled={planned} onClick={() => followupMutation.mutate({ invoice, level })}>{planned ? 'Relance planifiée' : `Préparer relance ${level}`}</Button>}</div></div>; })}</div>}</CardContent><PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={10} onPrevious={goToPrevious} onNext={goToNext} /></Card>
  </div></ProtectedRoute>;
}
