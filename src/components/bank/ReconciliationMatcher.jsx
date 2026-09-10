import React, { useMemo, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { format, parseISO } from 'date-fns';
import AmountDisplay from '@/components/common/AmountDisplay';
import { bestMatch, reconciliationScore } from '@/lib/accounting';

const scoreTone = (score) => {
  if (score >= 90) return 'bg-emerald-100 text-emerald-800';
  if (score >= 75) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};

export default function ReconciliationMatcher({ transactions, entries }) {
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const queryClient = useQueryClient();

  const analysis = useMemo(() => {
    if (!selectedTransaction) return { candidates: [], ambiguous: false };
    return bestMatch(selectedTransaction, entries, { minScore: 60 });
  }, [selectedTransaction, entries]);

  const otherEntries = useMemo(() => {
    if (!selectedTransaction) return [];
    const suggested = new Set(analysis.candidates.map((candidate) => candidate.entry.id));
    return entries
      .filter((entry) => !suggested.has(entry.id))
      .map((entry) => ({ entry, score: reconciliationScore(selectedTransaction, entry) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [selectedTransaction, entries, analysis]);

  const handleSelectTransaction = (transaction) => {
    setSelectedTransaction(transaction);
    setSelectedEntry(null);
  };

  const handleReconcile = async () => {
    if (!selectedTransaction || !selectedEntry) {
      toast.error('Sélectionnez une transaction et une écriture');
      return;
    }

    try {
      const { error } = await supabase
        .from('bank_transactions')
        .update({
          is_reconciled: true,
          reconciled_entry_id: selectedEntry.id,
          reconciliation_date: format(new Date(), 'yyyy-MM-dd'),
          reconciliation_mode: 'manual',
          reconciliation_score: reconciliationScore(selectedTransaction, selectedEntry),
        })
        .eq('id', selectedTransaction.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      toast.success('Rapprochement effectué');

      setSelectedTransaction(null);
      setSelectedEntry(null);
    } catch (error) {
      toastSupabaseError(error, "Le rapprochement n'a pas pu être enregistré.");
    }
  };

  const renderEntry = ({ entry, score }) => (
    <button
      key={entry.id}
      onClick={() => setSelectedEntry(entry)}
      className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
        selectedEntry?.id === entry.id
          ? 'border-[#1e3a5f] bg-slate-50'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">{entry.label}</p>
          <p className="text-xs text-slate-500">
            {format(parseISO(entry.date), 'dd/MM/yyyy')} • {entry.account_code}
            {entry.entry_number ? ` • ${entry.entry_number}` : ''}
          </p>
        </div>
        <div className="text-right">
          <AmountDisplay amount={Number(entry.debit) || Number(entry.credit)} className="text-sm" />
          {score > 0 && (
            <Badge className={`mt-1 block ${scoreTone(score)}`}>{Math.round(score)} %</Badge>
          )}
        </div>
      </div>
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Transactions bancaires</span>
            <Badge variant="outline">{transactions.length} non rapprochées</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] space-y-2 overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
                <p className="text-sm text-slate-500">Toutes les transactions sont rapprochées</p>
              </div>
            ) : (
              transactions.map((transaction) => (
                <button
                  key={transaction.id}
                  onClick={() => handleSelectTransaction(transaction)}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                    selectedTransaction?.id === transaction.id
                      ? 'border-[#1e3a5f] bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">{transaction.description}</p>
                      <p className="text-xs text-slate-500">
                        {format(parseISO(transaction.transaction_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <AmountDisplay amount={transaction.amount} showSign className="font-semibold" />
                  </div>
                  {transaction.reference && (
                    <p className="text-xs text-slate-400">Réf : {transaction.reference}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Écritures comptables</span>
            {analysis.candidates.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700">
                {analysis.candidates.length} candidat(s)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedTransaction ? (
            <div className="py-12 text-center">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-slate-300" />
              <p className="text-sm text-slate-500">
                Sélectionnez une transaction pour voir les correspondances
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {analysis.ambiguous && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Plusieurs écritures correspondent aussi bien. Choisissez manuellement pour
                    éviter un rapprochement erroné.
                  </p>
                </div>
              )}

              {analysis.candidates.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="mb-2 text-sm font-medium text-emerald-800">
                    Correspondances suggérées
                  </p>
                  <div className="space-y-2">{analysis.candidates.map(renderEntry)}</div>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <p className="mb-2 text-sm font-medium text-slate-600">Autres écritures</p>
                <div className="max-h-[400px] space-y-2 overflow-y-auto">
                  {otherEntries.map(renderEntry)}
                </div>
              </div>

              <Button
                className="w-full bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                disabled={!selectedEntry}
                onClick={handleReconcile}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Rapprocher
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
