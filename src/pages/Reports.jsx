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
import { cn } from '@/lib/utils';

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

  // Calcul Balance Générale (6 colonnes réglementaires)
  const calculateBalance = () => {
    const filtered = filterEntriesByPeriod();
    const accounts = {};

    filtered.forEach(entry => {
      if (!accounts[entry.account_code]) {
        accounts[entry.account_code] = {
          code: entry.account_code,
          label: entry.account_label || `Compte ${entry.account_code}`,
          debit: 0,
          credit: 0
        };
      }
      accounts[entry.account_code].debit += parseFloat(entry.debit) || 0;
      accounts[entry.account_code].credit += parseFloat(entry.credit) || 0;
    });

    return Object.values(accounts).map(acc => {
      const solde = acc.debit - acc.credit;
      return {
        ...acc,
        balance: solde,
        soldeDebiteur: solde > 0 ? solde : 0,
        soldeCrediteur: solde < 0 ? Math.abs(solde) : 0
      };
    }).sort((a, b) => a.code.localeCompare(b.code));
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

  // Grand Livre avec soldes progressifs et cumulés
  const generateLedger = () => {
    const filtered = filterEntriesByPeriod();
    const ledger = {};

    filtered.forEach(entry => {
      if (!ledger[entry.account_code]) {
        ledger[entry.account_code] = {
          code: entry.account_code,
          label: entry.account_label || `Compte ${entry.account_code}`,
          entries: [],
          totalDebit: 0,
          totalCredit: 0
        };
      }
      const d = parseFloat(entry.debit) || 0;
      const c = parseFloat(entry.credit) || 0;
      ledger[entry.account_code].entries.push(entry);
      ledger[entry.account_code].totalDebit += d;
      ledger[entry.account_code].totalCredit += c;
    });

    return Object.values(ledger)
      .map(acc => {
        let runningBalance = 0;
        const sortedEntries = [...acc.entries]
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map(e => {
            const d = parseFloat(e.debit) || 0;
            const c = parseFloat(e.credit) || 0;
            runningBalance += (d - c);
            return {
              ...e,
              debitNum: d,
              creditNum: c,
              runningBalance
            };
          });

        const soldeFinal = acc.totalDebit - acc.totalCredit;

        return {
          ...acc,
          entries: sortedEntries,
          soldeFinal,
          soldeDebiteur: soldeFinal > 0 ? soldeFinal : 0,
          soldeCrediteur: soldeFinal < 0 ? Math.abs(soldeFinal) : 0
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
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
      color: 'from-blue-600 to-indigo-700',
      activeBorder: 'border-blue-500 bg-blue-50/40',
      iconBg: 'bg-blue-100 text-blue-700',
      description: 'Vue d’ensemble des soldes Débiteur/Créditeur de tous les comptes'
    },
    {
      id: 'profit_loss',
      name: 'Compte de Résultat',
      icon: TrendingUp,
      color: 'from-teal-600 to-emerald-700',
      activeBorder: 'border-teal-500 bg-teal-50/40',
      iconBg: 'bg-teal-100 text-teal-700',
      description: 'Produits et charges de la période avec résultat net'
    },
    {
      id: 'balance_sheet',
      name: 'Bilan Synthétique',
      icon: BarChart3,
      color: 'from-purple-600 to-pink-700',
      activeBorder: 'border-purple-500 bg-purple-50/40',
      iconBg: 'bg-purple-100 text-purple-700',
      description: 'Actif et passif à la date de clôture de l’exercice'
    },
    {
      id: 'cash_flow',
      name: 'Flux de Trésorerie',
      icon: DollarSign,
      color: 'from-emerald-600 to-green-700',
      activeBorder: 'border-emerald-500 bg-emerald-50/40',
      iconBg: 'bg-emerald-100 text-emerald-700',
      description: 'Mouvements de trésorerie par catégorie d’activité'
    },
    {
      id: 'ledger',
      name: 'Grand Livre',
      icon: BookOpen,
      color: 'from-amber-600 to-orange-700',
      activeBorder: 'border-amber-500 bg-amber-50/40',
      iconBg: 'bg-amber-100 text-amber-700',
      description: 'Détail chronologique et solde progressif par compte'
    }
  ];

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Rapports Financiers & Documents"
        subtitle="Générez, analysez et exportez vos états comptables officiels"
        badge="Nomenclature normalisée"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-44 bg-white border-slate-200 rounded-xl text-xs h-10 font-medium">
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
              className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm hover:from-purple-700 hover:to-indigo-700 rounded-xl text-xs h-10 font-semibold"
            >
              <Sparkles className="h-4 w-4" />
              {aiAnalysisLoading ? 'Analyse en cours...' : 'Analyse IA Expert'}
            </Button>
          </div>
        }
      />

      {/* Analyse IA */}
      {aiInsight && (
        <Card className="rounded-3xl border-2 border-purple-200/90 bg-gradient-to-r from-purple-50/60 via-indigo-50/40 to-white shadow-xs overflow-hidden">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base font-bold text-purple-950">
              <div className="p-1.5 rounded-xl bg-purple-600 text-white shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              Analyse IA de votre situation financière
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="prose prose-sm max-w-none text-slate-700 bg-white/80 p-4 rounded-2xl border border-purple-100 shadow-2xs">
              <div className="whitespace-pre-wrap leading-relaxed">{aiInsight}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sélection des rapports en cartes modernes */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {reports.map(report => {
          const Icon = report.icon;
          const isSelected = activeReport === report.id;
          return (
            <div
              key={report.id}
              onClick={() => setActiveReport(report.id)}
              className={cn(
                "cursor-pointer rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between shadow-2xs hover:-translate-y-0.5",
                isSelected
                  ? cn("border-2 shadow-sm", report.activeBorder)
                  : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2.5 rounded-xl flex items-center justify-center transition-colors", isSelected ? cn("bg-gradient-to-br text-white shadow-sm", report.color) : report.iconBg)}>
                  <Icon className="h-4 w-4" />
                </div>
                {isSelected && (
                  <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 bg-white border-slate-300">
                    Actif
                  </Badge>
                )}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-xs sm:text-sm">{report.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-tight">{report.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contenu des rapports */}
      {activeReport === 'balance' && (
        <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Balance Générale des Comptes</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Présentation officielle normalisée (Mouvements et Soldes)</p>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Exporter CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-bold uppercase border-b border-slate-200">
                    <th className="py-3 px-4 w-28">N° Compte</th>
                    <th className="py-3 px-4">Intitulé du compte</th>
                    <th className="py-3 px-4 text-right w-36 bg-blue-50/40 text-blue-900">Total Débit</th>
                    <th className="py-3 px-4 text-right w-36 bg-blue-50/40 text-blue-900">Total Crédit</th>
                    <th className="py-3 px-4 text-right w-36 bg-slate-50 text-slate-900 font-bold">Solde Débiteur</th>
                    <th className="py-3 px-4 text-right w-36 bg-slate-50 text-slate-900 font-bold">Solde Créditeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {balance.map(acc => (
                    <tr key={acc.code} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200/80">
                          {acc.code}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{acc.label}</td>
                      <td className="py-2.5 px-4 text-right font-mono bg-blue-50/10 text-slate-800">
                        {acc.debit > 0 ? `${acc.debit.toFixed(2)} €` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono bg-blue-50/10 text-slate-800">
                        {acc.credit > 0 ? `${acc.credit.toFixed(2)} €` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                        {acc.soldeDebiteur > 0 ? `${acc.soldeDebiteur.toFixed(2)} €` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-purple-700">
                        {acc.soldeCrediteur > 0 ? `${acc.soldeCrediteur.toFixed(2)} €` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold text-xs">
                    <td colSpan={2} className="py-3 px-4">TOTAUX GÉNÉRAUX</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {balance.reduce((sum, acc) => sum + acc.debit, 0).toFixed(2)} €
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {balance.reduce((sum, acc) => sum + acc.credit, 0).toFixed(2)} €
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-300">
                      {balance.reduce((sum, acc) => sum + acc.soldeDebiteur, 0).toFixed(2)} €
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-purple-300">
                      {balance.reduce((sum, acc) => sum + acc.soldeCrediteur, 0).toFixed(2)} €
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'profit_loss' && (
        <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Compte de Résultat Synthétique</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Synthèse des charges et produits de la période sélectionnée</p>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Exporter CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <h3 className="font-bold text-rose-700 text-sm mb-3 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                  Charges d'Exploitation & Générales (Cl. 6)
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Total des charges décaissées</span>
                    <AmountDisplay amount={profitLoss.charges} size="sm" className="font-bold font-mono text-rose-700" />
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <h3 className="font-bold text-emerald-700 text-sm mb-3 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  Produits d'Exploitation & Ventes (Cl. 7)
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Total des produits et ventes</span>
                    <AmountDisplay amount={profitLoss.produits} size="sm" className="font-bold font-mono text-emerald-700" />
                  </div>
                </div>
              </div>
            </div>
            <div className={cn(
              "mt-6 rounded-2xl p-5 border flex items-center justify-between shadow-2xs",
              profitLoss.resultat >= 0 ? "bg-emerald-50/70 border-emerald-200" : "bg-rose-50/70 border-rose-200"
            )}>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Solde Net</span>
                <p className="text-lg font-bold text-slate-900">RÉSULTAT NET COMPTABLE</p>
              </div>
              <AmountDisplay 
                amount={profitLoss.resultat} 
                size="xl" 
                showSign 
                className={cn("font-bold font-mono", profitLoss.resultat >= 0 ? "text-emerald-700" : "text-rose-700")}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {activeReport === 'balance_sheet' && (
        <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Bilan Comptable Simplifié</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Photo patrimoniale de la société à la date de situation</p>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Exporter CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <h3 className="font-bold text-blue-700 text-sm mb-3 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  ACTIF (Emplois)
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Immobilisations (Cl. 2)</span>
                    <AmountDisplay amount={balanceSheet.actif.immobilisations} size="sm" className="font-mono font-medium" />
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Stocks (Cl. 3)</span>
                    <AmountDisplay amount={balanceSheet.actif.stocks} size="sm" className="font-mono font-medium" />
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Créances clients (Cl. 4)</span>
                    <AmountDisplay amount={balanceSheet.actif.creances} size="sm" className="font-mono font-medium" />
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Disponibilités & Trésorerie (Cl. 5)</span>
                    <AmountDisplay amount={balanceSheet.actif.tresorerie} size="sm" className="font-mono font-medium" />
                  </div>
                  <div className="flex justify-between py-3 bg-blue-50/70 border border-blue-200 rounded-xl px-3 mt-4 text-blue-950 font-bold">
                    <span>TOTAL ACTIF</span>
                    <AmountDisplay amount={balanceSheet.actif.total} size="md" className="font-mono font-bold text-blue-900" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                <h3 className="font-bold text-purple-700 text-sm mb-3 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                  PASSIF (Ressources)
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Capitaux propres & Réserves (Cl. 1)</span>
                    <AmountDisplay amount={balanceSheet.passif.capitaux} size="sm" className="font-mono font-medium" />
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">Dettes fournisseurs & fiscales (Cl. 4/5)</span>
                    <AmountDisplay amount={balanceSheet.passif.dettes} size="sm" className="font-mono font-medium" />
                  </div>
                  <div className="flex justify-between py-3 bg-purple-50/70 border border-purple-200 rounded-xl px-3 mt-4 text-purple-950 font-bold">
                    <span>TOTAL PASSIF</span>
                    <AmountDisplay amount={balanceSheet.passif.total} size="md" className="font-mono font-bold text-purple-900" />
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
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900">Grand Livre Général des Comptes</h3>
              <p className="text-xs text-slate-500">Mouvements chronologiques et soldes progressifs par compte</p>
            </div>
            <Badge variant="outline" className="font-mono text-xs bg-slate-100 text-slate-700">
              {ledger.length} compte(s) mouvementé(s)
            </Badge>
          </div>

          {ledger.map(account => (
            <Card key={account.code} className="rounded-2xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 py-3.5 px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-900 shadow-2xs">
                      {account.code}
                    </span>
                    <h4 className="font-semibold text-slate-800 text-sm">{account.label}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-mono">
                      {account.entries.length} écriture(s)
                    </Badge>
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-xs font-mono font-bold",
                        account.soldeFinal >= 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-purple-50 text-purple-700 border-purple-200"
                      )}
                    >
                      Solde : {account.soldeFinal.toFixed(2)} € {account.soldeFinal >= 0 ? '(D)' : '(C)'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/60 text-slate-600 font-bold uppercase border-b border-slate-200">
                        <th className="py-2.5 px-4 w-28">Date</th>
                        <th className="py-2.5 px-3 w-20">Journal</th>
                        <th className="py-2.5 px-3 w-24">N° Pièce</th>
                        <th className="py-2.5 px-4">Libellé de l'opération</th>
                        <th className="py-2.5 px-4 text-right w-32">Débit</th>
                        <th className="py-2.5 px-4 text-right w-32">Crédit</th>
                        <th className="py-2.5 px-4 text-right w-32 font-bold bg-slate-50">Solde progressif</th>
                        <th className="py-2.5 px-3 text-center w-20">Lettrage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {account.entries.map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-4 font-mono text-slate-600">
                            {format(new Date(entry.date), 'dd/MM/yyyy')}
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-slate-100">
                              {entry.journal || 'OD'}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            {entry.entry_number || '-'}
                          </td>
                          <td className="py-2 px-4 font-medium text-slate-800">
                            {entry.label}
                            {entry.reference && (
                              <span className="text-slate-400 text-[11px] ml-1.5">
                                (Réf: {entry.reference})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-slate-800">
                            {entry.debitNum > 0 ? `${entry.debitNum.toFixed(2)} €` : '-'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-slate-800">
                            {entry.creditNum > 0 ? `${entry.creditNum.toFixed(2)} €` : '-'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-semibold bg-slate-50/60 text-slate-900">
                            {entry.runningBalance.toFixed(2)} €
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            {entry.lettering ? (
                              <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                                {entry.lettering}
                              </Badge>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                        <td colSpan={4} className="py-2.5 px-4 text-slate-700 uppercase">
                          Totaux compte {account.code}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-900">
                          {account.totalDebit.toFixed(2)} €
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-900">
                          {account.totalCredit.toFixed(2)} €
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-900 bg-slate-100/70">
                          {account.soldeFinal.toFixed(2)} €
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
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