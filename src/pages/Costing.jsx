import React, { useMemo, useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import { useUser } from '@/components/hooks/useUser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { calculateCost, COSTING_METHODS } from '@/lib/management';
import { toast } from 'sonner';

const initial = { method: 'FULL_COST', object_type: 'product', object_name: '', directCosts: 0, indirectCosts: 0, variableCosts: 0, fixedCosts: 0, standardCost: '', driverValue: 0, driverRate: 0, marginalUnitCost: 0, quantity: 1 };

export default function Costing() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const result = useMemo(() => calculateCost({ ...form, standardCost: form.standardCost === '' ? null : Number(form.standardCost) }), [form]);
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('performance_costing_calculations').insert({ company_id: companyId, object_type: form.object_type, object_key: form.object_name || null, method: form.method, model_version: 1, inputs: form, result });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries(); toast.success('Calcul historisé'); },
    onError: (error) => toast.error(error.message || 'Calcul non historisé'),
  });
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: ['number'].includes(event.target.type) ? Number(event.target.value) : event.target.value }));

  return <ProtectedRoute><div className="space-y-6"><PageHeader title="Calcul des coûts" subtitle="Comparez les méthodes et conservez les hypothèses utilisées." /><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Hypothèses du calcul</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Méthode</Label><select value={form.method} onChange={update('method')} className="flex h-9 w-full rounded-md border px-3 text-sm">{COSTING_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select></div><div className="space-y-2"><Label>Objet</Label><Input value={form.object_name} onChange={update('object_name')} placeholder="Produit, client, projet..." /></div></div><div className="grid grid-cols-2 gap-4">{[['directCosts','Coûts directs'],['indirectCosts','Coûts indirects'],['variableCosts','Coûts variables'],['fixedCosts','Coûts fixes'],['standardCost','Coût standard'],['driverValue','Valeur inducteur'],['driverRate','Taux inducteur'],['marginalUnitCost','Coût marginal unitaire'],['quantity','Quantité']].map(([field, label]) => <div className="space-y-2" key={field}><Label htmlFor={`cost-${field}`}>{label}</Label><Input id={`cost-${field}`} type="number" step="0.01" value={form[field]} onChange={update(field)} /></div>)}</div><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2"><Save className="h-4 w-4" />{saveMutation.isPending ? 'Historisation...' : 'Enregistrer le calcul'}</Button></CardContent></Card><Card><CardHeader><CardTitle>Résultat</CardTitle></CardHeader><CardContent className="space-y-4"><Badge variant="outline">{result.method}</Badge><div><p className="text-sm text-slate-500">Coût total</p><p className="text-3xl font-bold text-slate-900">{result.total.toLocaleString('fr-FR')} €</p></div><div><p className="text-sm text-slate-500">Coût unitaire</p><p className="text-xl font-semibold">{result.unitCost.toLocaleString('fr-FR')} €</p></div>{result.variance !== null && <div><p className="text-sm text-slate-500">Écart au standard</p><p className={result.variance > 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>{result.variance.toLocaleString('fr-FR')} €</p></div>}</CardContent></Card></div></div></ProtectedRoute>;
}
