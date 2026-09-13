import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Gauge, Plus, Trash2 } from 'lucide-react';
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

const emptyKpi = {
  code: '',
  name: '',
  description: '',
  category: 'financial',
  unit: 'EUR',
  formula: '',
  source: 'accounting_entries',
  periodicity: 'monthly',
  target_value: '',
  warning_threshold: '',
  alert_threshold: '',
  is_active: true,
};

const categories = ['financial', 'accounting', 'analytical', 'commercial', 'operational', 'treasury', 'profitability'];

export default function KpiManagement() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState(null);
  const [deleteKpi, setDeleteKpi] = useState(null);

  const { data: kpis = [], isLoading } = useQuery({
    queryKey: ['kpi-definitions', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('kpi_definitions').select('*').eq('company_id', companyId).order('category').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ kpi, id }) => {
      const payload = {
        ...kpi,
        company_id: companyId,
        target_value: kpi.target_value === '' ? null : Number(kpi.target_value),
        warning_threshold: kpi.warning_threshold === '' ? null : Number(kpi.warning_threshold),
        alert_threshold: kpi.alert_threshold === '' ? null : Number(kpi.alert_threshold),
      };
      const query = id
        ? supabase.from('kpi_definitions').update(payload).eq('id', id).eq('company_id', companyId)
        : supabase.from('kpi_definitions').insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-definitions', companyId] });
      setEditorOpen(false);
      setSelectedKpi(null);
      toast.success('KPI enregistré');
    },
    onError: (error) => toast.error(error.message || 'Le KPI n’a pas pu être enregistré'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (kpi) => {
      const { error } = await supabase.from('kpi_definitions').delete().eq('id', kpi.id).eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-definitions', companyId] });
      setDeleteKpi(null);
      toast.success('KPI supprimé');
    },
    onError: (error) => toast.error(error.message || 'Le KPI n’a pas pu être supprimé'),
  });

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="KPI & indicateurs" subtitle="Définissez les indicateurs, leurs sources, objectifs et seuils." actions={<Button onClick={() => { setSelectedKpi(null); setEditorOpen(true); }} className="gap-2"><Plus className="h-4 w-4" />Nouveau KPI</Button>} /><Card><CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />Indicateurs configurés</CardTitle></CardHeader><CardContent>{isLoading ? <p className="text-sm text-slate-500">Chargement...</p> : kpis.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">Aucun KPI personnalisé. Créez le premier indicateur de votre société.</div> : <div className="divide-y divide-slate-100">{kpis.map((kpi) => <div key={kpi.id} className="flex flex-wrap items-center gap-4 py-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{kpi.name}</p><Badge variant="outline">{kpi.code}</Badge><Badge variant={kpi.is_active ? 'default' : 'secondary'}>{kpi.is_active ? 'Actif' : 'Inactif'}</Badge></div><p className="mt-1 text-sm text-slate-500">{kpi.description || 'Sans description'} · {kpi.category} · {kpi.periodicity}</p><p className="mt-1 text-xs text-slate-400">Formule : {kpi.formula} · Source : {kpi.source}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Modifier ${kpi.name}`} onClick={() => { setSelectedKpi(kpi); setEditorOpen(true); }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Supprimer ${kpi.name}`} onClick={() => setDeleteKpi(kpi)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div></div>)}</div>}</CardContent></Card><KpiForm open={editorOpen} onOpenChange={setEditorOpen} kpi={selectedKpi} pending={saveMutation.isPending} onSubmit={(kpi) => saveMutation.mutate({ kpi, id: selectedKpi?.id })} /><Sheet open={!!deleteKpi} onOpenChange={(open) => !open && setDeleteKpi(null)}><SheetContent><SheetHeader><SheetTitle>Supprimer ce KPI ?</SheetTitle><SheetDescription>Les valeurs historisées liées à ce KPI seront également supprimées par la base.</SheetDescription></SheetHeader><div className="mt-6 flex gap-3"><Button variant="outline" onClick={() => setDeleteKpi(null)} className="flex-1">Annuler</Button><Button variant="destructive" onClick={() => deleteMutation.mutate(deleteKpi)} disabled={deleteMutation.isPending} className="flex-1">Supprimer</Button></div></SheetContent></Sheet></div></ProtectedRoute>;
}

function KpiForm({ open, onOpenChange, kpi, pending, onSubmit }) {
  const [form, setForm] = useState(emptyKpi);
  useEffect(() => setForm(kpi ? { ...emptyKpi, ...kpi } : emptyKpi), [kpi, open]);
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const submit = (event) => { event.preventDefault(); onSubmit(form); };

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>{kpi ? 'Modifier le KPI' : 'Nouveau KPI'}</SheetTitle><SheetDescription>La formule et la source sont conservées pour expliquer chaque valeur calculée.</SheetDescription></SheetHeader><form onSubmit={submit} className="mt-6 space-y-5"><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="kpi-code">Code *</Label><Input id="kpi-code" value={form.code} onChange={update('code')} placeholder="CA_MENSUEL" required /></div><div className="space-y-2"><Label htmlFor="kpi-name">Nom *</Label><Input id="kpi-name" value={form.name} onChange={update('name')} required /></div></div><div className="space-y-2"><Label htmlFor="kpi-description">Description</Label><Input id="kpi-description" value={form.description} onChange={update('description')} /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="kpi-category">Catégorie</Label><select id="kpi-category" value={form.category} onChange={update('category')} className="flex h-9 w-full rounded-md border px-3 text-sm">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div><div className="space-y-2"><Label htmlFor="kpi-periodicity">Périodicité</Label><select id="kpi-periodicity" value={form.periodicity} onChange={update('periodicity')} className="flex h-9 w-full rounded-md border px-3 text-sm"><option value="monthly">Mensuelle</option><option value="quarterly">Trimestrielle</option><option value="annual">Annuelle</option></select></div></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="kpi-unit">Unité</Label><Input id="kpi-unit" value={form.unit} onChange={update('unit')} placeholder="EUR, %, jours..." /></div><div className="space-y-2"><Label htmlFor="kpi-source">Source</Label><Input id="kpi-source" value={form.source} onChange={update('source')} placeholder="accounting_entries" /></div></div><div className="space-y-2"><Label htmlFor="kpi-formula">Formule *</Label><Input id="kpi-formula" value={form.formula} onChange={update('formula')} placeholder="SUM(credit compte 7)" required /></div><div className="grid grid-cols-3 gap-4"><div className="space-y-2"><Label htmlFor="kpi-target">Objectif</Label><Input id="kpi-target" type="number" step="0.01" value={form.target_value} onChange={update('target_value')} /></div><div className="space-y-2"><Label htmlFor="kpi-warning">Vigilance</Label><Input id="kpi-warning" type="number" step="0.01" value={form.warning_threshold} onChange={update('warning_threshold')} /></div><div className="space-y-2"><Label htmlFor="kpi-alert">Alerte</Label><Input id="kpi-alert" type="number" step="0.01" value={form.alert_threshold} onChange={update('alert_threshold')} /></div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={update('is_active')} /> KPI actif</label><Button type="submit" disabled={pending} className="w-full">{pending ? 'Enregistrement...' : 'Enregistrer'}</Button></form></SheetContent></Sheet>;
}
