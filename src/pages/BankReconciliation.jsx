import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { format, parseISO } from 'date-fns';
import AmountDisplay from '@/components/common/AmountDisplay';
import BankStatementImport from '@/components/bank/BankStatementImport';
import ReconciliationMatcher from '@/components/bank/ReconciliationMatcher';

export default function BankReconciliation() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('transactions');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReconciledOnly, setShowReconciledOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['bankTransactions', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('*')
        .eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const handleAutoReconcile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Session expirée, veuillez vous reconnecter');
        return;
      }

      const response = await fetch('/api/auto-reconcile-bank-transactions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ company_id: user.active_company_id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Rapprochement impossible');

      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      toast.success(result.message);
    } catch (error) {
      toastSupabaseError(error, "Le rapprochement automatique a échoué.");
    }
  };

  const handleUnreconcile = async (transaction) => {
    try {
      const { error } = await supabase
        .from('bank_transactions')
        .update({
          is_reconciled: false,
          reconciled_entry_id: null,
          reconciliation_date: null,
          reconciliation_mode: null,
          reconciliation_score: null
        })
        .eq('id', transaction.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      toast.success('Rapprochement annulé');
    } catch (error) {
      toastSupabaseError(error, "Le rapprochement n'a pas pu être annulé.");
    }
  };

  const filteredTransactions = transactions.filter(t => {    const matchSearch = !searchTerm || 
      t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchReconciled = !showReconciledOnly || t.is_reconciled;
    return matchSearch && matchReconciled;
  });

  const stats = {
    total: transactions.length,
    reconciled: transactions.filter(t => t.is_reconciled).length,
    unreconciled: transactions.filter(t => !t.is_reconciled).length,
    reconciledBalance: transactions
      .filter(t => t.is_reconciled)
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
    totalBalance: transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  };

  if (!user?.active_company_id) {
    return <div>Sélectionnez une société</div>;
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader
          title="Rapprochement bancaire"
          subtitle="Importez vos relevés et rapprochez-les avec vos écritures comptables"
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-500 mb-1">Total transactions</div>
              <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-500 mb-1">Rapprochées</div>
              <div className="text-2xl font-bold text-emerald-600">{stats.reconciled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-500 mb-1">Non rapprochées</div>
              <div className="text-2xl font-bold text-orange-600">{stats.unreconciled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-500 mb-1">Solde rapproché</div>
              <AmountDisplay amount={stats.reconciledBalance} size="lg" showSign />
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="transactions">Transactions bancaires</TabsTrigger>
            <TabsTrigger value="reconciliation">Rapprochement</TabsTrigger>
            <TabsTrigger value="import">Importer relevé</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowReconciledOnly(!showReconciledOnly)}
                className={showReconciledOnly ? 'bg-slate-100' : ''}
              >
                <Filter className="h-4 w-4 mr-2" />
                {showReconciledOnly ? 'Toutes' : 'Rapprochées'}
              </Button>
              <Button onClick={handleAutoReconcile} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Rapprochement auto
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Date</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Description</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Référence</th>
                        <th className="text-right p-3 text-sm font-semibold text-slate-600">Montant</th>
                        <th className="text-center p-3 text-sm font-semibold text-slate-600">Statut</th>
                        <th className="text-right p-3 text-sm font-semibold text-slate-600" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 text-sm text-slate-600">
                            {format(parseISO(transaction.transaction_date), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-3 text-sm text-slate-800">{transaction.description}</td>
                          <td className="p-3 text-sm text-slate-500">{transaction.reference || '-'}</td>
                          <td className="p-3 text-right">
                            <AmountDisplay 
                              amount={transaction.amount} 
                              showSign 
                              className="font-medium"
                            />
                          </td>
                          <td className="p-3 text-center">
                            {transaction.is_reconciled ? (
                              <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Rapproché
                                {transaction.reconciliation_mode === 'auto' && ' (auto)'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 gap-1">
                                <XCircle className="h-3 w-3" />
                                Non rapproché
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {transaction.is_reconciled && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnreconcile(transaction)}
                              >
                                Annuler
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation">
            <ReconciliationMatcher
              transactions={transactions.filter(t => !t.is_reconciled)}
              entries={entries.filter(e => 
                e.journal === 'BQ' && !transactions.some(t => t.reconciled_entry_id === e.id)
              )}
            />
          </TabsContent>

          <TabsContent value="import">
            <BankStatementImport />
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}