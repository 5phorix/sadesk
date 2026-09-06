import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays } from 'date-fns';
import AmountDisplay from '@/components/common/AmountDisplay';

export default function ReconciliationMatcher({ transactions, entries }) {
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const queryClient = useQueryClient();

  const handleTransactionSelect = (transaction) => {
    setSelectedTransaction(transaction);
    
    const matchingEntries = entries.filter(entry => {
      const entryAmount = Math.abs((entry.debit || 0) - (entry.credit || 0));
      const transactionAmount = Math.abs(transaction.amount);
      const amountMatch = Math.abs(entryAmount - transactionAmount) < 0.01;
      
      const dateDiff = Math.abs(
        differenceInDays(
          parseISO(transaction.transaction_date),
          parseISO(entry.date)
        )
      );
      
      return amountMatch && dateDiff <= 7;
    });

    setSuggestions(matchingEntries);
  };

  const handleReconcile = async () => {
    if (!selectedTransaction || !selectedEntry) {
      toast.error('Sélectionnez une transaction et une écriture');
      return;
    }

    try {
      const { error } = await supabase.from('bank_transactions').update({
        is_reconciled: true,
        reconciled_entry_id: selectedEntry.id,
        reconciliation_date: format(new Date(), 'yyyy-MM-dd')
      }).eq('id', selectedTransaction.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      toast.success('Rapprochement effectué');
      
      setSelectedTransaction(null);
      setSelectedEntry(null);
      setSuggestions([]);
    } catch (error) {
      toast.error('Erreur lors du rapprochement');
      console.error(error);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Transactions bancaires</span>
            <Badge variant="outline">{transactions.length} non rapprochées</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
                <p className="text-sm text-slate-500">
                  Toutes les transactions sont rapprochées
                </p>
              </div>
            ) : (
              transactions.map((transaction) => (
                <button
                  key={transaction.id}
                  onClick={() => handleTransactionSelect(transaction)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedTransaction?.id === transaction.id
                      ? 'border-[#1e3a5f] bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">{transaction.description}</p>
                      <p className="text-xs text-slate-500">
                        {format(parseISO(transaction.transaction_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <AmountDisplay 
                      amount={transaction.amount} 
                      showSign 
                      className="font-semibold"
                    />
                  </div>
                  {transaction.reference && (
                    <p className="text-xs text-slate-400">Réf: {transaction.reference}</p>
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
            {suggestions.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700">
                {suggestions.length} suggestion(s)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedTransaction ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="text-sm text-slate-500">
                Sélectionnez une transaction pour voir les suggestions
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-emerald-800 mb-2">
                    Suggestions automatiques
                  </p>
                  <div className="space-y-2">
                    {suggestions.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          selectedEntry?.id === entry.id
                            ? 'border-emerald-600 bg-white'
                            : 'border-emerald-200 bg-white hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{entry.label}</p>
                            <p className="text-xs text-slate-500">
                              {format(parseISO(entry.date), 'dd/MM/yyyy')} • {entry.account_code}
                            </p>
                          </div>
                          <div className="text-right">
                            {entry.debit > 0 && (
                              <AmountDisplay amount={entry.debit} className="text-sm" />
                            )}
                            {entry.credit > 0 && (
                              <AmountDisplay amount={entry.credit} className="text-sm" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-600 mb-2">
                  Toutes les écritures bancaires
                </p>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedEntry?.id === entry.id
                          ? 'border-[#1e3a5f] bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{entry.label}</p>
                          <p className="text-xs text-slate-500">
                            {format(parseISO(entry.date), 'dd/MM/yyyy')} • {entry.account_code}
                          </p>
                        </div>
                        <div className="text-right">
                          {entry.debit > 0 && (
                            <AmountDisplay amount={entry.debit} className="text-sm" />
                          )}
                          {entry.credit > 0 && (
                            <AmountDisplay amount={entry.credit} className="text-sm" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedTransaction && selectedEntry && (
                <Button
                  onClick={handleReconcile}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Rapprocher ces éléments
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}