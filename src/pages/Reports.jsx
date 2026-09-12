import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { generateText } from '@/api/aiClient';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Download, 
  Sparkles,
  BarChart3,
  DollarSign,
  BookOpen,
  Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';
import AmountDisplay from '@/components/common/AmountDisplay';

export default function Reports() {
  const { user } = useUser();
  const [selectedPeriod, setSelectedPeriod] = useState('current_year');
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [activeReport, setActiveReport] = useState('balance');

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id).eq('is_validated', true); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('invoices').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  const getPeriodDates = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case 'current_year':
        return { start: startOfYear(now), end: endOfYear(now) };
      case 'current_month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_year':
        const lastYear = new Date(now.getFullYear() - 1, 0, 1);
        return { start: startOfYear(lastYear), end: endOfYear(lastYear) };
      default:
        return { start: startOfYear(now), end: endOfYear(now) };
    }
  };

  const filterEntriesByPeriod = () => {
    const { start, end } = getPeriodDates();
    return entries.filter(e => {
      const entryDate = new Date(e.date);
      return entryDate >= start && entryDate <= end;
    });
  };

  // Calcul Balance Générale
  const calculateBalance = () => {
    const filtered = filterEntriesByPeriod();
    const accounts = {};

    filtered.forEach(entry => {
      if (!accounts[entry.account_code]) {
        accounts[entry.account_code] = {
          code: entry.account_code,
          label: entry.account_label,
          debit: 0,
          credit: 0
        };
      }
      accounts[entry.account_code].debit += parseFloat(entry.debit) || 0;
      accounts[entry.account_code].credit += parseFloat(entry.credit) || 0;
    });

    return Object.values(accounts).map(acc => ({
      ...acc,
      balance: acc.debit - acc.credit
    })).sort((a, b) => a.code.localeCompare(b.code));
  };

  // Calcul Compte de Résultat
  const calculateProfitLoss = () => {
    const filtered = filterEntriesByPeriod();
    const charges = filtered.filter(e => e.account_code?.startsWith('6'))
      .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0);
    
    const produits = filtered.filter(e => e.account_code?.startsWith('7'))
      .reduce((sum, e) => sum + (parseFloat(e.credit) || 0) - (parseFloat(e.debit) || 0), 0);

    return {
      charges: Math.abs(charges),
      produits,
      resultat: produits - Math.abs(charges)
    };
  };

  // Calcul Bilan
  const calculateBalanceSheet = () => {
    const filtered = filterEntriesByPeriod();
    
    const actif = {
      immobilisations: filtered.filter(e => e.account_code?.startsWith('2'))
        .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0),
      stocks: filtered.filter(e => e.account_code?.startsWith('3'))
        .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0),
      creances: filtered.filter(e => e.account_code?.startsWith('4') && parseFloat(e.account_code) < 45)
        .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0),
      tresorerie: filtered.filter(e => e.account_code?.startsWith('5'))
        .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0)
    };

    const passif = {
      capitaux: filtered.filter(e => e.account_code?.startsWith('1'))
        .reduce((sum, e) => sum + (parseFloat(e.credit) || 0) - (parseFloat(e.debit) || 0), 0),
      dettes: filtered.filter(e => e.account_code?.startsWith('4') && parseFloat(e.account_code) >= 45)
        .reduce((sum, e) => sum + (parseFloat(e.credit) || 0) - (parseFloat(e.debit) || 0), 0)
    };

    return {
      actif: {
        ...actif,
        total: Object.values(actif).reduce((sum, v) => sum + v, 0)
      },
      passif: {
        ...passif,
        total: Object.values(passif).reduce((sum, v) => sum + v, 0)
      }
    };
  };

  // Calcul Flux de Trésorerie
  const calculateCashFlow = () => {
    const filtered = filterEntriesByPeriod();
    
    const operations = filtered.filter(e => 
      e.account_code?.startsWith('7') || e.account_code?.startsWith('6')
    ).reduce((sum, e) => 
      sum + (parseFloat(e.credit) || 0) - (parseFloat(e.debit) || 0), 0
    );

    const investissements = filtered.filter(e => e.account_code?.startsWith('2'))
      .reduce((sum, e) => sum + (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0), 0);

    const financement = filtered.filter(e => e.account_code?.startsWith('1') || e.account_code?.startsWith('16'))
      .reduce((sum, e) => sum + (parseFloat(e.credit) || 0) - (parseFloat(e.debit) || 0), 0);

    return {
      operations,
      investissements: -Math.abs(investissements),
      financement,
      total: operations - Math.abs(investissements) + financement
    };
  };

  // Grand Livre
  const generateLedger = () => {
    const filtered = filterEntriesByPeriod();
    const ledger = {};

    filtered.forEach(entry => {
      if (!ledger[entry.account_code]) {
        ledger[entry.account_code] = {
          code: entry.account_code,
          label: entry.account_label,
          entries: []
        };
      }
      ledger[entry.account_code].entries.push(entry);
    });

    return Object.values(ledger).sort((a, b) => a.code.localeCompare(b.code));
  };

  // Analyse IA
  const handleAIAnalysis = async () => {
    if (!user?.active_company_id) {
      toast.error('Veuillez sélectionner une société avant de lancer l\'analyse');
      return;
    }

    setAiAnalysisLoading(true);
    try {
      const profitLoss = calculateProfitLoss();
      const balanceSheet = calculateBalanceSheet();
      const cashFlow = calculateCashFlow();

      const prompt = `Tu es un expert comptable. Analyse ces données financières et fournis des insights actionnables:

Compte de Résultat (${selectedPeriod}):
- Produits: ${profitLoss.produits.toFixed(2)}€
- Charges: ${profitLoss.charges.toFixed(2)}€
- Résultat: ${profitLoss.resultat.toFixed(2)}€

Bilan:
- Total Actif: ${balanceSheet.actif.total.toFixed(2)}€
- Total Passif: ${balanceSheet.passif.total.toFixed(2)}€
- Trésorerie: ${balanceSheet.actif.tresorerie.toFixed(2)}€
- Créances: ${balanceSheet.actif.creances.toFixed(2)}€
- Dettes: ${balanceSheet.passif.dettes.toFixed(2)}€

Flux de Trésorerie:
- Opérations: ${cashFlow.operations.toFixed(2)}€
- Investissements: ${cashFlow.investissements.toFixed(2)}€
- Financement: ${cashFlow.financement.toFixed(2)}€

Fournis:
1. Une analyse de la santé financière (2-3 phrases)
2. 3 points forts
3. 3 points d'amélioration
4. 2 recommandations prioritaires

Format: Markdown avec structure claire.`;

      const response = await generateText({
        companyId: user.active_company_id,
        prompt
      });

      setAiInsight(response);
      toast.success('Analyse IA terminée');
    } catch (error) {
      toastSupabaseError(error, "L'analyse IA n'a pas pu être réalisée.");
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  const balance = calculateBalance();
  const profitLoss = calculateProfitLoss();
  const balanceSheet = calculateBalanceSheet();
  const cashFlow = calculateCashFlow();
  const ledger = generateLedger();

  const reports = [
    {
      id: 'balance',
      name: 'Balance Générale',
      icon: Scale,
      description: 'Vue d\'ensemble des soldes de tous les comptes'
    },
    {
      id: 'profit_loss',
      name: 'Compte de Résultat',
      icon: TrendingUp,
      description: 'Produits et charges de la période'
    },
    {
      id: 'balance_sheet',
      name: 'Bilan',
      icon: BarChart3,
      description: 'Actif et passif à la date de clôture'
    },
    {
      id: 'cash_flow',
      name: 'Flux de Trésorerie',
      icon: DollarSign,
      description: 'Mouvements de trésorerie par catégorie'
    },
    {
      id: 'ledger',
      name: 'Grand Livre',
      icon: BookOpen,
      description: 'Détail des écritures par compte'
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapports Financiers"
        subtitle="Générez et analysez vos rapports comptables"
        actions={
          <div className="flex items-center gap-3">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Mois en cours</SelectItem>
                <SelectItem value="current_year">Année en cours</SelectItem>
                <SelectItem value="last_year">Année dernière</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleAIAnalysis}
              disabled={aiAnalysisLoading}
              className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600"
            >
              <Sparkles className="h-4 w-4" />
              {aiAnalysisLoading ? 'Analyse...' : 'Analyse IA'}
            </Button>
          </div>
        }
      />

      {/* Analyse IA */}
      {aiInsight && (
        <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Analyse IA de votre situation financière
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-slate-700">{aiInsight}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sélection des rapports */}
      <div className="grid md:grid-cols-5 gap-4">
        {reports.map(report => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                activeReport === report.id
                  ? 'border-2 border-[#1e3a5f] bg-slate-50'
                  : 'hover:border-slate-300'
              }`}
              onClick={() => setActiveReport(report.id)}
            >
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center gap-3">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                    activeReport === report.id
                      ? 'bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f]'
                      : 'bg-slate-100'
                  }`}>
                    <Icon className={`h-6 w-6 ${
                      activeReport === report.id ? 'text-white' : 'text-slate-600'
                    }`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{report.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{report.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Contenu des rapports */}
      {activeReport === 'balance' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Balance Générale</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-slate-600">Compte</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-slate-600">Libellé</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-slate-600">Débit</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-slate-600">Crédit</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-slate-600">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {balance.map(acc => (
                    <tr key={acc.code} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-2 text-sm font-medium">{acc.code}</td>
                      <td className="py-2 px-2 text-sm">{acc.label}</td>
                      <td className="py-2 px-2 text-sm text-right">
                        <AmountDisplay amount={acc.debit} size="sm" />
                      </td>
                      <td className="py-2 px-2 text-sm text-right">
                        <AmountDisplay amount={acc.credit} size="sm" />
                      </td>
                      <td className="py-2 px-2 text-sm text-right font-semibold">
                        <AmountDisplay amount={acc.balance} size="sm" showSign />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={2} className="py-3 px-2 text-sm">TOTAL</td>
                    <td className="py-3 px-2 text-sm text-right">
                      <AmountDisplay amount={balance.reduce((sum, acc) => sum + acc.debit, 0)} size="sm" />
                    </td>
                    <td className="py-3 px-2 text-sm text-right">
                      <AmountDisplay amount={balance.reduce((sum, acc) => sum + acc.credit, 0)} size="sm" />
                    </td>
                    <td className="py-3 px-2 text-sm text-right">
                      <AmountDisplay amount={balance.reduce((sum, acc) => sum + acc.balance, 0)} size="sm" showSign />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'profit_loss' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Compte de Résultat</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-red-600 mb-4 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-600" />
                  Charges
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Total des charges</span>
                    <AmountDisplay amount={profitLoss.charges} size="sm" className="font-semibold text-red-600" />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-green-600 mb-4 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-600" />
                  Produits
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Total des produits</span>
                    <AmountDisplay amount={profitLoss.produits} size="sm" className="font-semibold text-green-600" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t-2 bg-slate-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-slate-900">Résultat Net</span>
                <AmountDisplay 
                  amount={profitLoss.resultat} 
                  size="lg" 
                  showSign 
                  className="text-2xl font-bold"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'balance_sheet' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Bilan</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-blue-600 mb-4 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-600" />
                  ACTIF
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Immobilisations</span>
                    <AmountDisplay amount={balanceSheet.actif.immobilisations} size="sm" />
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Stocks</span>
                    <AmountDisplay amount={balanceSheet.actif.stocks} size="sm" />
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Créances</span>
                    <AmountDisplay amount={balanceSheet.actif.creances} size="sm" />
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Trésorerie</span>
                    <AmountDisplay amount={balanceSheet.actif.tresorerie} size="sm" />
                  </div>
                  <div className="flex justify-between py-3 bg-blue-50 rounded px-2 mt-4">
                    <span className="font-bold">Total Actif</span>
                    <AmountDisplay amount={balanceSheet.actif.total} size="sm" className="font-bold" />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-purple-600 mb-4 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-600" />
                  PASSIF
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Capitaux propres</span>
                    <AmountDisplay amount={balanceSheet.passif.capitaux} size="sm" />
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-slate-600">Dettes</span>
                    <AmountDisplay amount={balanceSheet.passif.dettes} size="sm" />
                  </div>
                  <div className="flex justify-between py-3 bg-purple-50 rounded px-2 mt-4">
                    <span className="font-bold">Total Passif</span>
                    <AmountDisplay amount={balanceSheet.passif.total} size="sm" className="font-bold" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'cash_flow' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Tableau des Flux de Trésorerie</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b">
                <span className="text-slate-700">Flux liés aux opérations</span>
                <AmountDisplay amount={cashFlow.operations} size="sm" showSign />
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="text-slate-700">Flux liés aux investissements</span>
                <AmountDisplay amount={cashFlow.investissements} size="sm" showSign />
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="text-slate-700">Flux liés au financement</span>
                <AmountDisplay amount={cashFlow.financement} size="sm" showSign />
              </div>
              <div className="flex justify-between py-4 bg-slate-50 rounded-lg px-4 mt-6">
                <span className="text-lg font-bold">Variation nette de trésorerie</span>
                <AmountDisplay amount={cashFlow.total} size="lg" showSign className="font-bold text-xl" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'ledger' && (
        <div className="space-y-4">
          {ledger.map(account => (
            <Card key={account.code}>
              <CardHeader>
                <CardTitle className="text-base">
                  {account.code} - {account.label}
                  <Badge variant="secondary" className="ml-3">{account.entries.length} écriture(s)</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-slate-600">Date</th>
                        <th className="text-left py-2 px-2 text-slate-600">Journal</th>
                        <th className="text-left py-2 px-2 text-slate-600">Libellé</th>
                        <th className="text-right py-2 px-2 text-slate-600">Débit</th>
                        <th className="text-right py-2 px-2 text-slate-600">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.entries.map(entry => (
                        <tr key={entry.id} className="border-b hover:bg-slate-50">
                          <td className="py-2 px-2">{format(new Date(entry.date), 'dd/MM/yyyy')}</td>
                          <td className="py-2 px-2">{entry.journal}</td>
                          <td className="py-2 px-2">{entry.label}</td>
                          <td className="py-2 px-2 text-right">
                            {entry.debit > 0 && <AmountDisplay amount={entry.debit} size="sm" />}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {entry.credit > 0 && <AmountDisplay amount={entry.credit} size="sm" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}