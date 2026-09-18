import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { generateText } from '@/api/aiClient';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { useUser } from '@/components/hooks/useUser';
import { buildFinancialStatements } from '@/lib/accounting';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  Sparkles,
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
  const [activeReport, setActiveReport] = useState('ledger');

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id).eq('is_validated', true); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  const { data: company } = useQuery({
    queryKey: ['company_reports', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('accounting_plan')
        .eq('id', user.active_company_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
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

  const periodEntries = useMemo(() => filterEntriesByPeriod(), [entries, selectedPeriod]);
  const periodEnd = useMemo(() => getPeriodDates().end, [selectedPeriod]);
  const entriesThroughPeriodEnd = useMemo(() => entries.filter((entry) => {
    const date = new Date(entry.date);
    return !Number.isNaN(date.getTime()) && date <= periodEnd;
  }), [entries, periodEnd]);

  const periodStatements = useMemo(() => buildFinancialStatements({
    entries: periodEntries,
    planCode: company?.accounting_plan || 'PCG'
  }), [periodEntries, company?.accounting_plan]);

  const balanceStatements = useMemo(() => buildFinancialStatements({
    entries: entriesThroughPeriodEnd,
    planCode: company?.accounting_plan || 'PCG'
  }), [entriesThroughPeriodEnd, company?.accounting_plan]);

  // Les soldes de gestion sont périodiques ; le bilan est cumulé jusqu'à la clôture.
  const calculateBalance = () => balanceStatements.balances;

  const calculateProfitLoss = () => ({
    charges: periodStatements.compteResultat.totalCharges,
    produits: periodStatements.compteResultat.totalProduits,
    resultat: periodStatements.compteResultat.resultatNet
  });

  const calculateBalanceSheet = () => {
    const { actif, passif } = balanceStatements.bilan;
    return {
      actif: {
        immobilisations: actif.actifImmobilise.totalNet,
        stocks: actif.actifCirculant.stocks.totalNet,
        creances: actif.actifCirculant.creancesClients.totalNet + actif.actifCirculant.autresCreances.amount,
        tresorerie: actif.actifCirculant.tresorerieActive.amount,
        total: actif.totalNet
      },
      passif: {
        capitaux: passif.capitauxPropres.total,
        dettes: passif.dettes.total,
        total: passif.total
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
  const cashFlow = calculateCashFlow();
  const ledger = generateLedger();

  const reports = [
    {
      id: 'ledger',
      name: 'Grand Livre',
      icon: BookOpen,
      color: 'from-amber-600 to-orange-700',
      activeBorder: 'border-amber-500 bg-amber-50/40',
      iconBg: 'bg-amber-100 text-amber-700',
      description: 'Détail chronologique et solde progressif par compte'
    },
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
      id: 'cash_flow',
      name: 'Flux de Trésorerie',
      icon: DollarSign,
      color: 'from-emerald-600 to-green-700',
      activeBorder: 'border-emerald-500 bg-emerald-50/40',
      iconBg: 'bg-emerald-100 text-emerald-700',
      description: 'Mouvements de trésorerie par catégorie d’activité'
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
              <SelectTrigger className="w-44 bg-white/80 border-[#e2e8f0] rounded-lg text-xs h-10 font-medium">
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
              className="gap-2 bg-[#142638] text-white shadow-md hover:bg-[#24445a] rounded-lg text-xs h-10 font-semibold"
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
                "cursor-pointer rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between shadow-sm hover:-translate-y-0.5",
                isSelected
                  ? "border-2 border-[#f5871f] bg-[#142638] text-white shadow-lg shadow-slate-900/10"
                  : "bg-white/70 border-[#e2e8f0] hover:border-[#f5871f] hover:bg-white"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2.5 rounded-lg flex items-center justify-center transition-colors", isSelected ? "bg-[#f5871f] text-[#142638]" : "bg-[#f1f5f9] text-[#475569]")}>
                  <Icon className="h-4 w-4" />
                </div>
                {isSelected && (
                    <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 bg-white/10 border-white/20 text-white">
                    Actif
                  </Badge>
                )}
              </div>
              <div>
                <p className={cn("font-bold text-xs sm:text-sm", isSelected ? "text-white" : "text-slate-900")}>{report.name}</p>
                <p className={cn("text-[11px] mt-0.5 line-clamp-2 leading-tight", isSelected ? "text-slate-300" : "text-slate-500")}>{report.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Contenu des rapports */}
      {activeReport === 'balance' && (
        <Card className="rounded-xl border-[#e2e8f0] bg-white/70 shadow-sm overflow-hidden">
          <CardHeader className="bg-[#f1f5f9]/60 border-b border-[#e2e8f0] p-5">
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
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead>
                  <tr className="bg-[#f1f5f9]/70 text-[#475569] font-bold uppercase border-b border-[#e2e8f0]">
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