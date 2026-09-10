import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import AmountDisplay from '@/components/common/AmountDisplay';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { isLetterableAccount, letteringGroups, round2, suggestLettering } from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { Link2, Link2Off, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const euro = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

export default function Lettering() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);

  const companyId = user?.active_company_id;

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['lettering-entries', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('id, date, entry_number, journal, account_code, account_label, label, debit, credit, lettering, lettered_at, third_party_name')
        .eq('company_id', companyId)
        .or('account_code.like.40%,account_code.like.41%,account_code.like.42%')
        .order('date', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const accounts = useMemo(() => {
    const codes = new Map();
    entries.forEach((entry) => {
      if (!isLetterableAccount(entry.account_code)) return;
      if (!codes.has(entry.account_code)) {
        codes.set(entry.account_code, entry.account_label || entry.account_code);
      }
    });
    return Array.from(codes.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const scoped = useMemo(
    () =>
      selectedAccount === 'all'
        ? entries
        : entries.filter((entry) => entry.account_code === selectedAccount),
    [entries, selectedAccount]
  );

  const open = useMemo(() => scoped.filter((entry) => !entry.lettering), [scoped]);
  const groups = useMemo(() => letteringGroups(scoped), [scoped]);
  const suggestions = useMemo(() => suggestLettering(open), [open]);

  const selection = useMemo(
    () => open.filter((entry) => selectedIds.includes(entry.id)),
    [open, selectedIds]
  );

  const selectionBalance = useMemo(() => {
    const debit = round2(selection.reduce((total, entry) => total + Number(entry.debit || 0), 0));
    const credit = round2(selection.reduce((total, entry) => total + Number(entry.credit || 0), 0));
    const accountCodes = new Set(selection.map((entry) => entry.account_code));
    return {
      debit,
      credit,
      difference: round2(debit - credit),
      isBalanced: selection.length >= 2 && Math.abs(debit - credit) < 0.01,
      singleAccount: accountCodes.size <= 1,
    };
  }, [selection]);

  const canLetter = selectionBalance.isBalanced && selectionBalance.singleAccount;

  const toggle = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lettering-entries', companyId] });
    queryClient.invalidateQueries({ queryKey: ['entries'] });
  };

  const letterIds = async (ids) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('letter_entries', {
        target_company_id: companyId,
        target_entry_ids: ids,
      });
      if (error) throw error;
      toast.success(`Lettrage ${data} appliqué`);
      setSelectedIds([]);
      refresh();
    } catch (error) {
      toastSupabaseError(error, "Le lettrage n'a pas pu être appliqué.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnletter = async (code) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('unletter_entries', {
        target_company_id: companyId,
        target_code: code,
      });
      if (error) throw error;
      toast.success(`${data} écriture(s) délettrée(s)`);
      refresh();
    } catch (error) {
      toastSupabaseError(error, "Le délettrage n'a pas pu être effectué.");
    } finally {
      setBusy(false);
    }
  };

  const handleApplyAllSuggestions = async () => {
    for (const suggestion of suggestions) {
      // Séquentiel : chaque lettrage consomme un code et doit être confirmé en base.
      await letterIds(suggestion.entries.map((entry) => entry.id));
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <PageHeader
          title="Lettrage"
          subtitle="Rapprochez factures et règlements sur les comptes de tiers"
          actions={
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Tous les comptes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les comptes de tiers</SelectItem>
                {accounts.map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {code} — {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">
              <Link2 className="mr-2 h-4 w-4" />
              À lettrer ({open.length})
            </TabsTrigger>
            <TabsTrigger value="suggestions">
              <Sparkles className="mr-2 h-4 w-4" />
              Suggestions ({suggestions.length})
            </TabsTrigger>
            <TabsTrigger value="lettered">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Lettrées ({groups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4 space-y-4">
            {selection.length > 0 && (
              <Card className={canLetter ? 'border-emerald-300' : 'border-amber-300'}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">
                      {selection.length} écriture(s) sélectionnée(s)
                    </p>
                    <p className="text-slate-600">
                      Débit {euro(selectionBalance.debit)} · Crédit {euro(selectionBalance.credit)} ·
                      Écart{' '}
                      <span
                        className={selectionBalance.isBalanced ? 'text-emerald-600' : 'text-amber-600'}
                      >
                        {euro(selectionBalance.difference)}
                      </span>
                    </p>
                    {!selectionBalance.singleAccount && (
                      <p className="mt-1 text-amber-700">
                        Le lettrage doit porter sur un seul compte.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedIds([])}>
                      Annuler
                    </Button>
                    <Button
                      className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                      disabled={!canLetter || busy}
                      onClick={() => letterIds(selectedIds)}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Lettrer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="overflow-x-auto pt-6">
                {isLoading ? (
                  <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>
                ) : open.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Aucune écriture à lettrer sur ce périmètre.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="w-10 py-2" />
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium">Pièce</th>
                        <th className="py-2 font-medium">Compte</th>
                        <th className="py-2 font-medium">Libellé</th>
                        <th className="py-2 text-right font-medium">Débit</th>
                        <th className="py-2 text-right font-medium">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {open.map((entry) => (
                        <tr key={entry.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2">
                            <Checkbox
                              checked={selectedIds.includes(entry.id)}
                              onCheckedChange={() => toggle(entry.id)}
                            />
                          </td>
                          <td className="py-2">{format(parseISO(entry.date), 'dd/MM/yyyy')}</td>
                          <td className="py-2">{entry.entry_number || '—'}</td>
                          <td className="py-2">{entry.account_code}</td>
                          <td className="py-2">{entry.label}</td>
                          <td className="py-2 text-right">
                            {Number(entry.debit) > 0 ? <AmountDisplay amount={entry.debit} /> : '—'}
                          </td>
                          <td className="py-2 text-right">
                            {Number(entry.credit) > 0 ? <AmountDisplay amount={entry.credit} /> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions" className="mt-4 space-y-4">
            {suggestions.length > 0 && (
              <div className="flex justify-end">
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                  disabled={busy}
                  onClick={handleApplyAllSuggestions}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Tout lettrer ({suggestions.length})
                </Button>
              </div>
            )}

            {suggestions.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Aucun appariement évident détecté.
                </CardContent>
              </Card>
            ) : (
              suggestions.map((suggestion, index) => (
                <Card key={`${suggestion.accountCode}-${index}`}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                    <div className="text-sm">
                      <p className="font-medium text-slate-900">
                        {suggestion.accountCode} · {euro(suggestion.amount)}
                      </p>
                      {suggestion.entries.map((entry) => (
                        <p key={entry.id} className="text-slate-600">
                          {format(parseISO(entry.date), 'dd/MM/yyyy')} — {entry.label}
                        </p>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => letterIds(suggestion.entries.map((entry) => entry.id))}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Lettrer
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="lettered" className="mt-4 space-y-4">
            {groups.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Aucune écriture lettrée.
                </CardContent>
              </Card>
            ) : (
              groups.map((group) => (
                <Card key={group.code} className={group.isBalanced ? '' : 'border-red-300'}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Badge className="bg-blue-100 text-blue-800">{group.code}</Badge>
                      {group.accountCode}
                      {!group.isBalanced && (
                        <span className="flex items-center gap-1 text-sm font-normal text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                          Déséquilibré de {euro(group.balance)}
                        </span>
                      )}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleUnletter(group.code)}
                    >
                      <Link2Off className="mr-2 h-4 w-4" />
                      Délettrer
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <tbody>
                        {group.lines.map((line) => (
                          <tr key={line.id} className="border-b last:border-0">
                            <td className="py-1">{format(parseISO(line.date), 'dd/MM/yyyy')}</td>
                            <td className="py-1">{line.entry_number || '—'}</td>
                            <td className="py-1">{line.label}</td>
                            <td className="py-1 text-right">
                              {Number(line.debit) > 0 ? euro(line.debit) : ''}
                            </td>
                            <td className="py-1 text-right">
                              {Number(line.credit) > 0 ? euro(line.credit) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
