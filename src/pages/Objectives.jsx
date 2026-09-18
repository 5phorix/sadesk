import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Target } from 'lucide-react';
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

const emptyObjective = { name: '', dimension_type: 'company', dimension_key: '', period_start: `${new Date().getFullYear()}-01-01`, period_end: `${new Date().getFullYear()}-12-31`, target_value: '', unit: 'EUR', status: 'draft' };

export default function Objectives() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedObjective, setSelectedObjective] = useState(null);

  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ['performance-objectives', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('performance_objectives').select('*').eq('company_id', companyId).order('period_start', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  const { data: versions = [] } = useQuery({
    queryKey: ['performance-objective-versions', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('performance_objective_versions').select('*').eq('company_id', companyId).order('version', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ objective, id }) => {
      const payload = { ...objective, company_id: companyId, target_value: Number(objective.target_value) };
      if (id) {
        const { error } = await supabase.from('performance_objectives').update(payload).eq('id', id).eq('company_id', companyId);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from('performance_objectives').insert(payload).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-objectives', companyId] });
      setEditorOpen(false);
      setSelectedObjective(null);
      toast.success('Objectif enregistré');
    },
    onError: (error) => toast.error(error.message || 'Objectif non enregistré'),
  });

  const createVersionMutation = useMutation({
    mutationFn: async ({ objective, reason }) => {
      const objectiveVersions = versions.filter((version) => version.objective_id === objective.id);
      const nextVersion = Math.max(0, ...objectiveVersions.map((version) => Number(version.version))) + 1;
      const { error } = await supabase.from('performance_objective_versions').insert({
        company_id: companyId,
        objective_id: objective.id,
        version: nextVersion,
        target_value: objective.target_value,
        monthly_targets: {},
        reason,
        status: 'draft',
        valid_from: objective.period_start,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-objective-versions', companyId] });
      toast.success('Version d’objectif créée');
    },
    onError: (error) => toast.error(error.message || 'Version non créée'),
  });

  const { paginatedItems: pagedObjectives, currentPage, totalPages, totalItems, goToPrevious, goToNext } = usePagination(objectives, 10);

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Objectifs" subtitle="Objectifs versionnés par période et dimension." actions={<Button onClick={() => { setSelectedObjective(null); setEditorOpen(true); }} className="gap-2"><Plus className="h-4 w-4" />Nouvel objectif</Button>} /><Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Objectifs configurés</CardTitle></CardHeader><CardContent className="p-0">{isLoading ? <p className="p-6">Chargement...</p> : objectives.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Aucun objectif configuré.</p> : <div className="divide-y">{pagedObjectives.map((objective) => { const objectiveVersions = versions.filter((version) => version.objective_id === objective.id); return <div key={objective.id} className="flex flex-wrap items-center gap-4 p-4"><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{objective.name}</p><p className="text-sm text-slate-500">{objective.dimension_type}{objective.dimension_key ? ` · ${objective.dimension_key}` : ''} · {objective.period_start} → {objective.period_end}</p><p className="text-sm font-medium text-slate-700">Objectif : {Number(objective.target_value).toLocaleString('fr-FR')} {objective.unit}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{objective.status}</Badge><Badge variant="secondary">{objectiveVersions.length} version(s)</Badge></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => createVersionMutation.mutate({ objective, reason: 'Révision manuelle' })} disabled={createVersionMutation.isPending}>Nouvelle version</Button><Button variant="ghost" size="icon" aria-label={`Modifier ${objective.name}`} onClick={() => { setSelectedObjective(objective); setEditorOpen(true); }}><Edit className="h-4 w-4" /></Button></div></div>; })}</div>}</CardContent><PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={10} onPrevious={goToPrevious} onNext={goToNext} /></Card><ObjectiveForm open={editorOpen} onOpenChange={setEditorOpen} objective={selectedObjective} pending={saveMutation.isPending} onSubmit={(objective) => saveMutation.mutate({ objective, id: selectedObjective?.id })} /></div></ProtectedRoute>;
}

function ObjectiveForm({ open, onOpenChange, objective, pending, onSubmit }) {
  const [form, setForm] = useState(emptyObjective);
  useEffect(() => setForm(objective ? { ...emptyObjective, ...objective } : { ...emptyObjective }), [objective, open]);
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = (event) => { event.preventDefault(); if (form.period_end < form.period_start) return; onSubmit(form); };
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent><SheetHeader><SheetTitle>{objective ? 'Modifier l’objectif' : 'Nouvel objectif'}</SheetTitle><SheetDescription>Les révisions sont conservées dans des versions séparées.</SheetDescription></SheetHeader><form onSubmit={submit} className="mt-6 space-y-5"><div className="space-y-2"><Label htmlFor="objective-name">Nom *</Label><Input id="objective-name" value={form.name} onChange={update('name')} required /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="dimension-type">Niveau</Label><select id="dimension-type" value={form.dimension_type} onChange={update('dimension_type')} className="flex h-9 w-full rounded-md border px-3 text-sm"><option value="company">Entreprise</option><option value="activity">Activité</option><option value="service">Service</option><option value="product">Produit</option><option value="client">Client</option><option value="project">Projet</option><option value="cost_center">Centre de coûts</option></select></div><div className="space-y-2"><Label htmlFor="dimension-key">Identifiant dimension</Label><Input id="dimension-key" value={form.dimension_key || ''} onChange={update('dimension_key')} /></div></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="period-start">Début</Label><Input id="period-start" type="date" value={form.period_start} onChange={update('period_start')} required /></div><div className="space-y-2"><Label htmlFor="period-end">Fin</Label><Input id="period-end" type="date" value={form.period_end} onChange={update('period_end')} required /></div></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="target-value">Valeur cible *</Label><Input id="target-value" type="number" step="0.01" value={form.target_value} onChange={update('target_value')} required /></div><div className="space-y-2"><Label htmlFor="target-unit">Unité</Label><Input id="target-unit" value={form.unit} onChange={update('unit')} placeholder="EUR, %, jours..." /></div></div><Button type="submit" disabled={pending} className="w-full">{pending ? 'Enregistrement...' : 'Enregistrer'}</Button></form></SheetContent></Sheet>;
}
