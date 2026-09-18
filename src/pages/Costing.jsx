import React, { useMemo, useState } from 'react';
import { 
  Calculator, 
  Save, 
  TrendingUp, 
  FileText,
  Info
} from 'lucide-react';
import { useUser } from '@/components/hooks/useUser';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  calculateCost, 
  COSTING_METHODS, 
  COSTING_METHOD_DETAILS 
} from '@/lib/management';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AmountDisplay from '@/components/common/AmountDisplay';

const initial = {
  method: 'FULL_COST',
  object_type: 'product',
  object_name: '',
  directCosts: 120,
  indirectCosts: 45,
  variableCosts: 80,
  fixedCosts: 3000,
  standardCost: 150,
  driverName: 'Heures machines',
  driverValue: 12,
  driverRate: 3.5,
  marginalUnitCost: 25,
  sellingPrice: 190,
  quantity: 1
};

export default function Costing() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);

  // Historique des calculs
  const { data: history = [] } = useQuery({
    queryKey: ['costing_calculations', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('performance_costing_calculations')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });

  const result = useMemo(() => {
    return calculateCost({
      ...form,
      standardCost: form.standardCost === '' ? null : Number(form.standardCost)
    });
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('performance_costing_calculations')
        .insert({
          company_id: companyId,
          object_type: form.object_type,
          object_key: form.object_name || 'Sans titre',
          method: form.method,
          model_version: 1,
          inputs: form,
          result
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costing_calculations'] });
      toast.success('Calcul de coût enregistré et historisé avec succès !');
    },
    onError: (error) => toast.error(error.message || 'Erreur lors de l’historisation'),
  });

  const update = (field) => (event) => {
    const isNum = event.target.type === 'number';
    const val = isNum ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value;
    setForm((current) => ({ ...current, [field]: val }));
  };

  const handleMethodSelect = (method) => {
    setForm((current) => ({ ...current, method }));
  };

  const currentMethodConfig = COSTING_METHOD_DETAILS[form.method] || COSTING_METHOD_DETAILS.FULL_COST;

  return (
    <ProtectedRoute>
      <div className="space-y-8 pb-16">
        <PageHeader 
          title="Calcul & Analyse des Coûts" 
          subtitle="Modélisez vos coûts de revient et marges selon 6 méthodes de contrôle de gestion spécialisées."
        />

        {/* Sélecteur de méthode visuel adapté */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold text-slate-800">
              Sélectionnez la méthode de calcul des coûts
            </Label>
            <span className="text-xs text-slate-500">
              Formule active : <strong className="font-mono text-blue-900">{currentMethodConfig.formula}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COSTING_METHODS.map((methodKey) => {
              const meta = COSTING_METHOD_DETAILS[methodKey];
              const isSelected = form.method === methodKey;
              return (
                <button
                  key={methodKey}
                  type="button"
                  onClick={() => handleMethodSelect(methodKey)}
                  className={cn(
                    "flex flex-col text-left p-4 rounded-2xl border transition-all relative overflow-hidden",
                    isSelected
                      ? "border-[#1e3a5f] bg-blue-50/60 shadow-xs ring-1 ring-[#1e3a5f]"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-xs text-slate-900">{meta.label}</span>
                    {isSelected && (
                      <Badge className="bg-[#1e3a5f] text-white text-[10px] px-1.5 py-0 font-normal">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">
                    {meta.shortDescription}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grille Principale : Formulaire Dynamique vs Résultat en temps réel */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          
          {/* CARTE 1 : FORMULAIRE ADAPTATIF AUX INPUTS DE LA MÉTHODE CHOISIE */}
          <Card className="rounded-3xl border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-[#1e3a5f]" />
                    Paramètres & Hypothèses : {currentMethodConfig.label}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    {currentMethodConfig.shortDescription}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              
              {/* Identification de l'objet de coût */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1.5">
                  <Label htmlFor="cost-object-name" className="text-xs font-semibold text-slate-700">
                    Nom de l’objet analysé
                  </Label>
                  <Input 
                    id="cost-object-name" 
                    value={form.object_name} 
                    onChange={update('object_name')} 
                    placeholder="Ex: Produit Alpha, Client Dupont, Projet B..." 
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cost-object-type" className="text-xs font-semibold text-slate-700">
                    Type d’objet
                  </Label>
                  <select 
                    id="cost-object-type"
                    value={form.object_type} 
                    onChange={update('object_type')} 
                    className="flex h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="product">Produit fini ou Service</option>
                    <option value="client">Compte Client</option>
                    <option value="project">Projet / Chantier</option>
                    <option value="department">Département / Atelier</option>
                  </select>
                </div>
              </div>

              {/* 1. INPUTS SPÉCIFIQUES : FULL_COST */}
              {form.method === 'FULL_COST' && (
                <div className="space-y-4">
                  <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100 text-xs text-blue-900 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-700" />
                    <span>
                      Le coût complet additionne les consommations directes et les quotes-parts de frais de structure (centres auxiliaires & principaux).
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-direct" className="text-xs font-semibold text-slate-700">
                        Coûts directs (€) (Matières, Main d’œuvre)
                      </Label>
                      <Input id="cost-direct" type="number" step="0.01" value={form.directCosts} onChange={update('directCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-indirect" className="text-xs font-semibold text-slate-700">
                        Coûts indirects alloués (€) (Charges de structure)
                      </Label>
                      <Input id="cost-indirect" type="number" step="0.01" value={form.indirectCosts} onChange={update('indirectCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-quantity" className="text-xs font-semibold text-slate-700">
                        Quantité produite / vendue
                      </Label>
                      <Input id="cost-quantity" type="number" step="1" min="1" value={form.quantity} onChange={update('quantity')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-selling-price" className="text-xs font-semibold text-slate-700">
                        Prix de vente unitaire HT (€) (Optionnel pour marge)
                      </Label>
                      <Input id="cost-selling-price" type="number" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} className="rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {/* 2. INPUTS SPÉCIFIQUES : VARIABLE_COST */}
              {form.method === 'VARIABLE_COST' && (
                <div className="space-y-4">
                  <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100 text-xs text-amber-900 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>
                      Isole les charges variables pour déterminer la Marge sur Coût Variable (MCV) et le Seuil de Rentabilité couvrant les frais fixes.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-var" className="text-xs font-semibold text-slate-700">
                        Total des charges variables (€)
                      </Label>
                      <Input id="cost-var" type="number" step="0.01" value={form.variableCosts} onChange={update('variableCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-fixed" className="text-xs font-semibold text-slate-700">
                        Charges fixes globales de la période (€)
                      </Label>
                      <Input id="cost-fixed" type="number" step="0.01" value={form.fixedCosts} onChange={update('fixedCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-quantity" className="text-xs font-semibold text-slate-700">
                        Quantité (Volume d’activité)
                      </Label>
                      <Input id="cost-quantity" type="number" step="1" min="1" value={form.quantity} onChange={update('quantity')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-selling-price" className="text-xs font-semibold text-slate-700">
                        Prix de vente unitaire HT (€)
                      </Label>
                      <Input id="cost-selling-price" type="number" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} className="rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. INPUTS SPÉCIFIQUES : DIRECT_COST */}
              {form.method === 'DIRECT_COST' && (
                <div className="space-y-4">
                  <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 text-xs text-emerald-900 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
                    <span>
                      Intègre les coûts directement affectables (matières consommées, machines dédiées, personnel dédié) sans clé de répartition arbitraire.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-direct-total" className="text-xs font-semibold text-slate-700">
                        Total des charges directes affectées (€)
                      </Label>
                      <Input id="cost-direct-total" type="number" step="0.01" value={form.directCosts} onChange={update('directCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-quantity" className="text-xs font-semibold text-slate-700">
                        Quantité produite / vendue
                      </Label>
                      <Input id="cost-quantity" type="number" step="1" min="1" value={form.quantity} onChange={update('quantity')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-selling-price" className="text-xs font-semibold text-slate-700">
                        Prix de vente unitaire HT (€) (Optionnel)
                      </Label>
                      <Input id="cost-selling-price" type="number" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} className="rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. INPUTS SPÉCIFIQUES : STANDARD_COST */}
              {form.method === 'STANDARD_COST' && (
                <div className="space-y-4">
                  <div className="bg-purple-50/50 p-3 rounded-2xl border border-purple-100 text-xs text-purple-900 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-purple-700" />
                    <span>
                      Analyse des écarts de gestion : compare le coût réel constaté au coût standard budgété pour isoler les dérives de rendement ou de prix.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-real" className="text-xs font-semibold text-slate-700">
                        Coût réel constaté (€)
                      </Label>
                      <Input id="cost-real" type="number" step="0.01" value={form.directCosts} onChange={update('directCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-standard" className="text-xs font-semibold text-slate-700">
                        Coût standard préétabli / budgété (€)
                      </Label>
                      <Input id="cost-standard" type="number" step="0.01" value={form.standardCost} onChange={update('standardCost')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-quantity" className="text-xs font-semibold text-slate-700">
                        Quantité réalisée
                      </Label>
                      <Input id="cost-quantity" type="number" step="1" min="1" value={form.quantity} onChange={update('quantity')} className="rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {/* 5. INPUTS SPÉCIFIQUES : ABC */}
              {form.method === 'ABC' && (
                <div className="space-y-4">
                  <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-indigo-700" />
                    <span>
                      Méthode ABC : les produits consomment des activités mesurées par des inducteurs (heures machines, séries, expéditions).
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-direct" className="text-xs font-semibold text-slate-700">
                        Coûts directs (€) (Matières & MOD directe)
                      </Label>
                      <Input id="cost-direct" type="number" step="0.01" value={form.directCosts} onChange={update('directCosts')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-driver-name" className="text-xs font-semibold text-slate-700">
                        Nom de l’inducteur de coût
                      </Label>
                      <Input id="cost-driver-name" value={form.driverName} onChange={update('driverName')} placeholder="Ex: Heures machines, Nb de lots..." className="rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-driver-val" className="text-xs font-semibold text-slate-700">
                        Volume d’inducteur consommé
                      </Label>
                      <Input id="cost-driver-val" type="number" step="0.01" value={form.driverValue} onChange={update('driverValue')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-driver-rate" className="text-xs font-semibold text-slate-700">
                        Coût unitaire de l’inducteur (€ / unité)
                      </Label>
                      <Input id="cost-driver-rate" type="number" step="0.01" value={form.driverRate} onChange={update('driverRate')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-quantity" className="text-xs font-semibold text-slate-700">
                        Quantité produite
                      </Label>
                      <Input id="cost-quantity" type="number" step="1" min="1" value={form.quantity} onChange={update('quantity')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-selling-price" className="text-xs font-semibold text-slate-700">
                        Prix de vente unitaire HT (€) (Optionnel)
                      </Label>
                      <Input id="cost-selling-price" type="number" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} className="rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {/* 6. INPUTS SPÉCIFIQUES : MARGINAL_COST */}
              {form.method === 'MARGINAL_COST' && (
                <div className="space-y-4">
                  <div className="bg-rose-50/50 p-3 rounded-2xl border border-rose-100 text-xs text-rose-900 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-rose-700" />
                    <span>
                      Analyse d’opportunité : calcule le coût engendré par une commande supplémentaire pour fixer un prix plancher rentable.
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-marginal-unit" className="text-xs font-semibold text-slate-700">
                        Coût marginal unitaire (€ / unité suppl.)
                      </Label>
                      <Input id="cost-marginal-unit" type="number" step="0.01" value={form.marginalUnitCost} onChange={update('marginalUnitCost')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cost-quantity" className="text-xs font-semibold text-slate-700">
                        Nombre d’unités supplémentaires
                      </Label>
                      <Input id="cost-quantity" type="number" step="1" min="1" value={form.quantity} onChange={update('quantity')} className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="cost-selling-price" className="text-xs font-semibold text-slate-700">
                        Prix proposé pour la commande additionnelle (€ / unité)
                      </Label>
                      <Input id="cost-selling-price" type="number" step="0.01" value={form.sellingPrice} onChange={update('sellingPrice')} className="rounded-xl font-mono" />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Button 
                  onClick={() => saveMutation.mutate()} 
                  disabled={saveMutation.isPending} 
                  className="w-full sm:w-auto bg-[#1e3a5f] hover:bg-[#162c47] text-white rounded-xl gap-2 font-medium"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Enregistrement...' : 'Historiser ce calcul de coût'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* CARTE 2 : RESTITUTION DES RÉSULTATS DYNAMIQUE */}
          <div className="space-y-6">
            <Card className="rounded-3xl border-slate-200 shadow-xs overflow-hidden bg-linear-to-b from-white to-slate-50/50">
              <CardHeader className="bg-slate-900 text-white p-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    Résultats & Interprétation
                  </CardTitle>
                  <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs">
                    {result.method}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                
                {/* Résultat Principal : Coût Total */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {form.method === 'MARGINAL_COST' ? 'Coût marginal total de la série' : 'Coût Total Calculé'}
                  </span>
                  <div className="text-3xl font-black text-slate-900 font-mono">
                    <AmountDisplay amount={result.total} />
                  </div>
                  <div className="text-xs text-slate-500 pt-1 flex items-center justify-between border-t border-slate-100 mt-2">
                    <span>Coût unitaire ({form.quantity} unité{form.quantity > 1 ? 's' : ''}) :</span>
                    <strong className="font-mono text-slate-800 text-sm">{result.unitCost.toFixed(2)} € / u</strong>
                  </div>
                </div>

                {/* Décomposition selon la méthode */}
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Décomposition du calcul
                  </span>

                  {/* 1. Cas FULL_COST */}
                  {form.method === 'FULL_COST' && (
                    <div className="space-y-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>+ Coûts directs</span>
                        <span className="font-mono font-bold text-slate-900">{form.directCosts.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>+ Coûts indirects de structure</span>
                        <span className="font-mono font-bold text-slate-900">{form.indirectCosts.toFixed(2)} €</span>
                      </div>
                      {form.sellingPrice > 0 && (
                        <div className="border-t pt-2 flex justify-between font-bold text-emerald-800">
                          <span>Marge nette ({result.marginRate?.toFixed(1)}%)</span>
                          <span className="font-mono">{result.margin?.toFixed(2)} €</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Cas VARIABLE_COST */}
                  {form.method === 'VARIABLE_COST' && (
                    <div className="space-y-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>Chiffre d’affaires total</span>
                        <span className="font-mono font-bold text-slate-900">{result.turnover.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>- Coûts variables</span>
                        <span className="font-mono font-bold text-slate-900">{form.variableCosts.toFixed(2)} €</span>
                      </div>
                      <div className="border-t pt-1.5 flex justify-between font-bold text-blue-900">
                        <span>= Marge sur Coût Variable (MCV)</span>
                        <span className="font-mono">{result.margin?.toFixed(2)} € ({result.marginRate?.toFixed(1)}%)</span>
                      </div>
                      <div className="flex justify-between text-slate-600 pt-1">
                        <span>- Charges fixes</span>
                        <span className="font-mono font-bold text-slate-900">{form.fixedCosts.toFixed(2)} €</span>
                      </div>
                      <div className={cn("border-t pt-1.5 flex justify-between font-bold", result.breakdown.resultatExploitation >= 0 ? "text-emerald-800" : "text-rose-600")}>
                        <span>= Résultat d’Exploitation</span>
                        <span className="font-mono">{result.breakdown.resultatExploitation?.toFixed(2)} €</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg mt-2 text-[11px] text-slate-600 flex justify-between">
                        <span>Seuil de rentabilité en CA :</span>
                        <strong className="font-mono text-slate-900">{result.breakdown.seuilRentabilite?.toFixed(2)} €</strong>
                      </div>
                    </div>
                  )}

                  {/* 3. Cas DIRECT_COST */}
                  {form.method === 'DIRECT_COST' && (
                    <div className="space-y-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>Charges directes affectées</span>
                        <span className="font-mono font-bold text-slate-900">{form.directCosts.toFixed(2)} €</span>
                      </div>
                      {form.sellingPrice > 0 && (
                        <div className="border-t pt-2 flex justify-between font-bold text-emerald-800">
                          <span>Marge sur coûts directs ({result.marginRate?.toFixed(1)}%)</span>
                          <span className="font-mono">{result.margin?.toFixed(2)} €</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Cas STANDARD_COST */}
                  {form.method === 'STANDARD_COST' && (
                    <div className="space-y-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>Coût réel constaté</span>
                        <span className="font-mono font-bold text-slate-900">{form.directCosts.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Coût standard préétabli</span>
                        <span className="font-mono font-bold text-slate-900">{form.standardCost || 0} €</span>
                      </div>
                      <div className={cn(
                        "border-t pt-2 flex justify-between font-bold",
                        result.isFavorable ? "text-emerald-700" : "text-rose-600"
                      )}>
                        <span>Écart global (Réel - Standard)</span>
                        <span className="font-mono">
                          {result.variance > 0 ? `+${result.variance.toFixed(2)} €` : `${result.variance?.toFixed(2)} €`}
                        </span>
                      </div>
                      <Badge className={cn("w-full justify-center text-xs mt-1", result.isFavorable ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
                        {result.isFavorable ? '✓ Écart Favorable (Sous le budget)' : '⚠️ Écart Défavorable (Surcoût)'}
                      </Badge>
                    </div>
                  )}

                  {/* 5. Cas ABC */}
                  {form.method === 'ABC' && (
                    <div className="space-y-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>+ Coûts directs</span>
                        <span className="font-mono font-bold text-slate-900">{form.directCosts.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>+ {form.driverName || 'Inducteur'} ({form.driverValue} × {form.driverRate} €)</span>
                        <span className="font-mono font-bold text-slate-900">{result.allocatedIndirectCosts.toFixed(2)} €</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-bold text-indigo-900">
                        <span>= Coût de revient par activités</span>
                        <span className="font-mono">{result.total.toFixed(2)} €</span>
                      </div>
                    </div>
                  )}

                  {/* 6. Cas MARGINAL_COST */}
                  {form.method === 'MARGINAL_COST' && (
                    <div className="space-y-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>Coût marginal unitaire</span>
                        <span className="font-mono font-bold text-slate-900">{form.marginalUnitCost.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Prix unitaire proposé</span>
                        <span className="font-mono font-bold text-slate-900">{form.sellingPrice.toFixed(2)} €</span>
                      </div>
                      <div className={cn(
                        "border-t pt-2 flex justify-between font-bold",
                        result.breakdown.isProfitable ? "text-emerald-800" : "text-rose-600"
                      )}>
                        <span>Marge marginale additionnelle</span>
                        <span className="font-mono">{result.breakdown.incrementalMargin?.toFixed(2)} €</span>
                      </div>
                      <Badge className={cn("w-full justify-center text-xs mt-1", result.breakdown.isProfitable ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
                        {result.breakdown.isProfitable ? '✓ Commande marginale rentable' : '⚠️ Prix inférieur au coût marginal'}
                      </Badge>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

            {/* Historique récent des calculs */}
            <Card className="rounded-3xl border-slate-200 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-4">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  Derniers calculs historisés
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Aucun calcul sauvegardé pour l’instant.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {history.map((calc) => (
                      <div 
                        key={calc.id} 
                        className="p-2.5 bg-white rounded-xl border border-slate-200/70 hover:border-slate-300 transition-colors flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 block truncate max-w-[140px]">
                            {calc.object_key || 'Sans titre'}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal text-slate-500">
                            {calc.method}
                          </Badge>
                        </div>
                        <div className="text-right font-mono font-bold text-slate-900">
                          {Number(calc.result?.total || 0).toFixed(2)} €
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
