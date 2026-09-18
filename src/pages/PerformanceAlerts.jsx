import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Plus } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { usePagination } from '@/components/common/usePagination';
import PaginationBar from '@/components/common/PaginationBar';

export default function PerformanceAlerts() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const { data: alerts = [], isLoading } = useQuery({ queryKey: ['performance-alerts', companyId], queryFn: async () => { const { data, error } = await supabase.from('performance_alerts').select('*, kpi_definitions(name, code)').eq('company_id', companyId).order('triggered_at', { ascending: false }); if (error) throw error; return data; }, enabled: !!companyId });
  const { data: kpis = [] } = useQuery({ queryKey: ['kpi-definitions', companyId], queryFn: async () => { const { data, error } = await supabase.from('kpi_definitions').select('*').eq('company_id', companyId).eq('is_active', true).order('name'); if (error) throw error; return data; }, enabled: !!companyId });
  const saveMutation = useMutation({ mutationFn: async (alert) => { const { error } = await supabase.from('performance_alerts').insert({ ...alert, company_id: companyId, kpi_id: alert.kpi_id || null, value: Number(alert.value), threshold: Number(alert.threshold) }); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['performance-alerts', companyId] }); setFormOpen(false); setSelectedAlert(null); toast.success('Alerte créée'); }, onError: (error) => toast.error(error.message || 'Alerte non créée') });
  const resolveMutation = useMutation({ mutationFn: async (alert) => { const { error } = await supabase.from('performance_alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', alert.id).eq('company_id', companyId); if (error) throw error; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['performance-alerts', companyId] }) });
  const { paginatedItems: pagedAlerts, currentPage, totalPages, totalItems, goToPrevious, goToNext } = usePagination(alerts, 10);
  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Alertes de performance" subtitle="Reliez les alertes aux KPI, valeurs et seuils observés." actions={<Button onClick={() => { setSelectedAlert(null); setFormOpen(true); }} className="gap-2"><Plus className="h-4 w-4" />Nouvelle alerte</Button>} /><Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Alertes enregistrées</CardTitle></CardHeader><CardContent className="p-0">{isLoading ? <p className="p-6">Chargement...</p> : alerts.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Aucune alerte de performance.</p> : <div className="divide-y">{pagedAlerts.map((alert) => <div key={alert.id} className="flex flex-wrap items-start gap-4 p-4"><div className={`rounded-lg p-2 ${alert.level === 'critical' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><p className="font-semibold">{alert.title}</p><Badge variant="outline">{alert.level}</Badge><Badge variant="secondary">{alert.status}</Badge></div><p className="mt-1 text-sm text-slate-600">{alert.message}</p><p className="mt-1 text-xs text-slate-400">Valeur {alert.value} · Seuil {alert.threshold} · KPI {alert.kpi_definitions?.code || 'libre'}</p></div>{alert.status !== 'resolved' && <Button variant="outline" size="sm" onClick={() => resolveMutation.mutate(alert)}>Résoudre</Button>}</div>)}</div>}</CardContent><PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={10} onPrevious={goToPrevious} onNext={goToNext} /></Card><AlertForm open={formOpen} onOpenChange={setFormOpen} kpis={kpis} pending={saveMutation.isPending} onSubmit={(alert) => saveMutation.mutate(alert)} /></div></ProtectedRoute>;
}

function AlertForm({ open, onOpenChange, kpis, pending, onSubmit }) {
  const [form, setForm] = useState({ kpi_id: '', level: 'warning', title: '', message: '', value: 0, threshold: 0 });
  useEffect(() => { if (open) setForm({ kpi_id: '', level: 'warning', title: '', message: '', value: 0, threshold: 0 }); }, [open]);
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.type === 'number' ? Number(event.target.value) : event.target.value }));
  const submit = (event) => { event.preventDefault(); onSubmit(form); };
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent><SheetHeader><SheetTitle>Nouvelle alerte</SheetTitle><SheetDescription>Conservez le KPI, la valeur observée, le seuil et l’explication.</SheetDescription></SheetHeader><form onSubmit={submit} className="mt-6 space-y-5"><div className="space-y-2"><Label>KPI</Label><select value={form.kpi_id} onChange={update('kpi_id')} className="flex h-9 w-full rounded-md border px-3 text-sm"><option value="">Alerte libre</option>{kpis.map((kpi) => <option key={kpi.id} value={kpi.id}>{kpi.name} ({kpi.code})</option>)}</select></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Niveau</Label><select value={form.level} onChange={update('level')} className="flex h-9 w-full rounded-md border px-3 text-sm"><option value="info">Info</option><option value="warning">Vigilance</option><option value="critical">Critique</option></select></div><div className="space-y-2"><Label>Valeur</Label><Input type="number" step="0.01" value={form.value} onChange={update('value')} /></div></div><div className="space-y-2"><Label>Seuil</Label><Input type="number" step="0.01" value={form.threshold} onChange={update('threshold')} /></div><div className="space-y-2"><Label>Titre *</Label><Input value={form.title} onChange={update('title')} required /></div><div className="space-y-2"><Label>Explication *</Label><Input value={form.message} onChange={update('message')} required /></div><Button type="submit" disabled={pending} className="w-full">{pending ? 'Enregistrement...' : 'Créer l’alerte'}</Button></form></SheetContent></Sheet>;
}
