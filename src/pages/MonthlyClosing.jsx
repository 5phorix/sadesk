import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import {
  useCloseMonth,
  useMonthlyClosings,
  useReopenMonth,
  useYearEntries,
} from '@/components/hooks/useManagement';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { toastSupabaseError } from '@/lib/supabase-errors';
import {
  MONTH_LABELS,
  computeIndicators,
  monthlyIndicatorSeries,
  nextClosableMonth,
} from '@/lib/management';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarCheck, Lock, LockOpen, Wallet, Scale, PiggyBank, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { buildOpeningEntries } from '@/lib/auxiliaryAccounting';

const euro = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

const percent = (value) => (value === null || value === undefined ? '—' : `${value.toFixed(1)} %`);

const days = (value) => (value === null || value === undefined ? '—' : `${Math.round(value)} j`);

const ADMIN_ROLES = ['owner', 'admin'];

function IndicatorCard({ icon: Icon, label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-slate-900',
    positive: 'text-emerald-600',
    negative: 'text-red-600',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <p className={`mt-2 text-2xl font-bold ${tones[tone]}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function MonthlyClosing() {
  const { user } = useUser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthToClose, setMonthToClose] = useState(null);
  const [closingToReopen, setClosingToReopen] = useState(null);
  const [notes, setNotes] = useState('');
  const [openingLoading, setOpeningLoading] = useState(false);

  const { data: entries = [], isLoading } = useYearEntries(year);
  const { data: closings = [] } = useMonthlyClosings();
  const closeMonth = useCloseMonth();
  const reopenMonth = useReopenMonth();
  const queryClient = useQueryClient();

  const canAdminister = ADMIN_ROLES.includes(user?.role);

  const indicators = useMemo(() => computeIndicators(entries, { year }), [entries, year]);
  const series = useMemo(() => monthlyIndicatorSeries(entries, year), [entries, year]);

  const yearClosings = useMemo(
    () => closings.filter((closing) => Number(closing.year) === year),
    [closings, year]
  );

  const closingByMonth = useMemo(
    () => new Map(yearClosings.map((closing) => [Number(closing.month), closing])),
    [yearClosings]
  );

  const suggestedMonth = useMemo(
    () => nextClosableMonth(closings, year),
    [closings, year]
  );

  const chartData = useMemo(
    () =>
      series.map((month) => ({
        mois: month.label,
        Produits: month.revenue,
        Charges: month.expenses,
        Résultat: month.result,
      })),
    [series]
  );

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => current - 2 + index);
  }, []);

  const handleClose = async () => {
    if (!monthToClose) return;
    try {
      const monthEntries = entries.filter(
        (entry) => new Date(entry.date).getMonth() + 1 === monthToClose
      );
      await closeMonth.mutateAsync({
        year,
        month: monthToClose,
        indicators: computeIndicators(monthEntries, { year }),
        notes: notes || null,
      });
      toast.success(`${MONTH_LABELS[monthToClose - 1]} ${year} clôturé`);
      setNotes('');
    } catch (error) {
      toastSupabaseError(error, "Le mois n'a pas pu être clôturé.");
    } finally {
      setMonthToClose(null);
    }
  };

  const handleReopen = async () => {
    if (!closingToReopen) return;
    try {
      await reopenMonth.mutateAsync({
        year: Number(closingToReopen.year),
        month: Number(closingToReopen.month),
        reason: notes || null,
      });
      toast.success(`${MONTH_LABELS[closingToReopen.month - 1]} ${closingToReopen.year} rouvert`);
      setNotes('');
    } catch (error) {
      toastSupabaseError(error, "Le mois n'a pas pu être rouvert.");
    } finally {
      setClosingToReopen(null);
    }
  };

  const handleGenerateOpening = async () => {
    const targetDate = `${year + 1}-01-01`;
    const entryNumber = `AN-${year + 1}`;
    setOpeningLoading(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from('accounting_entries')
        .select('id')
        .eq('company_id', user.active_company_id)
        .eq('entry_number', entryNumber)
        .limit(1);
      if (existingError) throw existingError;
      if (existing?.length) throw new Error(`Les à-nouveaux ${year + 1} existent déjà.`);

      const openingEntries = buildOpeningEntries(entries, targetDate, user.active_company_id);
      if (!openingEntries.length) throw new Error('Aucun solde de bilan à reprendre.');
      const { error } = await supabase.from('accounting_entries').insert(openingEntries);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['entries-year', user.active_company_id] });
      toast.success(`${openingEntries.length} ligne(s) d’à-nouveaux générée(s) en brouillon`);
    } catch (error) {
      toastSupabaseError(error, 'Les à-nouveaux n’ont pas pu être générés.');
    } finally {
      setOpeningLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <PageHeader
          title="Clôtures mensuelles"
          subtitle="Indicateurs de gestion et historique des périodes clôturées"
          actions={
            <>
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

              {suggestedMonth && (
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                  onClick={() => setMonthToClose(suggestedMonth)}
                >
                  <CalendarCheck className="mr-2 h-4 w-4" />
                  Clôturer {MONTH_LABELS[suggestedMonth - 1]}
                </Button>
              )}
              {canAdminister && (
                <Button variant="outline" onClick={handleGenerateOpening} disabled={openingLoading}>
                  {openingLoading ? 'Génération...' : `À-nouveaux ${year + 1}`}
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <IndicatorCard
            icon={PiggyBank}
            label="Résultat"
            value={euro(indicators.result)}
            hint={`Produits ${euro(indicators.revenue)}`}
            tone={indicators.result >= 0 ? 'positive' : 'negative'}
          />
          <IndicatorCard
            icon={Percent}
            label="Taux de marge"
            value={percent(indicators.marginRate)}
            hint={`Charges ${euro(indicators.expenses)}`}
          />
          <IndicatorCard
            icon={Scale}
            label="BFR"
            value={euro(indicators.bfr)}
            hint={`${days(indicators.bfrDays)} de chiffre d'affaires`}
            tone={indicators.bfr <= 0 ? 'positive' : 'default'}
          />
          <IndicatorCard
            icon={Wallet}
            label="Trésorerie"
            value={euro(indicators.cash)}
            hint={`Créances ${euro(indicators.receivables)} · Dettes ${euro(indicators.payables)}`}
            tone={indicators.cash >= 0 ? 'positive' : 'negative'}
          />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Évolution mensuelle {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mois" />
                <YAxis />
                <Tooltip formatter={(value) => euro(value)} />
                <Legend />
                <Area type="monotone" dataKey="Produits" stroke="#059669" fill="#05966920" />
                <Area type="monotone" dataKey="Charges" stroke="#dc2626" fill="#dc262620" />
                <Area type="monotone" dataKey="Résultat" stroke="#1e3a5f" fill="#1e3a5f20" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Historique des clôtures {year}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 font-medium">Mois</th>
                    <th className="py-2 font-medium">Statut</th>
                    <th className="py-2 text-right font-medium">Écritures</th>
                    <th className="py-2 text-right font-medium">Résultat figé</th>
                    <th className="py-2 text-right font-medium">Trésorerie figée</th>
                    <th className="py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTH_LABELS.map((label, index) => {
                    const month = index + 1;
                    const closing = closingByMonth.get(month);
                    const isClosed = closing?.status === 'closed';

                    return (
                      <tr key={label} className="border-b last:border-0">
                        <td className="py-2 font-medium text-slate-900">
                          {label} {year}
                        </td>
                        <td className="py-2">
                          {isClosed ? (
                            <Badge className="bg-slate-200 text-slate-800">
                              <Lock className="mr-1 h-3 w-3" />
                              Clôturé
                            </Badge>
                          ) : closing ? (
                            <Badge className="bg-amber-100 text-amber-800">Rouvert</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800">Ouvert</Badge>
                          )}
                        </td>
                        <td className="py-2 text-right">{closing?.entry_count ?? '—'}</td>
                        <td className="py-2 text-right">
                          {closing?.indicators?.result !== undefined
                            ? euro(closing.indicators.result)
                            : '—'}
                        </td>
                        <td className="py-2 text-right">
                          {closing?.indicators?.cash !== undefined
                            ? euro(closing.indicators.cash)
                            : '—'}
                        </td>
                        <td className="py-2 text-right">
                          {isClosed ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canAdminister}
                              title={
                                canAdminister
                                  ? undefined
                                  : 'Seuls les administrateurs peuvent rouvrir une période'
                              }
                              onClick={() => setClosingToReopen(closing)}
                            >
                              <LockOpen className="mr-1 h-3 w-3" />
                              Rouvrir
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setMonthToClose(month)}
                            >
                              <Lock className="mr-1 h-3 w-3" />
                              Clôturer
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!monthToClose} onOpenChange={() => setMonthToClose(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Clôturer {monthToClose ? MONTH_LABELS[monthToClose - 1] : ''} {year} ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Toutes les écritures du mois doivent être validées et équilibrées. Une fois clôturé,
                le mois est verrouillé : plus aucune écriture ne peut y être créée, modifiée ou
                supprimée.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Note de clôture (facultatif)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                onClick={handleClose}
              >
                Clôturer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!closingToReopen} onOpenChange={() => setClosingToReopen(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rouvrir cette période ?</AlertDialogTitle>
              <AlertDialogDescription>
                La réouverture autorise à nouveau les écritures sur le mois et sera tracée dans
                l&apos;historique. Les indicateurs figés restent consultables.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Motif de réouverture"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={handleReopen}>
                Rouvrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}
