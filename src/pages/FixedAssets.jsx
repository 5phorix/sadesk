import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Building2, Euro, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { assetImpairment, buildDepreciationEntries, buildDepreciationPlan, buildDisposalEntries, buildImpairmentEntries, straightLineDepreciation } from '@/lib/auxiliaryAccounting';

const emptyAsset = {
  name: '',
  asset_code: '',
  category: '',
  acquisition_date: '',
  in_service_date: '',
  acquisition_cost: 0,
  residual_value: 0,
  useful_life_months: 12,
  depreciation_method: 'straight_line',
  status: 'active',
  acquisition_account_code: '215000',
  depreciation_account_code: '281500',
  expense_account_code: '681100',
};

export default function FixedAssets() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [disposalAsset, setDisposalAsset] = useState(null);
  const [impairmentAsset, setImpairmentAsset] = useState(null);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['fixed-assets', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_assets').select('*').eq('company_id', companyId).order('acquisition_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: depreciations = [] } = useQuery({
    queryKey: ['fixed-asset-depreciations', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_asset_depreciations').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: impairments = [] } = useQuery({
    queryKey: ['fixed-asset-impairments', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_asset_impairments').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const planMutation = useMutation({
    mutationFn: async (asset) => {
      const plan = buildDepreciationPlan(asset).map((period) => ({ ...period, company_id: companyId, asset_id: asset.id }));
      if (!plan.length) throw new Error('Date de mise en service invalide');
      const { error } = await supabase.from('fixed_asset_depreciations').upsert(plan, { onConflict: 'asset_id,period_start,period_end', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-asset-depreciations', companyId] });
      toast.success('Plan d’amortissement généré');
    },
    onError: (error) => toast.error(error.message || 'Impossible de générer le plan'),
  });

  const postMutation = useMutation({
    mutationFn: async (asset) => {
      const pendingPeriods = depreciations.filter((period) => period.asset_id === asset.id && !period.is_posted);
      for (const period of pendingPeriods) {
        const entries = buildDepreciationEntries(asset, period, companyId);
        const { error: insertError } = await supabase.from('accounting_entries').insert(entries);
        if (insertError) throw insertError;
        const { error: updateError } = await supabase
          .from('fixed_asset_depreciations')
          .update({ is_posted: true, accounting_entry_number: entries[0].entry_number })
          .eq('id', period.id)
          .eq('company_id', companyId);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-asset-depreciations', companyId] });
      queryClient.invalidateQueries({ queryKey: ['entries', companyId] });
      toast.success('Dotations comptabilisées en brouillon');
    },
    onError: (error) => toast.error(error.message || 'Impossible de comptabiliser les dotations'),
  });

  const disposalMutation = useMutation({
    mutationFn: async ({ asset, disposal }) => {
      const postedDepreciation = depreciations
        .filter((period) => period.asset_id === asset.id && period.is_posted)
        .reduce((total, period) => total + Number(period.amount || 0), 0);
      const disposalAsset = { ...asset, disposal_date: disposal.date, disposal_proceeds: Number(disposal.proceeds || 0) };
      const entries = buildDisposalEntries(disposalAsset, postedDepreciation, companyId);
      if (!entries.length) throw new Error('La cession ne produit aucune écriture');
      const { error: insertError } = await supabase.from('accounting_entries').insert(entries);
      if (insertError) throw insertError;
      const { error } = await supabase.from('fixed_assets').update({
        status: 'disposed',
        disposal_date: disposal.date,
        disposal_proceeds: Number(disposal.proceeds || 0),
        disposal_reason: disposal.reason || null,
        disposal_entry_number: entries[0].entry_number,
      }).eq('id', asset.id).eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets', companyId] });
      setDisposalAsset(null);
      toast.success('Sortie enregistrée en brouillon comptable');
    },
    onError: (error) => toast.error(error.message || 'Impossible d’enregistrer la sortie'),
  });

  const impairmentMutation = useMutation({
    mutationFn: async ({ asset, assessment }) => {
      const accumulated = depreciations.filter((period) => period.asset_id === asset.id && period.is_posted).reduce((total, period) => total + Number(period.amount || 0), 0);
      const values = assetImpairment(Number(asset.acquisition_cost || 0) - accumulated, Number(assessment.recoverable_value || 0));
      if (values.impairment <= 0) throw new Error('Aucune dépréciation à enregistrer');
      const entryPreview = buildImpairmentEntries(asset, { ...values, assessment_date: assessment.date }, companyId);
      const { data: created, error: insertError } = await supabase.from('fixed_asset_impairments').insert({ ...values, company_id: companyId, asset_id: asset.id, assessment_date: assessment.date, notes: assessment.notes || null }).select().single();
      if (insertError) throw insertError;
      const { error: entryError } = await supabase.from('accounting_entries').insert(entryPreview);
      if (entryError) throw entryError;
      const { error: updateError } = await supabase.from('fixed_asset_impairments').update({ is_posted: true, accounting_entry_number: entryPreview[0].entry_number }).eq('id', created.id).eq('company_id', companyId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-asset-impairments', companyId] });
      queryClient.invalidateQueries({ queryKey: ['entries', companyId] });
      setImpairmentAsset(null);
      toast.success('Dépréciation enregistrée en brouillon comptable');
    },
    onError: (error) => toast.error(error.message || 'Impossible d’enregistrer la dépréciation'),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ asset, id }) => {
      const query = id
        ? supabase.from('fixed_assets').update(asset).eq('id', id).eq('company_id', companyId)
        : supabase.from('fixed_assets').insert({ ...asset, company_id: companyId });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed-assets', companyId] });
      setFormOpen(false);
      setEditingAsset(null);
      toast.success('Immobilisation enregistrée');
    },
    onError: (error) => toast.error(error.message || 'Impossible d’enregistrer l’immobilisation'),
  });

  const totalCost = assets.reduce((sum, asset) => sum + Number(asset.acquisition_cost || 0), 0);

  return <ProtectedRoute><div className="space-y-6">
    <PageHeader
      title="Immobilisations"
      subtitle="Suivi des biens, amortissements et valeurs nettes"
      actions={<Button onClick={() => { setEditingAsset(null); setFormOpen(true); }} className="gap-2"><Plus className="h-4 w-4" />Nouvelle immobilisation</Button>}
    />
    <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Actifs suivis</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{assets.length}</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Euro className="h-4 w-4" />Coût historique</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{totalCost.toFixed(2)} €</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Registre des immobilisations</CardTitle></CardHeader><CardContent>{isLoading ? <p>Chargement…</p> : assets.length === 0 ? <p className="text-sm text-slate-500">Aucune immobilisation enregistrée.</p> : <div className="divide-y">{assets.map((asset) => { const preview = straightLineDepreciation({ ...asset, accumulated_depreciation: 0 }, asset.in_service_date, asset.in_service_date); const assetDepreciations = depreciations.filter((item) => item.asset_id === asset.id); const assetImpairments = impairments.filter((item) => item.asset_id === asset.id); const pendingPeriods = assetDepreciations.filter((item) => !item.is_posted); return <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{asset.asset_code} · {asset.name}</p><p className="text-sm text-slate-500">{asset.category} · Mise en service {asset.in_service_date}{asset.disposal_date ? ` · Sortie ${asset.disposal_date}` : ''}</p></div><div className="flex flex-wrap items-center justify-end gap-3"><Badge variant="outline">{asset.useful_life_months} mois</Badge><span className="text-sm">Dotation mensuelle : <strong>{preview.monthlyAmount.toFixed(2)} €</strong></span><Badge>{asset.status}</Badge><Badge variant="secondary">{assetDepreciations.length} / {asset.useful_life_months} périodes</Badge>{assetImpairments.length > 0 && <Badge variant="secondary">Dépréciation : {assetImpairments.length}</Badge>}{asset.status !== 'disposed' && <><Button variant="outline" size="sm" disabled={planMutation.isPending} onClick={() => planMutation.mutate(asset)}>Générer le plan</Button><Button variant="outline" size="sm" disabled={!pendingPeriods.length || postMutation.isPending} onClick={() => postMutation.mutate(asset)}>Comptabiliser ({pendingPeriods.length})</Button><Button variant="outline" size="sm" onClick={() => setImpairmentAsset(asset)}>Déprécier</Button><Button variant="outline" size="sm" onClick={() => setDisposalAsset(asset)}>Sortir</Button></>}<Button variant="ghost" size="icon" aria-label={`Modifier ${asset.name}`} onClick={() => { setEditingAsset(asset); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button></div></div>; })}</div>}</CardContent></Card>
    <AssetForm open={formOpen} onOpenChange={setFormOpen} asset={editingAsset} pending={saveMutation.isPending} onSubmit={(asset) => saveMutation.mutate({ asset, id: editingAsset?.id })} />
    <DisposalForm open={!!disposalAsset} onOpenChange={(open) => !open && setDisposalAsset(null)} asset={disposalAsset} pending={disposalMutation.isPending} onSubmit={(disposal) => disposalMutation.mutate({ asset: disposalAsset, disposal })} />
    <ImpairmentForm open={!!impairmentAsset} onOpenChange={(open) => !open && setImpairmentAsset(null)} asset={impairmentAsset} pending={impairmentMutation.isPending} bookValue={impairmentAsset ? Number(impairmentAsset.acquisition_cost || 0) - depreciations.filter((period) => period.asset_id === impairmentAsset.id && period.is_posted).reduce((total, period) => total + Number(period.amount || 0), 0) : 0} onSubmit={(assessment) => impairmentMutation.mutate({ asset: impairmentAsset, assessment })} />
  </div></ProtectedRoute>;
}

function DisposalForm({ open, onOpenChange, asset, pending, onSubmit }) {
  const [formData, setFormData] = useState({ date: '', proceeds: 0, reason: '' });

  useEffect(() => {
    setFormData({ date: new Date().toISOString().slice(0, 10), proceeds: 0, reason: '' });
  }, [asset, open]);

  const update = (field) => (event) => setFormData((current) => ({ ...current, [field]: event.target.type === 'number' ? Number(event.target.value) : event.target.value }));
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formData.date || formData.date < asset.in_service_date) return;
    onSubmit(formData);
  };

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent><SheetHeader><SheetTitle>Sortir {asset?.name}</SheetTitle><SheetDescription>Enregistrez la date, le produit de cession et le motif de sortie.</SheetDescription></SheetHeader><form onSubmit={handleSubmit} className="mt-6 space-y-5"><div className="space-y-2"><Label htmlFor="disposal-date">Date de sortie *</Label><Input id="disposal-date" type="date" min={asset?.in_service_date} value={formData.date} onChange={update('date')} required /></div><div className="space-y-2"><Label htmlFor="disposal-proceeds">Produit de cession</Label><Input id="disposal-proceeds" type="number" min="0" step="0.01" value={formData.proceeds} onChange={update('proceeds')} /></div><div className="space-y-2"><Label htmlFor="disposal-reason">Motif</Label><Input id="disposal-reason" value={formData.reason} onChange={update('reason')} placeholder="Vente, mise au rebut..." /></div><div className="flex gap-3"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Annuler</Button><Button type="submit" disabled={pending} className="flex-1">Enregistrer la sortie</Button></div></form></SheetContent></Sheet>;
}

function ImpairmentForm({ open, onOpenChange, asset, bookValue, pending, onSubmit }) {
  const [formData, setFormData] = useState({ date: '', recoverable_value: 0, notes: '' });

  useEffect(() => {
    setFormData({ date: new Date().toISOString().slice(0, 10), recoverable_value: bookValue, notes: '' });
  }, [asset, bookValue, open]);

  const impairment = assetImpairment(bookValue, formData.recoverable_value);
  const update = (field) => (event) => setFormData((current) => ({ ...current, [field]: event.target.type === 'number' ? Number(event.target.value) : event.target.value }));
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formData.date || impairment.impairment <= 0) return;
    onSubmit(formData);
  };

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent><SheetHeader><SheetTitle>Déprécier {asset?.name}</SheetTitle><SheetDescription>Comparez la valeur comptable à la valeur recouvrable estimée.</SheetDescription></SheetHeader><form onSubmit={handleSubmit} className="mt-6 space-y-5"><div className="space-y-2"><Label>Valeur comptable</Label><Input value={bookValue.toFixed(2)} readOnly /></div><div className="space-y-2"><Label htmlFor="impairment-date">Date d’évaluation *</Label><Input id="impairment-date" type="date" value={formData.date} onChange={update('date')} required /></div><div className="space-y-2"><Label htmlFor="recoverable-value">Valeur recouvrable *</Label><Input id="recoverable-value" type="number" min="0" step="0.01" value={formData.recoverable_value} onChange={update('recoverable_value')} required /></div><div className="space-y-2"><Label htmlFor="impairment-notes">Notes</Label><Input id="impairment-notes" value={formData.notes} onChange={update('notes')} /></div><div className="rounded-lg bg-amber-50 p-4"><p className="text-sm text-amber-800">Dépréciation calculée</p><p className="text-xl font-semibold text-amber-900">{impairment.impairment.toFixed(2)} €</p></div><div className="flex gap-3"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Annuler</Button><Button type="submit" disabled={pending || impairment.impairment <= 0} className="flex-1">Enregistrer</Button></div></form></SheetContent></Sheet>;
}

function AssetForm({ open, onOpenChange, asset, pending, onSubmit }) {
  const [formData, setFormData] = useState(emptyAsset);

  useEffect(() => {
    setFormData(asset ? { ...emptyAsset, ...asset } : emptyAsset);
  }, [asset, open]);

  const preview = useMemo(() => straightLineDepreciation({ ...formData, accumulated_depreciation: 0 }, formData.in_service_date, formData.in_service_date), [formData]);
  const update = (field) => (event) => setFormData((current) => ({ ...current, [field]: event.target.type === 'number' ? Number(event.target.value) : event.target.value }));
  const handleSubmit = (event) => {
    event.preventDefault();
    if (formData.in_service_date < formData.acquisition_date) return;
    onSubmit({ ...formData, acquisition_cost: Number(formData.acquisition_cost), residual_value: Number(formData.residual_value), useful_life_months: Number(formData.useful_life_months) });
  };

  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>{asset ? 'Modifier l’immobilisation' : 'Nouvelle immobilisation'}</SheetTitle><SheetDescription>Renseignez les données nécessaires au registre et au plan linéaire.</SheetDescription></SheetHeader><form onSubmit={handleSubmit} className="mt-6 space-y-5">
    <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="asset-code">Code *</Label><Input id="asset-code" value={formData.asset_code} onChange={update('asset_code')} required /></div><div className="space-y-2"><Label htmlFor="asset-name">Nom *</Label><Input id="asset-name" value={formData.name} onChange={update('name')} required /></div></div>
    <div className="space-y-2"><Label htmlFor="asset-category">Catégorie *</Label><Input id="asset-category" value={formData.category} onChange={update('category')} required placeholder="Matériel, véhicule, logiciel..." /></div>
    <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="acquisition-date">Acquisition *</Label><Input id="acquisition-date" type="date" value={formData.acquisition_date} onChange={update('acquisition_date')} required /></div><div className="space-y-2"><Label htmlFor="service-date">Mise en service *</Label><Input id="service-date" type="date" value={formData.in_service_date} onChange={update('in_service_date')} min={formData.acquisition_date} required /></div></div>
    <div className="grid grid-cols-3 gap-4"><div className="space-y-2"><Label htmlFor="cost">Coût HT *</Label><Input id="cost" type="number" min="0" step="0.01" value={formData.acquisition_cost} onChange={update('acquisition_cost')} required /></div><div className="space-y-2"><Label htmlFor="residual">Valeur résiduelle</Label><Input id="residual" type="number" min="0" step="0.01" value={formData.residual_value} onChange={update('residual_value')} /></div><div className="space-y-2"><Label htmlFor="life">Durée (mois) *</Label><Input id="life" type="number" min="1" value={formData.useful_life_months} onChange={update('useful_life_months')} required /></div></div>
    <div className="grid grid-cols-3 gap-4"><div className="space-y-2"><Label htmlFor="acquisition-account">Compte actif</Label><Input id="acquisition-account" value={formData.acquisition_account_code} onChange={update('acquisition_account_code')} /></div><div className="space-y-2"><Label htmlFor="depreciation-account">Amortissement</Label><Input id="depreciation-account" value={formData.depreciation_account_code} onChange={update('depreciation_account_code')} /></div><div className="space-y-2"><Label htmlFor="expense-account">Dotation</Label><Input id="expense-account" value={formData.expense_account_code} onChange={update('expense_account_code')} /></div></div>
    <div className="rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">Dotation mensuelle estimée</p><p className="text-xl font-semibold">{preview.monthlyAmount.toFixed(2)} €</p></div>
    <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Annuler</Button><Button type="submit" disabled={pending} className="flex-1">{pending ? 'Enregistrement...' : 'Enregistrer'}</Button></div>
  </form></SheetContent></Sheet>;
}
