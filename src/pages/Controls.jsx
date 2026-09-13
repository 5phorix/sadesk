import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FileWarning, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAccountingEntries, useAccounts, useBankTransactions, useInvoices, useStocks } from '@/components/hooks/useCompanyData';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import AmountDisplay from '@/components/common/AmountDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { detectAccountingAnomalies } from '@/lib/accounting';
import { createPageUrl } from '@/utils';

function ControlMetric({ label, value, detail, icon: Icon, tone, to }) {
  return (
    <Link to={to} className="block">
      <Card className="h-full border-slate-200 transition-shadow hover:shadow-md">
        <CardContent className="flex items-start justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
            <p className="mt-2 text-xs text-slate-500">{detail}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 text-slate-600">
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Controls() {
  const { data: entries = [], isLoading: entriesLoading } = useAccountingEntries();
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts();
  const { data: bankTransactions = [], isLoading: bankLoading } = useBankTransactions();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: stocks = [], isLoading: stocksLoading } = useStocks();

  const controlData = useMemo(() => {
    const today = new Date();
    const anomalies = detectAccountingAnomalies(entries, {
      knownAccountCodes: accounts.map((account) => account.code)
    });
    const overdueInvoices = invoices.filter((invoice) => {
      const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
      const status = String(invoice.status || '').toLowerCase();
      return invoice.type === 'client' && dueDate && dueDate < today && !['payée', 'payee', 'annulée', 'annulee'].includes(status);
    });
    const overdueAmount = overdueInvoices.reduce((total, invoice) => total + Number(invoice.amount_ttc || 0), 0);
    const unvalidatedEntries = entries.filter((entry) => !entry.is_validated);
    const incompleteInvoices = invoices.filter((invoice) => !invoice.third_party_name || !invoice.amount_ttc || !invoice.date);
    const unreconciledTransactions = bankTransactions.filter((transaction) => !transaction.is_reconciled);
    const unreconciledAmount = unreconciledTransactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    const lowStockItems = stocks.filter((stock) => {
      const minimumQuantity = Number(stock.min_quantity || 0);
      return minimumQuantity > 0 && Number(stock.quantity || 0) <= minimumQuantity;
    });
    const lowStockValue = lowStockItems.reduce((total, stock) => total + (Number(stock.quantity || 0) * Number(stock.unit_price || 0)), 0);

    return { anomalies, overdueInvoices, overdueAmount, unvalidatedEntries, incompleteInvoices, unreconciledTransactions, unreconciledAmount, lowStockItems, lowStockValue };
  }, [accounts, bankTransactions, entries, invoices, stocks]);

  const isLoading = entriesLoading || accountsLoading || bankLoading || invoicesLoading || stocksLoading;
  const severityLabel = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' };
  const severityStyle = { high: 'border-red-200 bg-red-50 text-red-800', medium: 'border-amber-200 bg-amber-50 text-amber-800', low: 'border-slate-200 bg-slate-50 text-slate-700' };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader
          title="Contrôles"
          subtitle="Les points qui nécessitent une vérification avant de poursuivre."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ControlMetric label="Anomalies comptables" value={controlData.anomalies.length} detail="Doublons, comptes inconnus ou montants inhabituels" icon={AlertTriangle} tone="text-red-600" to={createPageUrl('ImportExport')} />
          <ControlMetric label="Écritures à valider" value={controlData.unvalidatedEntries.length} detail="Brouillons à contrôler avant validation" icon={Clock3} tone="text-amber-600" to={createPageUrl('Entries')} />
          <ControlMetric label="Créances en retard" value={controlData.overdueInvoices.length} detail={<AmountDisplay amount={controlData.overdueAmount} size="sm" />} icon={AlertTriangle} tone="text-orange-600" to={createPageUrl('Receivables')} />
          <ControlMetric label="Pièces incomplètes" value={controlData.incompleteInvoices.length} detail="Factures sans tiers, date ou montant TTC" icon={FileWarning} tone="text-slate-700" to={createPageUrl('Invoices')} />
          <ControlMetric label="Transactions non rapprochées" value={controlData.unreconciledTransactions.length} detail={<AmountDisplay amount={controlData.unreconciledAmount} size="sm" showSign />} icon={Clock3} tone="text-orange-600" to={createPageUrl('BankReconciliation')} />
          <ControlMetric label="Stocks sous seuil" value={controlData.lowStockItems.length} detail={<AmountDisplay amount={controlData.lowStockValue} size="sm" />} icon={FileWarning} tone="text-red-600" to={createPageUrl('StockManagement')} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
          <Card>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Anomalies à examiner
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-6 text-sm text-slate-500">Chargement des contrôles...</p>
              ) : controlData.anomalies.length === 0 ? (
                <div className="flex items-center gap-3 p-6 text-sm text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Aucun signal comptable détecté.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {controlData.anomalies.slice(0, 8).map((anomaly, index) => (
                    <Link key={`${anomaly.type}-${index}`} to={createPageUrl('ImportExport')} className="flex items-start gap-3 p-4 transition-colors hover:bg-slate-50">
                      <Badge variant="outline" className={severityStyle[anomaly.severity] || severityStyle.low}>{severityLabel[anomaly.severity] || 'À vérifier'}</Badge>
                      <span className="min-w-0 flex-1 text-sm text-slate-700">{anomaly.message}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                État du contrôle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Dernière lecture</span><span className="font-medium text-slate-800">{format(new Date(), 'd MMM yyyy', { locale: fr })}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Écritures analysées</span><span className="font-medium text-slate-800">{entries.length}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Factures analysées</span><span className="font-medium text-slate-800">{invoices.length}</span></div>
              <Button asChild variant="outline" className="mt-2 w-full gap-2"><Link to={createPageUrl('ImportExport')}>Ouvrir les contrôles détaillés <ArrowUpRight className="h-4 w-4" /></Link></Button>
            </CardContent>
          </Card>
        </div>

        {controlData.overdueInvoices.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Créances à relancer</CardTitle></CardHeader>
            <CardContent className="divide-y divide-slate-100 p-0">
              {controlData.overdueInvoices.slice(0, 5).map((invoice) => (
                <Link key={invoice.id} to={createPageUrl('Receivables')} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{invoice.invoice_number || 'Facture sans numéro'}</p><p className="text-xs text-slate-500">Échéance : {format(new Date(invoice.due_date), 'dd/MM/yyyy')}</p></div>
                  <AmountDisplay amount={invoice.amount_ttc} size="sm" className="font-semibold text-slate-800" />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}
