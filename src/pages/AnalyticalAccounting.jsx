import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Target, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import AmountDisplay from '@/components/common/AmountDisplay';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePagination } from '@/components/common/usePagination';
import PaginationBar from '@/components/common/PaginationBar';

export default function AnalyticalAccounting() {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [editingCenter, setEditingCenter] = useState(null);
  const [deleteCenter, setDeleteCenter] = useState(null);
  const [selectedCenter, setSelectedCenter] = useState('all');

  const queryClient = useQueryClient();

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('cost_centers').select('*').eq('company_id', user.active_company_id).order('code');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id).eq('is_validated', true).order('date', { ascending: false }).limit(5000);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('cost_centers').insert({ ...data, company_id: user.active_company_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['cost-centers']);
      setShowForm(false);
      setEditingCenter(null);
      toast.success('Centre de coût créé');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('cost_centers').update(data).eq('id', id).eq('company_id', user.active_company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['cost-centers']);
      setShowForm(false);
      setEditingCenter(null);
      toast.success('Centre de coût modifié');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('cost_centers').delete().eq('id', id).eq('company_id', user.active_company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['cost-centers']);
      setDeleteCenter(null);
      toast.success('Centre de coût supprimé');
    },
  });

  // Analyse par centre de coût
  const analyticalData = useMemo(() => {
    const data = {};

    entries.forEach(entry => {
      const centerCode = entry.cost_center_code || 'NON_AFFECTE';
      const centerName = entry.cost_center_name || 'Non affecté';

      if (!data[centerCode]) {
        data[centerCode] = {
          code: centerCode,
          name: centerName,
          charges: 0,
          produits: 0,
          resultat: 0,
          count: 0
        };
      }

      if (entry.account_code?.startsWith('6')) {
        data[centerCode].charges += entry.debit || 0;
      } else if (entry.account_code?.startsWith('7')) {
        data[centerCode].produits += entry.credit || 0;
      }

      data[centerCode].count++;
    });

    Object.values(data).forEach(center => {
      center.resultat = center.produits - center.charges;
    });

    return Object.values(data).sort((a, b) => Math.abs(b.resultat) - Math.abs(a.resultat));
  }, [entries]);

  // Budget vs Réalisé
  const budgetComparison = useMemo(() => {
    return costCenters.map(center => {
      const analytical = analyticalData.find(a => a.code === center.code) || {
        charges: 0,
        produits: 0
      };

      return {
        name: center.name,
        budget: center.budget_annual || 0,
        realise: analytical.charges,
        ecart: (center.budget_annual || 0) - analytical.charges,
        tauxRealisation: center.budget_annual ? (analytical.charges / center.budget_annual * 100) : 0
      };
    }).filter(c => c.budget > 0);
  }, [costCenters, analyticalData]);

  const handleSubmit = (formData) => {
    if (editingCenter) {
      updateMutation.mutate({ id: editingCenter.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredAnalytical = selectedCenter === 'all' 
    ? analyticalData 
    : analyticalData.filter(d => d.code === selectedCenter);

  const analyticalPagination = usePagination(filteredAnalytical, 10);
  const budgetPagination = usePagination(budgetComparison, 10);
  const centersPagination = usePagination(costCenters, 9);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptabilité Analytique"
        subtitle="Gestion des centres de coûts et analyse de rentabilité"
        actions={
          <Button onClick={() => { setEditingCenter(null); setShowForm(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau centre
          </Button>
        }
      />

      {/* Vue d'ensemble */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              Centres actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800">
              {costCenters.filter(c => c.is_active).length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total charges</CardTitle>
          </CardHeader>
          <CardContent>
            <AmountDisplay 
              amount={analyticalData.reduce((sum, d) => sum + d.charges, 0)} 
              size="xl" 
              className="text-slate-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total produits</CardTitle>
          </CardHeader>
          <CardContent>
            <AmountDisplay 
              amount={analyticalData.reduce((sum, d) => sum + d.produits, 0)} 
              size="xl" 
              className="text-slate-800"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Résultat global</CardTitle>
          </CardHeader>
          <CardContent>
            <AmountDisplay 
              amount={analyticalData.reduce((sum, d) => sum + d.resultat, 0)} 
              size="xl" 
              className={analyticalData.reduce((sum, d) => sum + d.resultat, 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analysis" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analysis">Analyse</TabsTrigger>
          <TabsTrigger value="budget">Budget vs Réalisé</TabsTrigger>
          <TabsTrigger value="centers">Centres de coûts</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Analyse par centre de coût</CardTitle>
                  <CardDescription>Charges, produits et résultat</CardDescription>
                </div>
                <Select value={selectedCenter} onValueChange={setSelectedCenter}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les centres</SelectItem>
                    {costCenters.map(center => (
                      <SelectItem key={center.id} value={center.code}>
                        {center.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticalPagination.paginatedItems.map(data => (
                  <div key={data.code} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-800">{data.name}</h4>
                        <p className="text-xs text-slate-500">{data.count} écritures</p>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-sm font-semibold",
                        data.resultat >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      )}>
                        {data.resultat >= 0 ? '+' : ''}{data.resultat.toLocaleString('fr-FR')} €
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Charges</p>
                        <AmountDisplay amount={data.charges} size="sm" className="font-semibold text-red-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Produits</p>
                        <AmountDisplay amount={data.produits} size="sm" className="font-semibold text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Résultat</p>
                        <AmountDisplay 
                          amount={data.resultat} 
                          size="sm" 
                          className={cn("font-semibold", data.resultat >= 0 ? "text-emerald-600" : "text-red-600")}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <PaginationBar currentPage={analyticalPagination.currentPage} totalPages={analyticalPagination.totalPages} totalItems={analyticalPagination.totalItems} pageSize={10} onPrevious={analyticalPagination.goToPrevious} onNext={analyticalPagination.goToNext} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Suivi budgétaire</CardTitle>
              <CardDescription>Comparaison budget vs réalisé par centre</CardDescription>
            </CardHeader>
            <CardContent>
              {budgetComparison.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <AlertCircle className="h-12 w-12 mx-auto mb-3" />
                  <p>Aucun budget défini</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={budgetComparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => `${value.toLocaleString('fr-FR')} €`} />
                      <Legend />
                      <Bar dataKey="budget" fill="#94a3b8" name="Budget" />
                      <Bar dataKey="realise" fill="#3b82f6" name="Réalisé" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-6 space-y-3">
                    {budgetPagination.paginatedItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{item.name}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span className="text-slate-600">
                              Budget: <AmountDisplay amount={item.budget} size="sm" />
                            </span>
                            <span className="text-slate-600">
                              Réalisé: <AmountDisplay amount={item.realise} size="sm" />
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn(
                            "px-3 py-1 rounded-full text-sm font-semibold mb-1",
                            item.ecart >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {item.ecart >= 0 ? '+' : ''}{item.ecart.toLocaleString('fr-FR')} €
                          </div>
                          <p className="text-xs text-slate-500">{item.tauxRealisation.toFixed(0)}% réalisé</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <PaginationBar currentPage={budgetPagination.currentPage} totalPages={budgetPagination.totalPages} totalItems={budgetPagination.totalItems} pageSize={10} onPrevious={budgetPagination.goToPrevious} onNext={budgetPagination.goToNext} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {centersPagination.paginatedItems.map(center => (
              <Card key={center.id} className={!center.is_active ? 'opacity-50' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{center.name}</CardTitle>
                      <p className="text-sm text-slate-500 mt-1">{center.code}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditingCenter(center); setShowForm(true); }}
                      >
                        ✏️
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={() => setDeleteCenter(center)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Type</span>
                      <span className="font-medium">{center.type}</span>
                    </div>
                    {center.budget_annual > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Budget annuel</span>
                        <AmountDisplay amount={center.budget_annual} size="sm" className="font-medium" />
                      </div>
                    )}
                    {center.responsible && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Responsable</span>
                        <span className="font-medium">{center.responsible}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationBar currentPage={centersPagination.currentPage} totalPages={centersPagination.totalPages} totalItems={centersPagination.totalItems} pageSize={9} onPrevious={centersPagination.goToPrevious} onNext={centersPagination.goToNext} />
        </TabsContent>
      </Tabs>

      {/* Formulaire */}
      <CostCenterForm
        open={showForm}
        onOpenChange={setShowForm}
        center={editingCenter}
        onSubmit={handleSubmit}
      />

      {/* Dialog suppression */}
      <AlertDialog open={!!deleteCenter} onOpenChange={() => setDeleteCenter(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce centre de coût ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Toutes les affectations analytiques resteront dans les écritures.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteCenter.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CostCenterForm({ open, onOpenChange, center, onSubmit }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'exploitation',
    budget_annual: 0,
    responsible: '',
    is_active: true,
    notes: ''
  });

  React.useEffect(() => {
    if (center) {
      setFormData(center);
    } else {
      setFormData({
        code: '',
        name: '',
        type: 'exploitation',
        budget_annual: 0,
        responsible: '',
        is_active: true,
        notes: ''
      });
    }
  }, [center, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{center ? 'Modifier' : 'Nouveau'} centre de coût</SheetTitle>
          <SheetDescription>
            Définissez les informations du centre de coût
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label>Code *</Label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Nom *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={formData.type} onValueChange={(value) => setFormData({...formData, type: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exploitation">Exploitation</SelectItem>
                <SelectItem value="structure">Structure</SelectItem>
                <SelectItem value="projet">Projet</SelectItem>
                <SelectItem value="produit">Produit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Budget annuel</Label>
            <Input
              type="number"
              value={formData.budget_annual}
              onChange={(e) => setFormData({...formData, budget_annual: parseFloat(e.target.value) || 0})}
            />
          </div>

          <div className="space-y-2">
            <Label>Responsable</Label>
            <Input
              value={formData.responsible}
              onChange={(e) => setFormData({...formData, responsible: e.target.value})}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Centre actif</Label>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]">
              {center ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}