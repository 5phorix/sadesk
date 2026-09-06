import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Edit,
  Trash2,
  BarChart3
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import AmountDisplay from '@/components/common/AmountDisplay';
import BudgetForm from '@/components/budget/BudgetForm';

export default function BudgetTracking() {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [deleteBudget, setDeleteBudget] = useState(null);
  const queryClient = useQueryClient();

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('budgets').select('*').eq('company_id', user.active_company_id).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const handleDelete = async () => {
    if (deleteBudget) {
      const { error } = await supabase.from('budgets').delete().eq('id', deleteBudget.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget supprimé');
      setDeleteBudget(null);
    }
  };

  // Calcul des réalisations par budget
  const budgetAnalysis = useMemo(() => {
    return budgets.map(budget => {
      let realized = 0;
      
      // Filtrer les écritures selon le budget
      const relatedEntries = entries.filter(entry => {
        if (budget.account_code && !entry.account_code?.startsWith(budget.account_code.substring(0, 3))) {
          return false;
        }
        if (budget.cost_center_code && entry.cost_center_code !== budget.cost_center_code) {
          return false;
        }
        return true;
      });

      // Calculer le réalisé
      if (budget.category === 'revenue') {
        realized = relatedEntries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
      } else {
        realized = relatedEntries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
      }

      const budgetAmount = parseFloat(budget.total_amount) || 0;
      const percentage = budgetAmount > 0 ? (realized / budgetAmount) * 100 : 0;
      const remaining = budgetAmount - realized;
      const status = percentage >= budget.alert_threshold ? 'alert' : percentage >= 75 ? 'warning' : 'ok';

      return {
        ...budget,
        realized,
        percentage: Math.round(percentage * 10) / 10,
        remaining,
        status
      };
    });
  }, [budgets, entries]);

  const stats = useMemo(() => {
    const totalBudget = budgetAnalysis.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0);
    const totalRealized = budgetAnalysis.reduce((sum, b) => sum + b.realized, 0);
    const alertCount = budgetAnalysis.filter(b => b.status === 'alert').length;
    
    return { totalBudget, totalRealized, alertCount };
  }, [budgetAnalysis]);

  // Données pour le graphique
  const chartData = useMemo(() => {
    return budgetAnalysis.slice(0, 8).map(b => ({
      name: b.name.length > 20 ? b.name.substring(0, 20) + '...' : b.name,
      Budgété: Math.round(parseFloat(b.total_amount) || 0),
      Réalisé: Math.round(b.realized)
    }));
  }, [budgetAnalysis]);

  if (!user?.active_company_id) {
    return null;
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader
          title="Suivi budgétaire"
          subtitle="Suivez et analysez vos budgets en temps réel"
          actions={
            <Button onClick={() => { setSelectedBudget(null); setShowForm(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouveau budget
            </Button>
          }
        />

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Budget total</div>
                  <AmountDisplay amount={stats.totalBudget} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Réalisé</div>
                  <AmountDisplay amount={stats.totalRealized} size="lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Alertes</div>
                  <div className="text-2xl font-bold">{stats.alertCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">Liste des budgets</TabsTrigger>
            <TabsTrigger value="chart">Graphique</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {budgetAnalysis.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <BarChart3 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500 mb-4">Aucun budget défini</p>
                  <Button onClick={() => setShowForm(true)} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Créer un budget
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {budgetAnalysis.map((budget) => (
                  <Card key={budget.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg text-slate-800">{budget.name}</h3>
                            <Badge variant={budget.category === 'revenue' ? 'default' : 'outline'}>
                              {budget.category === 'revenue' ? 'Revenus' : 
                               budget.category === 'expense' ? 'Dépenses' : 'Investissements'}
                            </Badge>
                            {budget.status === 'alert' && (
                              <Badge className="bg-red-100 text-red-700 gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Seuil atteint
                              </Badge>
                            )}
                            {budget.status === 'warning' && (
                              <Badge className="bg-orange-100 text-orange-700">
                                Attention
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 space-y-1">
                            {budget.account_code && <div>Compte: {budget.account_code}</div>}
                            {budget.cost_center_code && <div>Centre de coût: {budget.cost_center_code}</div>}
                            {budget.description && <div>{budget.description}</div>}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedBudget(budget); setShowForm(true); }}>
                              <Edit className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => setDeleteBudget(budget)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Budgété</span>
                          <AmountDisplay amount={budget.total_amount} className="font-semibold" />
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Réalisé</span>
                          <AmountDisplay 
                            amount={budget.realized} 
                            className={`font-semibold ${budget.status === 'alert' ? 'text-red-600' : ''}`}
                          />
                        </div>
                        <Progress 
                          value={Math.min(budget.percentage, 100)} 
                          className={`h-2 ${
                            budget.status === 'alert' ? 'bg-red-100 [&>div]:bg-red-600' :
                            budget.status === 'warning' ? 'bg-orange-100 [&>div]:bg-orange-600' :
                            'bg-emerald-100 [&>div]:bg-emerald-600'
                          }`}
                        />
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">{budget.percentage}% consommé</span>
                          <span className={`font-medium ${budget.remaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            Reste: <AmountDisplay amount={budget.remaining} />
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="chart">
            <Card>
              <CardHeader>
                <CardTitle>Comparaison Budget vs Réalisé</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Budgété" fill="#3b82f6" />
                      <Bar dataKey="Réalisé" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    Aucune donnée à afficher
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <BudgetForm
        open={showForm}
        budget={selectedBudget}
        onClose={() => { setShowForm(false); setSelectedBudget(null); }}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ['budgets'] });
          setShowForm(false);
          setSelectedBudget(null);
          toast.success('Budget enregistré');
        }}
      />

      <AlertDialog open={!!deleteBudget} onOpenChange={() => setDeleteBudget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le budget</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le budget "{deleteBudget?.name}" ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}