import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TrendingUp,
  Scale,
  Target,
  BookOpen,
  Info,
} from 'lucide-react';
import AmountDisplay from '@/components/common/AmountDisplay';
import { buildFinancialStatements } from '@/lib/accounting';
import { cn } from '@/lib/utils';

export default function AnalysesAgregats() {
  const { user } = useUser();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [activeTab, setActiveTab] = useState('sig');
  const [selectedDrillDown, setSelectedDrillDown] = useState(null);

  const activeCompanyId = user?.active_company_id;

  const { data: company } = useQuery({
    queryKey: ['company_analyses_agregats', activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, accounting_plan, currency')
        .eq('id', activeCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId
  });

  const planCode = (company?.accounting_plan || 'PCG').toUpperCase();

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts_analyses_agregats', activeCompanyId, planCode],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('code', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeCompanyId
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries_analyses_agregats', activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from('accounting_entries')
        .select('*')
        .eq('company_id', activeCompanyId)
        .eq('is_validated', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeCompanyId
  });

  const availableYears = useMemo(() => {
    const yearsSet = new Set([new Date().getFullYear().toString(), '2026', '2025', '2024']);
    entries.forEach(e => {
      if (e.date) {
        yearsSet.add(new Date(e.date).getFullYear().toString());
      }
    });
    return Array.from(yearsSet).sort().reverse();
  }, [entries]);

  const yearEntries = useMemo(() => {
    return entries.filter(e => {
      if (!e.date) return false;
      const y = new Date(e.date).getFullYear().toString();
      return y === selectedYear;
    });
  }, [entries, selectedYear]);

  const statements = useMemo(() => {
    return buildFinancialStatements({
      entries: yearEntries,
      accounts,
      planCode
    });
  }, [yearEntries, accounts, planCode]);

  const { sig, bilanFonctionnel } = statements;

  // Seuil de rentabilité dérivé des SIG
  const seuilRentabilite = useMemo(() => {
    const ca = sig.chiffreAffairesTotal;
    const chargesVariables = sig.margeCommerciale.achats.amount + sig.valeurAjoutee.consommationsTiers.amount;
    const chargesFixes = sig.ebe.impotsTaxes.amount + sig.ebe.chargesPersonnel.amount + sig.rex.dotationsAmortissements.amount + sig.rcai.chargesFinancieres.amount;

    const margeSurCoutVar = ca - chargesVariables;
    const tauxMargeVariable = ca > 0 ? (margeSurCoutVar / ca) : 0;
    const seuilCA = tauxMargeVariable > 0 ? (chargesFixes / tauxMargeVariable) : 0;
    const pointMort = ca > 0 ? Math.min(365, Math.max(0, 365 * (seuilCA / ca))) : 0;
    const margeSecurite = ca - seuilCA;
    const tauxMargeSecurite = ca > 0 ? (margeSecurite / ca * 100) : 0;

    return {
      ca,
      chargesVariables,
      chargesFixes,
      seuilCA,
      pointMort,
      margeSecurite,
      tauxMargeSecurite,
      atteint: ca >= seuilCA && ca > 0
    };
  }, [sig]);

  // Composant réutilisable pour afficher une ligne financière avec bouton d'explication / drill-down
  const FinancialRow = ({
    label,
    amount,
    aggregateItem,
    isTotal = false,
    isSubtotal = false,
    isNegative = false,
    badge = null,
    level = 0,
    prefix = ''
  }) => {
    const hasAccounts = aggregateItem && aggregateItem.accounts && aggregateItem.accounts.length > 0;

    return (
      <div className={cn(
        "flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors",
        isTotal
          ? "bg-slate-900 text-white font-bold text-sm shadow-xs my-2"
          : isSubtotal
          ? "bg-slate-100/90 text-slate-900 font-semibold text-xs my-1 border border-slate-200/80"
          : "hover:bg-slate-50/80 text-slate-700 text-xs border-b border-slate-100 last:border-0",
        level === 1 && "pl-6 text-xs text-slate-600",
        level === 2 && "pl-10 text-[11px] text-slate-500"
      )}>
        <div className="flex items-center gap-2 min-w-0 pr-3">
          <span className="truncate">{prefix}{label}</span>
          {badge && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal shrink-0", isTotal ? "border-slate-700 text-slate-300" : "")}>
              {badge}
            </Badge>
          )}
          {aggregateItem && (
            <button
              type="button"
              onClick={() => setSelectedDrillDown(aggregateItem)}
              className={cn(
                "p-1 rounded-md transition-all shrink-0 flex items-center gap-1 text-[11px]",
                isTotal
                  ? "text-slate-400 hover:text-white hover:bg-slate-800"
                  : "text-slate-400 hover:text-[#1e3a5f] hover:bg-blue-50"
              )}
              title="Voir l'explication et les comptes détaillés"
            >
              <Info className="h-3.5 w-3.5" />
              {hasAccounts && (
                <span className={cn("font-mono text-[10px] px-1 rounded", isTotal ? "bg-slate-800 text-slate-300" : "bg-blue-50 text-[#1e3a5f]")}>
                  {aggregateItem.accounts.length} cpt
                </span>
              )}
            </button>
          )}
        </div>

        <div className="text-right shrink-0 font-mono">
          <AmountDisplay
            amount={amount}
            className={cn(
              isTotal ? "text-base text-white font-bold" : isSubtotal ? "text-slate-900 font-bold text-xs" : "text-slate-800 text-xs",
              isNegative && amount > 0 && "text-rose-600"
            )}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-7 pb-16">
      {/* En-tête */}
      <div className="relative overflow-hidden rounded-2xl border border-[#e2e8f0] bg-[#142638] px-6 py-6 text-white shadow-xl shadow-slate-900/10 lg:px-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border border-[#f5871f]/25" />
        <div className="absolute right-10 top-8 h-28 w-28 rounded-full border border-[#f5871f]/15" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f5871f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f5871f]" />
              Analyse & pilotage
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] lg:text-4xl">
                Analyses et Agrégats
              </h1>
              <Badge variant="outline" className="border-white/20 bg-white/10 font-mono text-xs text-slate-100">
                {planCode} • {planCode === 'SYSCOHADA' ? 'Système Comptable OHADA' : 'Plan Comptable Général Français'}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 lg:text-base">
              Soldes Intermédiaires de Gestion, Bilan Fonctionnel & BFR et Seuil de Rentabilité
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Exercice analysé</span>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-8 w-32 border-0 bg-transparent p-0 text-base font-bold text-white shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(yr => (
                    <SelectItem key={yr} value={yr} className="font-medium">
                      {yr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Onglets des analyses */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto rounded-xl border border-[#e2e8f0] bg-[#f1f5f9] p-1 gap-1">
          <TabsTrigger value="sig" className="rounded-lg px-4 py-2.5 text-xs font-semibold data-[state=active]:bg-[#142638] data-[state=active]:text-white data-[state=active]:shadow-md">
            <TrendingUp className="h-4 w-4 mr-1.5 text-indigo-600" />
            Soldes Intermédiaires (SIG)
          </TabsTrigger>
          <TabsTrigger value="fonctionnel" className="rounded-lg px-4 py-2.5 text-xs font-semibold data-[state=active]:bg-[#142638] data-[state=active]:text-white data-[state=active]:shadow-md">
            <Scale className="h-4 w-4 mr-1.5 text-emerald-600" />
            Bilan Fonctionnel & BFR
          </TabsTrigger>
          <TabsTrigger value="seuil" className="rounded-lg px-4 py-2.5 text-xs font-semibold data-[state=active]:bg-[#142638] data-[state=active]:text-white data-[state=active]:shadow-md">
            <Target className="h-4 w-4 mr-1.5 text-amber-600" />
            Seuil de Rentabilité
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================== */}
        {/* ONGLET 1 : SOLDES INTERMÉDIAIRES DE GESTION (SIG)                     */}
        {/* ==================================================================== */}
        <TabsContent value="sig" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-blue-50/50 to-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chiffre d’Affaires</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  <AmountDisplay amount={sig.chiffreAffairesTotal} />
                </div>
                <p className="text-xs text-slate-500 mt-1">Ventes de marchandises & prestations</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-purple-50/50 to-white">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valeur Ajoutée (VA)</span>
                    <div className="text-2xl font-bold text-purple-950 mt-1">
                      <AmountDisplay amount={sig.valeurAjoutee.amount} />
                    </div>
                  </div>
                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                    {sig.valeurAjoutee.tauxVA.toFixed(1)} % CA
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">Richesse brute créée par l’activité</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-emerald-50/50 to-white">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Résultat Net</span>
                    <div className="text-2xl font-bold text-emerald-950 mt-1">
                      <AmountDisplay amount={sig.resultatNet.amount} />
                    </div>
                  </div>
                  <Badge className={cn("text-xs", sig.resultatNet.amount >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
                    {sig.resultatNet.tauxMargeNette.toFixed(1)} % CA
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">Bénéfice net / Perte de l’exercice</p>
              </CardContent>
            </Card>
          </div>

          {/* Tableau détaillé des étapes des SIG avec Drill-down */}
          <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Soldes Intermédiaires de Gestion ({selectedYear})
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Décomposition réglementaire du compte de résultat. Cliquez sur l’icône ℹ️ pour inspecter chaque compte contributeur.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {/* Étape 1 : Marge Commerciale */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">1. Activité Commerciale</div>
                <FinancialRow label="Ventes de marchandises (707)" amount={sig.margeCommerciale.ventes.amount} aggregateItem={sig.margeCommerciale.ventes} level={1} />
                <FinancialRow label="- Achats de marchandises & variation stock (607, 6037)" amount={sig.margeCommerciale.achats.amount} aggregateItem={sig.margeCommerciale.achats} isNegative level={1} />
                <FinancialRow label="= Marge Commerciale" amount={sig.margeCommerciale.amount} isSubtotal badge={`Taux : ${sig.margeCommerciale.taux}%`} />
              </div>

              {/* Étape 2 : Production de l'exercice */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">2. Activité de Production</div>
                <FinancialRow label="Production vendue (Biens & Services 701-706)" amount={sig.productionExercice.productionVendue.amount} aggregateItem={sig.productionExercice.productionVendue} level={1} />
                <FinancialRow label="Production stockée & immobilisée (71, 72)" amount={sig.productionExercice.productionStockeeImmobilisee.amount} aggregateItem={sig.productionExercice.productionStockeeImmobilisee} level={1} />
                <FinancialRow label="= Production de l’exercice" amount={sig.productionExercice.amount} isSubtotal />
              </div>

              {/* Étape 3 : Valeur Ajoutée */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">3. Création de Valeur</div>
                <FinancialRow label="- Consommations en provenance des tiers (601-606, 61, 62)" amount={sig.valeurAjoutee.consommationsTiers.amount} aggregateItem={sig.valeurAjoutee.consommationsTiers} isNegative level={1} />
                <FinancialRow label="= Valeur Ajoutée (VA)" amount={sig.valeurAjoutee.amount} isSubtotal badge={`Taux : ${sig.valeurAjoutee.tauxVA}%`} />
              </div>

              {/* Étape 4 : Excédent Brut d'Exploitation */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">4. Performance d’Exploitation Brute</div>
                <FinancialRow label="+ Subventions d’exploitation (74)" amount={sig.ebe.subventionsExploitation.amount} aggregateItem={sig.ebe.subventionsExploitation} level={1} />
                <FinancialRow label="- Impôts, taxes et versements assimilés (63)" amount={sig.ebe.impotsTaxes.amount} aggregateItem={sig.ebe.impotsTaxes} isNegative level={1} />
                <FinancialRow label="- Charges de personnel (Salaires & Charges 64)" amount={sig.ebe.chargesPersonnel.amount} aggregateItem={sig.ebe.chargesPersonnel} level={1} />
                <FinancialRow label="= Excédent Brut d’Exploitation (EBE)" amount={sig.ebe.amount} isSubtotal badge={`Taux : ${sig.ebe.tauxEBE}%`} />
              </div>

              {/* Étape 5 : Résultat d'Exploitation */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">5. Résultat d’Exploitation Net</div>
                <FinancialRow label="+ Autres produits d’exploitation & reprises (75, 781, 791)" amount={sig.rex.autresProduitsExploitation.amount} aggregateItem={sig.rex.autresProduitsExploitation} level={1} />
                <FinancialRow label="- Autres charges de gestion courante (65)" amount={sig.rex.autresChargesExploitation.amount} aggregateItem={sig.rex.autresChargesExploitation} isNegative level={1} />
                <FinancialRow label="- Dotations aux amortissements et provisions (681)" amount={sig.rex.dotationsAmortissements.amount} aggregateItem={sig.rex.dotationsAmortissements} isNegative level={1} />
                <FinancialRow label="= Résultat d’Exploitation (REX)" amount={sig.rex.amount} isSubtotal />
              </div>

              {/* Étape 6 & 7 : Résultat Financier et RCAI */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">6. Activité Financière & RCAI</div>
                <FinancialRow label="+ Produits financiers (76, 786, 796)" amount={sig.rcai.produitsFinanciers.amount} aggregateItem={sig.rcai.produitsFinanciers} level={1} />
                <FinancialRow label="- Charges financières (66, 686)" amount={sig.rcai.chargesFinancieres.amount} aggregateItem={sig.rcai.chargesFinancieres} isNegative level={1} />
                <FinancialRow label="= Résultat Courant Avant Impôts (RCAI)" amount={sig.rcai.amount} isSubtotal />
              </div>

              {/* Étape 8 : Exceptionnel / HAO et Résultat Net */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">7. Exceptionnel, Impôts & Résultat Final</div>
                <FinancialRow label="+ Produits exceptionnels / HAO" amount={sig.resultatExceptionnel.produitsExceptionnels.amount} aggregateItem={sig.resultatExceptionnel.produitsExceptionnels} level={1} />
                <FinancialRow label="- Charges exceptionnelles / HAO" amount={sig.resultatExceptionnel.chargesExceptionnelles.amount} aggregateItem={sig.resultatExceptionnel.chargesExceptionnelles} isNegative level={1} />
                <FinancialRow label="- Impôt sur les sociétés & Participation (69)" amount={sig.resultatNet.impotsBenefices.amount} aggregateItem={sig.resultatNet.impotsBenefices} isNegative level={1} />
                <FinancialRow label="= RÉSULTAT NET DE L’EXERCICE" amount={sig.resultatNet.amount} isTotal />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================================================================== */}
        {/* ONGLET 2 : BILAN FONCTIONNEL, FRNG, BFR & TRÉSORERIE NETTE            */}
        {/* ==================================================================== */}
        <TabsContent value="fonctionnel" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* FRNG */}
            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-indigo-50/50 to-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">FRNG (Fonds de Roulement)</span>
                <div className="text-2xl font-bold text-indigo-950 mt-1">
                  <AmountDisplay amount={bilanFonctionnel.frng.amount} />
                </div>
                <p className="text-xs text-slate-600 mt-2 font-medium">
                  {bilanFonctionnel.frng.interpretation}
                </p>
              </CardContent>
            </Card>

            {/* BFR */}
            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-amber-50/50 to-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">BFR (Besoin en Fonds de Roulement)</span>
                <div className="text-2xl font-bold text-amber-950 mt-1">
                  <AmountDisplay amount={bilanFonctionnel.bfrTotal.amount} />
                </div>
                <p className="text-xs text-slate-600 mt-2 font-medium">
                  {bilanFonctionnel.bfrTotal.interpretation}
                </p>
              </CardContent>
            </Card>

            {/* Trésorerie Nette */}
            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-emerald-50/50 to-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trésorerie Nette (TN)</span>
                <div className="text-2xl font-bold text-emerald-950 mt-1">
                  <AmountDisplay amount={bilanFonctionnel.tresorerieNette.amount} />
                </div>
                <p className="text-xs text-slate-600 mt-2 font-medium">
                  {bilanFonctionnel.tresorerieNette.interpretation}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
              <CardTitle className="text-lg font-bold text-slate-900">
                Structure du Bilan Fonctionnel & Équilibre Fondamental
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Rapprochement certifié de la trésorerie : <strong>Trésorerie Nette = FRNG - BFR = Trésorerie Active - Trésorerie Passive</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bloc Haut de Bilan */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
                    <span>1. Haut de Bilan (Financement Structurel)</span>
                    <Badge variant="outline" className="text-xs font-mono">FRNG</Badge>
                  </h4>
                  <div className="space-y-2 text-sm bg-white p-3 rounded-xl border border-slate-200/60">
                    <div className="flex justify-between">
                      <span className="text-slate-600">+ Ressources Stables (RS)</span>
                      <AmountDisplay amount={bilanFonctionnel.ressourcesStables.amount} className="font-bold" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">- Emplois Stables (ES - Actif Brut Immo)</span>
                      <AmountDisplay amount={bilanFonctionnel.emploisStables.amount} className="font-bold text-rose-600" />
                    </div>
                    <div className="border-t pt-2 flex justify-between font-bold text-indigo-900">
                      <span>= FRNG (Fonds de Roulement)</span>
                      <AmountDisplay amount={bilanFonctionnel.frng.amount} size="md" />
                    </div>
                  </div>
                </div>

                {/* Bloc Cycle d'Exploitation (BFR) */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
                    <span>2. Cycle d’Exploitation & Hors Exploitation</span>
                    <Badge variant="outline" className="text-xs font-mono">BFR</Badge>
                  </h4>
                  <div className="space-y-2 text-sm bg-white p-3 rounded-xl border border-slate-200/60">
                    <div className="flex justify-between">
                      <span className="text-slate-600">+ BFR d’Exploitation (ACE - PCE)</span>
                      <AmountDisplay amount={bilanFonctionnel.bfrExploitation.amount} className="font-bold" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">+ BFR Hors Exploitation (ACHE - PCHE)</span>
                      <AmountDisplay amount={bilanFonctionnel.bfrHorsExploitation.amount} className="font-bold" />
                    </div>
                    <div className="border-t pt-2 flex justify-between font-bold text-amber-900">
                      <span>= BFR Global</span>
                      <AmountDisplay amount={bilanFonctionnel.bfrTotal.amount} size="md" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Synthèse de concordance Trésorerie */}
              <div className="p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h5 className="font-bold text-emerald-950 text-sm">Vérification de l’Équation de Trésorerie</h5>
                  <p className="text-xs text-emerald-800 mt-1">
                    Trésorerie Active ({bilanFonctionnel.tresorerieNette.tresorerieActive.toFixed(2)} €) - Trésorerie Passive ({bilanFonctionnel.tresorerieNette.tresoreriePassive.toFixed(2)} €) = <strong>{bilanFonctionnel.tresorerieNette.amount.toFixed(2)} €</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 block">Trésorerie Nette Finale</span>
                  <AmountDisplay amount={bilanFonctionnel.tresorerieNette.amount} size="xl" className="font-bold text-emerald-900" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================================================================== */}
        {/* ONGLET 3 : SEUIL DE RENTABILITÉ & POINT MORT                          */}
        {/* ==================================================================== */}
        <TabsContent value="seuil" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Charges Variables</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  <AmountDisplay amount={seuilRentabilite.chargesVariables} />
                </div>
                <p className="text-xs text-slate-500 mt-1">Achats de marchandises et consommations tiers</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Charges Fixes Structurelles</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  <AmountDisplay amount={seuilRentabilite.chargesFixes} />
                </div>
                <p className="text-xs text-slate-500 mt-1">Salaires, impôts, dotations et intérêts</p>
              </CardContent>
            </Card>

            <Card className={cn("rounded-2xl border shadow-xs", seuilRentabilite.atteint ? "bg-emerald-50/70 border-emerald-200" : "bg-rose-50/70 border-rose-200")}>
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Seuil de Rentabilité (CA)</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  <AmountDisplay amount={seuilRentabilite.seuilCA} />
                </div>
                <p className={cn("text-xs font-medium mt-1", seuilRentabilite.atteint ? "text-emerald-700" : "text-rose-700")}>
                  {seuilRentabilite.atteint ? '✓ Seuil de rentabilité dépassé' : '⚠️ Seuil de rentabilité non atteint'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
              <CardTitle className="text-lg font-bold text-slate-900">
                Point Mort & Marge de Sécurité ({selectedYear})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Indicateurs de risque d'exploitation calculés d'après les SIG réels
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <span className="text-xs font-semibold uppercase text-slate-500">Point Mort en jours</span>
                  <div className="text-3xl font-bold text-slate-900">
                    {seuilRentabilite.pointMort.toFixed(0)} jours
                  </div>
                  <p className="text-xs text-slate-600">
                    Nombre de jours d'activité nécessaires pour couvrir l'ensemble des charges fixes de l'année.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <span className="text-xs font-semibold uppercase text-slate-500">Marge de Sécurité</span>
                  <div className="text-3xl font-bold text-blue-900">
                    <AmountDisplay amount={seuilRentabilite.margeSecurite} />
                  </div>
                  <p className="text-xs text-slate-600">
                    Baisse maximale de chiffre d'affaires supportable avant d'entrer en zone de perte ({seuilRentabilite.tauxMargeSecurite.toFixed(1)}% du CA).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================================================================== */}
      {/* MODAL DRILL-DOWN : EXPLICATION ET DÉTAIL DES COMPTES POUR UN POSTE    */}
      {/* ==================================================================== */}
      <Dialog open={!!selectedDrillDown} onOpenChange={() => setSelectedDrillDown(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#1e3a5f]" />
              <DialogTitle className="text-lg font-bold text-slate-900">
                {selectedDrillDown?.label}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Règle comptable : {selectedDrillDown?.ruleDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div>
                <span className="text-xs font-semibold uppercase text-slate-500">Montant net calculé</span>
                <div className="text-xl font-bold text-slate-900">
                  <AmountDisplay amount={selectedDrillDown?.amount || 0} />
                </div>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">
                {selectedDrillDown?.accounts?.length || 0} compte(s) mouvementé(s)
              </Badge>
            </div>

            {(!selectedDrillDown?.accounts || selectedDrillDown.accounts.length === 0) ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 text-slate-500 text-xs">
                Aucun compte de ce poste n'a fait l'objet de mouvement sur l'exercice {selectedYear}.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200/90 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-600 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-mono">Compte</th>
                      <th className="py-2.5 px-3">Libellé</th>
                      <th className="py-2.5 px-3 text-right">Débit</th>
                      <th className="py-2.5 px-3 text-right">Crédit</th>
                      <th className="py-2.5 px-3 text-right font-bold">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDrillDown.accounts.map((acc) => (
                      <tr key={acc.code} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {acc.code}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">
                          {acc.label}
                          {acc.parent_code && (
                            <span className="block text-[10px] text-slate-400 font-mono">
                              (Racine {acc.parent_code})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {acc.debit > 0 ? `${acc.debit.toFixed(2)} €` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {acc.credit > 0 ? `${acc.credit.toFixed(2)} €` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1e3a5f]">
                          {acc.contribution.toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
