import React, { useState, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/components/hooks/useUser';
import {
  useBudgetLines,
  useBudgets,
  useManagementSettings,
  useYearEntries,
} from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import AmountDisplay from '@/components/common/AmountDisplay';
import BudgetForm from '@/components/budget/BudgetForm';
import ThresholdSettingsDialog from '@/components/budget/ThresholdSettingsDialog';
import { toastSupabaseError } from '@/lib/supabase-errors';
import {
  MONTH_LABELS,
  SCENARIOS,
  buildForecast,
  round2,
  scenarioCoefficient,
  summarizeBudget,
} from '@/lib/management';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  BarChart3,
  Edit,
  Gauge,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS = { revenue: 'Revenus', expense: 'Dépenses', investment: 'Investissements' };

const STATUS_STYLES = {
  ok: { label: 'Sous contrôle', className: 'bg-emerald-100 text-emerald-800' },
  warning: { label: 'Vigilance', className: 'bg-amber-100 text-amber-800' },
  alert: { label: 'Alerte', className: 'bg-red-100 text-red-800' },
};

const euro = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

const percent = (value) => (value === null || value === undefined ? '—' : `${value.toFixed(1)} %`);

function VarianceValue({ value, isFavorable }) {
  if (value === 0) return <span className="text-slate-500">—</span>;
  return (
    <span className={isFavorable ? 'text-emerald-600' : 'text-red-600'}>
      {value > 0 ? '+' : ''}
      {euro(value)}
    </span>
  );
}

export default function BudgetTracking() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [budgetToDelete, setBudgetToDelete] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [scenario, setScenario] = useState('realiste');
  const [detailBudgetId, setDetailBudgetId] = useState(null);

  const { data: budgets = [], isLoading: budgetsLoading } = useBudgets();
  const { data: budgetLines = [] } = useBudgetLines();
  const { data: entries = [], isLoading: entriesLoading } = useYearEntries(year);
  const { data: settings } = useManagementSettings();

  const coefficient = useMemo(() => scenarioCoefficient(scenario, settings), [scenario, settings]);
  const currentMonth = year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;

  const summaries = useMemo(
    () =>
      budgets
        .filter((budget) => !budget.fiscal_year || Number(budget.fiscal_year) === year)
        .map((budget) =>
          summarizeBudget({
            budget,
            budgetLines,
            entries,
            year,
            settings,
            scenarioCoefficient: coefficient,
            currentMonth,
          })
        ),
    [budgets, budgetLines, entries, year, settings, coefficient, currentMonth]
  );

  const totals = useMemo(() => {
    const budgeted = round2(summaries.reduce((total, item) => total + item.budgeted, 0));
    const actual = round2(summaries.reduce((total, item) => total + item.actual, 0));
    const projected = round2(summaries.reduce((total, item) => total + item.projected, 0));

    return {
      budgeted,
      actual,
      projected,
      variance: round2(actual - budgeted),
      consumption: budgeted === 0 ? null : round2((actual / budgeted) * 100),
      alerts: summaries.filter((item) => item.status === 'alert').length,
      warnings: summaries.filter((item) => item.status === 'warning').length,
    };
  }, [summaries]);

  const detail = useMemo(
    () => summaries.find((item) => item.budget.id === detailBudgetId) || summaries[0] || null,
    [summaries, detailBudgetId]
  );

  const detailChart = useMemo(() => {
    if (!detail) return [];
    return detail.months.map((month) => ({
      mois: month.label,
      Budget: month.budgeted,
      Réalisé: month.actual,
      'Écart cumulé': month.cumulativeVariance,
    }));
  }, [detail]);

  const forecastChart = useMemo(() => {
    if (!detail) return [];

    const history = detail.months.slice(0, currentMonth).map((month) => month.actual);
    const horizon = 12 - currentMonth;
    const projection = buildForecast(
      history.slice(-(settings?.forecast_history_months || 6)),
      horizon,
      coefficient
    );

    return detail.months.map((month, index) => ({
      mois: month.label,
      Réalisé: index < currentMonth ? month.actual : null,
      Prévision: index < currentMonth ? null : projection[index - currentMonth] ?? null,
      Budget: month.budgeted,
    }));
  }, [detail, currentMonth, settings, coefficient]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => current - 2 + index);
  }, []);

  const handleDelete = async () => {
    if (!budgetToDelete) return;
    try {
      const { error } = await supabase.from('budgets').delete().eq('id', budgetToDelete.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['budgets', user?.active_company_id] });
      queryClient.invalidateQueries({ queryKey: ['budget-lines', user?.active_company_id] });
      toast.success('Budget supprimé');
    } catch (error) {
      toastSupabaseError(error, "Le budget n'a pas pu être supprimé.");
    } finally {
      setBudgetToDelete(null);
    }
  };

  const isLoading = budgetsLoading || entriesLoading;

  return (
    <ProtectedRoute>
      <div>
        <PageHeader
          title="Suivi budgétaire"
          subtitle="Comparaison budget / réalisé, analyse des écarts et projections"
          actions={
            <>
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((item) => (
                    <SelectItem key={item} value={String(item)}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={() => setShowThresholds(true)}>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Seuils
              </Button>

              <Button
                className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                onClick={() => {
                  setSelectedBudget(null);
                  setShowForm(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nouveau budget
              </Button>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Budget {SCENARIOS.find((s) => s.key === scenario)?.label.toLowerCase()}</p>
              <p className="mt-1 text-2xl font-bold">{euro(totals.budgeted)}</p>
              <p className="mt-1 text-xs text-slate-500">{summaries.length} budget(s) sur {year}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Réalisé à fin {MONTH_LABELS[currentMonth - 1]}</p>
              <p className="mt-1 text-2xl font-bold">{euro(totals.actual)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Consommation {percent(totals.consumption)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Écart global</p>
              <p className="mt-1 text-2xl font-bold">
                <VarianceValue value={totals.variance} isFavorable={totals.variance <= 0} />
              </p>
              <p className="mt-1 text-xs text-slate-500">Projection fin d&apos;exercice {euro(totals.projected)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">Alertes</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{totals.alerts}</p>
              <p className="mt-1 text-xs text-slate-500">{totals.warnings} en vigilance</p>
            </CardContent>
          </Card>
        </div>

        {totals.alerts > 0 && (
          <Card className="mt-6 border-red-200 bg-red-50/50">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="text-sm text-red-900">
                <p className="font-semibold">
                  {totals.alerts} budget(s) dépassent le seuil d&apos;alerte
                </p>
                <p className="mt-1">
                  {summaries
                    .filter((item) => item.status === 'alert')
                    .map((item) => `${item.budget.name} (${percent(item.consumptionPercent)})`)
                    .join(' · ')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">
              <Target className="mr-2 h-4 w-4" />
              Vue d&apos;ensemble
            </TabsTrigger>
            <TabsTrigger value="monthly">
              <BarChart3 className="mr-2 h-4 w-4" />
              Budget / réalisé par mois
            </TabsTrigger>
            <TabsTrigger value="forecast">
              <TrendingUp className="mr-2 h-4 w-4" />
              Projection
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}

            {!isLoading && summaries.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-slate-500">
                  <Gauge className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  Aucun budget défini pour {year}.
                </CardContent>
              </Card>
            )}

            {summaries.map((item) => {
              const status = STATUS_STYLES[item.status];
              return (
                <Card key={item.budget.id}>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{item.budget.name}</h3>
                          <Badge className={status.className}>{status.label}</Badge>
                          <Badge variant="outline">
                            {CATEGORY_LABELS[item.budget.category] || item.budget.category}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.budget.cost_center_code
                            ? `Centre ${item.budget.cost_center_code}`
                            : 'Tous centres'}
                          {item.budget.account_code ? ` · Compte ${item.budget.account_code}` : ''}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setDetailBudgetId(item.budget.id);
                            }}
                          >
                            <BarChart3 className="mr-2 h-4 w-4" />
                            Analyser
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedBudget(item.budget);
                              setShowForm(true);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setBudgetToDelete(item.budget)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Progress
                      className="mt-4"
                      value={Math.min(100, item.consumptionPercent ?? 0)}
                    />

                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                      <div>
                        <p className="text-slate-500">Budget</p>
                        <AmountDisplay amount={item.budgeted} />
                      </div>
                      <div>
                        <p className="text-slate-500">Réalisé</p>
                        <AmountDisplay amount={item.actual} />
                      </div>
                      <div>
                        <p className="text-slate-500">Écart</p>
                        <p className="font-semibold">
                          <VarianceValue value={item.variance} isFavorable={item.isFavorable} />
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Écart %</p>
                        <p
                          className={`font-semibold ${item.isFavorable ? 'text-emerald-600' : 'text-red-600'}`}
                        >
                          {percent(item.variancePercent)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Projection</p>
                        <AmountDisplay amount={item.projected} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="monthly" className="mt-4 space-y-4">
            {detail ? (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">{detail.budget.name}</CardTitle>
                    <Select
                      value={detail.budget.id}
                      onValueChange={(value) => setDetailBudgetId(value)}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {summaries.map((item) => (
                          <SelectItem key={item.budget.id} value={item.budget.id}>
                            {item.budget.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={detailChart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mois" />
                        <YAxis />
                        <Tooltip formatter={(value) => euro(value)} />
                        <Legend />
                        <Bar dataKey="Budget" fill="#94a3b8" />
                        <Bar dataKey="Réalisé" fill="#1e3a5f" />
                        <Line type="monotone" dataKey="Écart cumulé" stroke="#dc2626" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Analyse des écarts</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="py-2 font-medium">Mois</th>
                          <th className="py-2 text-right font-medium">Budget</th>
                          <th className="py-2 text-right font-medium">Réalisé</th>
                          <th className="py-2 text-right font-medium">Écart</th>
                          <th className="py-2 text-right font-medium">Écart %</th>
                          <th className="py-2 text-right font-medium">Cumul écart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.months.map((month) => (
                          <tr key={month.month} className="border-b last:border-0">
                            <td className="py-2">{month.label}</td>
                            <td className="py-2 text-right">{euro(month.budgeted)}</td>
                            <td className="py-2 text-right">{euro(month.actual)}</td>
                            <td className="py-2 text-right">
                              <VarianceValue value={month.variance} isFavorable={month.isFavorable} />
                            </td>
                            <td
                              className={`py-2 text-right ${month.isFavorable ? 'text-emerald-600' : 'text-red-600'}`}
                            >
                              {percent(month.variancePercent)}
                            </td>
                            <td className="py-2 text-right">{euro(month.cumulativeVariance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold">
                          <td className="py-2">Total</td>
                          <td className="py-2 text-right">{euro(detail.budgeted)}</td>
                          <td className="py-2 text-right">{euro(detail.actual)}</td>
                          <td className="py-2 text-right">
                            <VarianceValue value={detail.variance} isFavorable={detail.isFavorable} />
                          </td>
                          <td className="py-2 text-right">{percent(detail.variancePercent)}</td>
                          <td className="py-2 text-right">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-slate-500">
                  Créez un budget pour accéder à la comparaison mensuelle.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="forecast" className="mt-4">
            {detail ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Projection {detail.budget.name} — scénario{' '}
                    {SCENARIOS.find((s) => s.key === scenario)?.label.toLowerCase()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={forecastChart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mois" />
                      <YAxis />
                      <Tooltip formatter={(value) => (value === null ? '—' : euro(value))} />
                      <Legend />
                      <Bar dataKey="Budget" fill="#e2e8f0" />
                      <Line type="monotone" dataKey="Réalisé" stroke="#1e3a5f" strokeWidth={2} />
                      <Line
                        type="monotone"
                        dataKey="Prévision"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-slate-500">Budget annuel</p>
                      <p className="text-lg font-semibold">{euro(detail.budgeted)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Projection fin d&apos;exercice</p>
                      <p className="text-lg font-semibold">{euro(detail.projected)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Écart projeté</p>
                      <p className="text-lg font-semibold">
                        <VarianceValue
                          value={detail.projectedVariance.variance}
                          isFavorable={detail.projectedVariance.isFavorable}
                        />
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-slate-500">
                  Créez un budget pour générer une projection.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <BudgetForm
          open={showForm}
          budget={selectedBudget}
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['budgets', user?.active_company_id] });
          }}
        />

        <ThresholdSettingsDialog open={showThresholds} onClose={() => setShowThresholds(false)} />

        <AlertDialog open={!!budgetToDelete} onOpenChange={() => setBudgetToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce budget ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le budget « {budgetToDelete?.name} » et sa ventilation mensuelle seront supprimés.
                Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}
