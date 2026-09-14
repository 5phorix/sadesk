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
  AlertCircle, 
  CheckCircle2, 
  Scale,
  Info,
  BookOpen,
  Building,
  Target,
  FileSpreadsheet
} from 'lucide-react';
import AmountDisplay from '@/components/common/AmountDisplay';
import { buildFinancialStatements } from '@/lib/accounting';
import { cn } from '@/lib/utils';

export default function FinancialStatements() {
  const { user } = useUser();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [activeTab, setActiveTab] = useState('compte_resultat');
  const [selectedDrillDown, setSelectedDrillDown] = useState(null);

  const activeCompanyId = user?.active_company_id;

  // 1. Récupération de l'entreprise
  const { data: company } = useQuery({
    queryKey: ['company_financial_stmts', activeCompanyId],
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

  // 2. Récupération des comptes du plan
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts_financial_stmts', activeCompanyId, planCode],
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

  // 3. Récupération des écritures comptables validées
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['entries_financial_stmts', activeCompanyId],
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

  // Liste des années disponibles basées sur les écritures
  const availableYears = useMemo(() => {
    const yearsSet = new Set([new Date().getFullYear().toString(), '2026', '2025', '2024']);
    entries.forEach(e => {
      if (e.date) {
        yearsSet.add(new Date(e.date).getFullYear().toString());
      }
    });
    return Array.from(yearsSet).sort().reverse();
  }, [entries]);

  // Filtrer les écritures par exercice / année sélectionnée
  const yearEntries = useMemo(() => {
    return entries.filter(e => {
      if (!e.date) return false;
      const y = new Date(e.date).getFullYear().toString();
      return y === selectedYear;
    });
  }, [entries, selectedYear]);

  // Calcul du moteur d'états financiers certifié selon la norme comptable
  const statements = useMemo(() => {
    return buildFinancialStatements({
      entries: yearEntries,
      accounts,
      planCode
    });
  }, [yearEntries, accounts, planCode]);

  const { sig, compteResultat, bilan, bilanFonctionnel } = statements;

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

  // Composant pour ligne d'actif détaillée à 3 colonnes (Brut / Amort & Dép / Net)
  const ActifDetailedRow = ({
    label,
    brut = 0,
    amort = 0,
    net = 0,
    aggregateBrut = null,
    aggregateAmort = null,
    isTotal = false,
    isSubtotal = false,
    level = 0
  }) => {
    return (
      <div className={cn(
        "grid grid-cols-[1fr_90px_90px_95px] items-center py-2.5 px-3 rounded-xl transition-colors text-xs",
        isTotal 
          ? "bg-slate-900 text-white font-bold text-sm shadow-xs my-2" 
          : isSubtotal 
          ? "bg-slate-100 text-slate-900 font-semibold my-1 border border-slate-200" 
          : "hover:bg-slate-50/80 text-slate-700 border-b border-slate-100 last:border-0",
        level === 1 && "pl-6 text-xs text-slate-600",
        level === 2 && "pl-10 text-[11px] text-slate-500"
      )}>
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <span className="truncate">{label}</span>
          {aggregateBrut && (
            <button
              type="button"
              onClick={() => setSelectedDrillDown(aggregateBrut)}
              className={cn(
                "p-1 rounded-md transition-all shrink-0 flex items-center gap-1 text-[11px]",
                isTotal ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-blue-700 hover:bg-blue-50"
              )}
              title="Inspecter les comptes contributeurs"
            >
              <Info className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="text-right font-mono text-slate-700 pr-1">
          {isTotal || isSubtotal || brut !== 0 ? (
            <AmountDisplay amount={brut} className={cn(isTotal ? "text-white font-bold text-xs" : isSubtotal ? "font-bold text-xs" : "text-xs")} />
          ) : '-'}
        </div>

        <div className="text-right font-mono text-rose-600 pr-1">
          {amort !== 0 ? (
            <AmountDisplay amount={amort} className={cn(isTotal ? "text-rose-300 font-bold text-xs" : isSubtotal ? "font-bold text-xs" : "text-xs")} />
          ) : '-'}
        </div>

        <div className="text-right font-mono font-bold text-slate-900">
          <AmountDisplay amount={net} className={cn(isTotal ? "text-white font-bold text-sm" : isSubtotal ? "font-bold text-xs" : "text-xs")} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-16">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              États Financiers
            </h1>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-slate-100/80 text-slate-700 border-slate-300">
              {planCode} • {planCode === 'SYSCOHADA' ? 'Système Comptable OHADA' : 'Plan Comptable Général Français'}
            </Badge>
          </div>
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            Compte de résultat officiel, Bilan complet multi-colonnes, Soldes Intermédiaires de Gestion et Bilan Fonctionnel
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase">Exercice :</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28 h-8 font-bold border-0 shadow-none focus:ring-0">
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

      {/* Barre d'alerte équilibre comptable */}
      <div className={cn(
        "p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs",
        bilan.isBalanced 
          ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" 
          : "bg-amber-50/70 border-amber-200 text-amber-900"
      )}>
        <div className="flex items-center gap-3">
          {bilan.isBalanced ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          )}
          <div>
            <span className="text-sm font-bold">
              {bilan.isBalanced ? 'Équilibre comptable parfait (Actif Net = Passif)' : 'Contrôle d’équilibre à vérifier'}
            </span>
            <p className="text-xs text-slate-600 mt-0.5">
              Total Actif Net : <strong>{bilan.actif.totalNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong> · 
              Total Passif : <strong>{bilan.passif.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
              {!bilan.isBalanced && ` (Écart : ${bilan.ecart.toFixed(2)} €)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Badge variant="secondary" className="bg-white/80 border border-slate-200 text-slate-800 text-xs">
            {yearEntries.length} écritures validées en {selectedYear}
          </Badge>
        </div>
      </div>

      {/* Onglets des États Financiers */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="compte_resultat" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-blue-600" />
            Compte de Résultat Officiel
          </TabsTrigger>
          <TabsTrigger value="bilan" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <Building className="h-4 w-4 mr-1.5 text-purple-600" />
            Bilan Comptable Détaillé
          </TabsTrigger>
          <TabsTrigger value="sig" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <TrendingUp className="h-4 w-4 mr-1.5 text-indigo-600" />
            Soldes Intermédiaires (SIG)
          </TabsTrigger>
          <TabsTrigger value="fonctionnel" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <Scale className="h-4 w-4 mr-1.5 text-emerald-600" />
            Bilan Fonctionnel & BFR
          </TabsTrigger>
          <TabsTrigger value="seuil" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <Target className="h-4 w-4 mr-1.5 text-amber-600" />
            Seuil de Rentabilité
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================== */}
        {/* ONGLET 1 : COMPTE DE RÉSULTAT OFFICIEL (CHARGES VS PRODUITS)          */}
        {/* ==================================================================== */}
        <TabsContent value="compte_resultat" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-rose-50/50 to-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total des Charges</span>
                <div className="text-2xl font-bold text-rose-950 mt-1">
                  <AmountDisplay amount={compteResultat.totalCharges} />
                </div>
                <p className="text-xs text-slate-500 mt-1">Exploitation, financières, exceptionnelles & IS</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/90 shadow-xs bg-linear-to-br from-emerald-50/50 to-white">
              <CardContent className="p-5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total des Produits</span>
                <div className="text-2xl font-bold text-emerald-950 mt-1">
                  <AmountDisplay amount={compteResultat.totalProduits} />
                </div>
                <p className="text-xs text-slate-500 mt-1">Ventes, production, financiers & exceptionnels</p>
              </CardContent>
            </Card>

            <Card className={cn("rounded-2xl border shadow-xs", compteResultat.isBenefice ? "bg-emerald-50/80 border-emerald-200" : "bg-rose-50/80 border-rose-200")}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                      {compteResultat.isBenefice ? 'Bénéfice Net (Solde Créditeur)' : 'Perte Nette (Solde Débiteur)'}
                    </span>
                    <div className={cn("text-2xl font-bold mt-1", compteResultat.isBenefice ? "text-emerald-950" : "text-rose-950")}>
                      <AmountDisplay amount={compteResultat.resultatNet} />
                    </div>
                  </div>
                  <Badge className={cn("text-xs", compteResultat.isBenefice ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
                    {compteResultat.isBenefice ? 'Bénéfice' : 'Perte'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mt-1">Produits - Charges de l’exercice {selectedYear}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CHARGES */}
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-rose-50/60 border-b border-rose-100 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-rose-600" />
                    <CardTitle className="text-base font-bold text-slate-900">CHARGES (Débit)</CardTitle>
                  </div>
                  <span className="text-xs font-semibold text-rose-800">Exercice {selectedYear}</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* 1. Charges d'exploitation */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">I. Charges d’Exploitation (60, 61, 62, 63, 64, 65, 681)</div>
                  <FinancialRow label="Achats de marchandises & variations de stock (607, 6037)" amount={compteResultat.charges.exploitation.achatsMarchandises.amount} aggregateItem={compteResultat.charges.exploitation.achatsMarchandises} level={1} />
                  <FinancialRow label="Consommations de l’exercice (601-606, 61, 62)" amount={compteResultat.charges.exploitation.consommationsTiers.amount} aggregateItem={compteResultat.charges.exploitation.consommationsTiers} level={1} />
                  <FinancialRow label="Impôts, taxes et versements assimilés (63)" amount={compteResultat.charges.exploitation.impotsTaxes.amount} aggregateItem={compteResultat.charges.exploitation.impotsTaxes} level={1} />
                  <FinancialRow label="Charges de personnel (Salaires & Charges 64)" amount={compteResultat.charges.exploitation.chargesPersonnel.amount} aggregateItem={compteResultat.charges.exploitation.chargesPersonnel} level={1} />
                  <FinancialRow label="Autres charges de gestion courante (65)" amount={compteResultat.charges.exploitation.autresChargesExploitation.amount} aggregateItem={compteResultat.charges.exploitation.autresChargesExploitation} level={1} />
                  <FinancialRow label="Dotations aux amortissements & provisions (681)" amount={compteResultat.charges.exploitation.dotationsAmortissements.amount} aggregateItem={compteResultat.charges.exploitation.dotationsAmortissements} level={1} />
                  <FinancialRow label="Total I. Charges d’Exploitation" amount={compteResultat.charges.exploitation.total} isSubtotal />
                </div>

                {/* 2. Charges financières */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">II. Charges Financières (66, 686)</div>
                  <FinancialRow label="Intérêts, pertes de change & dotations financières" amount={compteResultat.charges.financieres.chargesFinancieres.amount} aggregateItem={compteResultat.charges.financieres.chargesFinancieres} level={1} />
                  <FinancialRow label="Total II. Charges Financières" amount={compteResultat.charges.financieres.total} isSubtotal />
                </div>

                {/* 3. Charges exceptionnelles / HAO */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">III. Charges Exceptionnelles / HAO (67, 687, 81-85)</div>
                  <FinancialRow label="Charges exceptionnelles de gestion et en capital" amount={compteResultat.charges.exceptionnelles.chargesExceptionnelles.amount} aggregateItem={compteResultat.charges.exceptionnelles.chargesExceptionnelles} level={1} />
                  <FinancialRow label="Total III. Charges Exceptionnelles / HAO" amount={compteResultat.charges.exceptionnelles.total} isSubtotal />
                </div>

                {/* 4. Impôts sur les bénéfices */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">IV. Impôts & Participation (69)</div>
                  <FinancialRow label="Impôt sur les sociétés & participation des salariés" amount={compteResultat.charges.impots.impotsBenefices.amount} aggregateItem={compteResultat.charges.impots.impotsBenefices} level={1} />
                  <FinancialRow label="Total IV. Impôts sur les bénéfices" amount={compteResultat.charges.impots.total} isSubtotal />
                </div>

                <FinancialRow label="TOTAL GÉNÉRAL DES CHARGES (I + II + III + IV)" amount={compteResultat.totalCharges} isTotal />
                {compteResultat.isBenefice && (
                  <FinancialRow label="+ SOLDE CRÉDITEUR (BÉNÉFICE NET)" amount={compteResultat.resultatNet} isSubtotal badge="Équilibre" />
                )}
              </CardContent>
            </Card>

            {/* PRODUITS */}
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-600" />
                    <CardTitle className="text-base font-bold text-slate-900">PRODUITS (Crédit)</CardTitle>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800">Exercice {selectedYear}</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* 1. Produits d'exploitation */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">I. Produits d’Exploitation (70, 71, 72, 74, 75, 781, 791)</div>
                  <FinancialRow label="Ventes de marchandises (707)" amount={compteResultat.produits.exploitation.ventesMarchandises.amount} aggregateItem={compteResultat.produits.exploitation.ventesMarchandises} level={1} />
                  <FinancialRow label="Production vendue (Biens & Services 701-706)" amount={compteResultat.produits.exploitation.productionVendue.amount} aggregateItem={compteResultat.produits.exploitation.productionVendue} level={1} />
                  <FinancialRow label="Production stockée & immobilisée (71, 72)" amount={compteResultat.produits.exploitation.productionStockeeImmobilisee.amount} aggregateItem={compteResultat.produits.exploitation.productionStockeeImmobilisee} level={1} />
                  <FinancialRow label="Subventions d’exploitation (74)" amount={compteResultat.produits.exploitation.subventionsExploitation.amount} aggregateItem={compteResultat.produits.exploitation.subventionsExploitation} level={1} />
                  <FinancialRow label="Autres produits de gestion, reprises & transferts (75, 781, 791)" amount={compteResultat.produits.exploitation.autresProduitsExploitation.amount} aggregateItem={compteResultat.produits.exploitation.autresProduitsExploitation} level={1} />
                  <FinancialRow label="Total I. Produits d’Exploitation" amount={compteResultat.produits.exploitation.total} isSubtotal />
                </div>

                {/* 2. Produits financiers */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">II. Produits Financiers (76, 786, 796)</div>
                  <FinancialRow label="Produits de participations, gains de change & reprises" amount={compteResultat.produits.financiers.produitsFinanciers.amount} aggregateItem={compteResultat.produits.financiers.produitsFinanciers} level={1} />
                  <FinancialRow label="Total II. Produits Financiers" amount={compteResultat.produits.financiers.total} isSubtotal />
                </div>

                {/* 3. Produits exceptionnels / HAO */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">III. Produits Exceptionnels / HAO (77, 787, 797, 84-88)</div>
                  <FinancialRow label="Produits exceptionnels de gestion et en capital" amount={compteResultat.produits.exceptionnels.produitsExceptionnels.amount} aggregateItem={compteResultat.produits.exceptionnels.produitsExceptionnels} level={1} />
                  <FinancialRow label="Total III. Produits Exceptionnels / HAO" amount={compteResultat.produits.exceptionnels.total} isSubtotal />
                </div>

                <FinancialRow label="TOTAL GÉNÉRAL DES PRODUITS (I + II + III)" amount={compteResultat.totalProduits} isTotal />
                {!compteResultat.isBenefice && (
                  <FinancialRow label="+ SOLDE DÉBITEUR (PERTE NETTE)" amount={compteResultat.solde} isSubtotal badge="Équilibre" />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================================================================== */}
        {/* ONGLET 2 : BILAN COMPTABLE DÉTAILLÉ MULTI-COLONNES                     */}
        {/* ==================================================================== */}
        <TabsContent value="bilan" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* ACTIF DÉTAILLÉ (BRUT / AMORT. / NET) */}
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-600" />
                    <CardTitle className="text-base font-bold text-slate-900">ACTIF (Emplois de l’entreprise)</CardTitle>
                  </div>
                </div>
                {/* En-tête des 3 colonnes */}
                <div className="grid grid-cols-[1fr_90px_90px_95px] text-[11px] font-bold uppercase tracking-wider text-slate-500 pt-3 px-3">
                  <span>Rubrique</span>
                  <span className="text-right">Brut</span>
                  <span className="text-right">Amort/Dép</span>
                  <span className="text-right">Net</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 space-y-4">
                
                {/* 1. Actif Immobilisé */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Actif Immobilisé (Classe 2)</div>
                  <ActifDetailedRow 
                    label="Immobilisations incorporelles (20)" 
                    brut={bilan.actif.actifImmobilise.incorporelles.amount} 
                    amort={0}
                    net={bilan.actif.actifImmobilise.incorporelles.amount}
                    aggregateBrut={bilan.actif.actifImmobilise.incorporelles}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="Immobilisations corporelles (21-23)" 
                    brut={bilan.actif.actifImmobilise.corporelles.amount} 
                    amort={0}
                    net={bilan.actif.actifImmobilise.corporelles.amount}
                    aggregateBrut={bilan.actif.actifImmobilise.corporelles}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="Immobilisations financières (26, 27)" 
                    brut={bilan.actif.actifImmobilise.financieres.amount} 
                    amort={0}
                    net={bilan.actif.actifImmobilise.financieres.amount}
                    aggregateBrut={bilan.actif.actifImmobilise.financieres}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="Amortissements & Dépréciations de l’actif immo (28, 29)" 
                    brut={0}
                    amort={bilan.actif.actifImmobilise.amortissements.amount}
                    net={-bilan.actif.actifImmobilise.amortissements.amount}
                    aggregateBrut={bilan.actif.actifImmobilise.amortissements}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="TOTAL ACTIF IMMOBILISÉ" 
                    brut={bilan.actif.actifImmobilise.brut}
                    amort={bilan.actif.actifImmobilise.amortissements.amount}
                    net={bilan.actif.actifImmobilise.totalNet}
                    isSubtotal
                  />
                </div>

                {/* 2. Actif Circulant */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Actif Circulant (Classes 3, 4, 5)</div>
                  <ActifDetailedRow 
                    label="Stocks & encours (Classe 3)" 
                    brut={bilan.actif.actifCirculant.stocks.brut.amount} 
                    amort={bilan.actif.actifCirculant.stocks.depreciations.amount}
                    net={bilan.actif.actifCirculant.stocks.totalNet}
                    aggregateBrut={bilan.actif.actifCirculant.stocks.brut}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="Créances clients & comptes rattachés (411-418)" 
                    brut={bilan.actif.actifCirculant.creancesClients.brut.amount} 
                    amort={bilan.actif.actifCirculant.creancesClients.depreciations.amount}
                    net={bilan.actif.actifCirculant.creancesClients.totalNet}
                    aggregateBrut={bilan.actif.actifCirculant.creancesClients.brut}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="Autres créances & acomptes versés (409, 4456, 467)" 
                    brut={bilan.actif.actifCirculant.autresCreances.amount} 
                    amort={0}
                    net={bilan.actif.actifCirculant.autresCreances.amount}
                    aggregateBrut={bilan.actif.actifCirculant.autresCreances}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="Disponibilités & Banque (512, 53, 50)" 
                    brut={bilan.actif.actifCirculant.tresorerieActive.amount} 
                    amort={0}
                    net={bilan.actif.actifCirculant.tresorerieActive.amount}
                    aggregateBrut={bilan.actif.actifCirculant.tresorerieActive}
                    level={1}
                  />
                  <ActifDetailedRow 
                    label="TOTAL ACTIF CIRCULANT" 
                    brut={bilan.actif.actifCirculant.totalBrut}
                    amort={bilan.actif.actifCirculant.totalDepreciations}
                    net={bilan.actif.actifCirculant.totalNet}
                    isSubtotal
                  />
                </div>

                <ActifDetailedRow 
                  label="TOTAL GÉNÉRAL DE L’ACTIF" 
                  brut={bilan.actif.totalBrut}
                  amort={bilan.actif.totalAmortissements}
                  net={bilan.actif.totalNet}
                  isTotal
                />
              </CardContent>
            </Card>

            {/* PASSIF DÉTAILLÉ */}
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-purple-600" />
                    <CardTitle className="text-base font-bold text-slate-900">PASSIF (Ressources & Capitaux)</CardTitle>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Montant Net</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 space-y-4">
                
                {/* 1. Capitaux Propres */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Capitaux Propres (Classe 1)</div>
                  <FinancialRow label="Capital social ou individuel (101-103)" amount={bilan.passif.capitauxPropres.capitalSocial.amount} aggregateItem={bilan.passif.capitauxPropres.capitalSocial} level={1} />
                  <FinancialRow label="Primes d’émission, réserves & écarts (104, 106)" amount={bilan.passif.capitauxPropres.primesReserves.amount} aggregateItem={bilan.passif.capitauxPropres.primesReserves} level={1} />
                  <FinancialRow label="Report à nouveau (110 / 119)" amount={bilan.passif.capitauxPropres.reportANouveau.amount} aggregateItem={bilan.passif.capitauxPropres.reportANouveau} level={1} />
                  <FinancialRow label="Subventions d’investissement & Provisions réglementées (13, 14, 15)" amount={bilan.passif.capitauxPropres.provisionsReglementeesSubventions.amount} aggregateItem={bilan.passif.capitauxPropres.provisionsReglementeesSubventions} level={1} />
                  <FinancialRow label="Résultat net de l’exercice (Bénéfice ou Perte)" amount={bilan.passif.capitauxPropres.resultatNetExercice} level={1} badge="Résultat de l’année" />
                  <FinancialRow label="TOTAL CAPITAUX PROPRES" amount={bilan.passif.capitauxPropres.total} isSubtotal />
                </div>

                {/* 2. Dettes & Engagements */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Dettes & Engagements (Classes 1, 4, 5)</div>
                  <FinancialRow label="Emprunts et dettes financières LMT (16, 17)" amount={bilan.passif.dettesFinancieresStables.amount} aggregateItem={bilan.passif.dettesFinancieresStables} level={1} />
                  <FinancialRow label="Dettes fournisseurs & comptes rattachés (401, 408)" amount={bilan.passif.dettesExploitation.fournisseurs.amount} aggregateItem={bilan.passif.dettesExploitation.fournisseurs} level={1} />
                  <FinancialRow label="Dettes fiscales et sociales (42, 43, 44)" amount={bilan.passif.dettesExploitation.fiscalesSociales.amount} aggregateItem={bilan.passif.dettesExploitation.fiscalesSociales} level={1} />
                  <FinancialRow label="Autres dettes & acomptes clients reçus (419, 455, 467)" amount={bilan.passif.autresDettesPassif.amount} aggregateItem={bilan.passif.autresDettesPassif} level={1} />
                  <FinancialRow label="Concours bancaires courants & Découverts (519)" amount={bilan.passif.tresoreriePassive.amount} aggregateItem={bilan.passif.tresoreriePassive} level={1} />
                  <FinancialRow label="TOTAL DES DETTES" amount={bilan.passif.dettes.total} isSubtotal />
                </div>

                <FinancialRow label="TOTAL GÉNÉRAL DU PASSIF" amount={bilan.passif.total} isTotal />
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* ==================================================================== */}
        {/* ONGLET 3 : SOLDES INTERMÉDIAIRES DE GESTION (SIG)                     */}
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
        {/* ONGLET 4 : BILAN FONCTIONNEL, FRNG, BFR & TRÉSORERIE NETTE            */}
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
        {/* ONGLET 5 : SEUIL DE RENTABILITÉ & POINT MORT                          */}
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
            {/* Synthèse du poste */}
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

            {/* Liste des comptes contributeurs avec débits, crédits et solde */}
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
            className={cn(
              "font-mono",
              isTotal ? "text-lg text-white font-bold" : isSubtotal ? "text-slate-900 font-bold" : "text-slate-800",
              isNegative && amount > 0 && "text-rose-600"
            )} 
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-16">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              États Financiers
            </h1>
            <Badge variant="outline" className="font-mono text-xs px-2.5 py-1 bg-slate-100/80 text-slate-700 border-slate-300">
              {planCode} • {planCode === 'SYSCOHADA' ? 'Système Comptable OHADA' : 'Plan Comptable Général Français'}
            </Badge>
          </div>
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            Bilan comptable, Soldes Intermédiaires de Gestion et Bilan Fonctionnel calculés à partir de vos comptes
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 uppercase">Exercice :</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28 h-8 font-bold border-0 shadow-none focus:ring-0">
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

      {/* Barre d'alerte équilibre comptable */}
      <div className={cn(
        "p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs",
        bilan.isBalanced 
          ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" 
          : "bg-amber-50/70 border-amber-200 text-amber-900"
      )}>
        <div className="flex items-center gap-3">
          {bilan.isBalanced ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          )}
          <div>
            <span className="text-sm font-bold">
              {bilan.isBalanced ? 'Équilibre comptable parfait (Actif = Passif)' : 'Contrôle d’équilibre à vérifier'}
            </span>
            <p className="text-xs text-slate-600 mt-0.5">
              Total Actif Net : <strong>{bilan.actif.totalNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong> · 
              Total Passif : <strong>{bilan.passif.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</strong>
              {!bilan.isBalanced && ` (Écart : ${bilan.ecart.toFixed(2)} €)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Badge variant="secondary" className="bg-white/80 border border-slate-200 text-slate-800 text-xs">
            {yearEntries.length} écritures validées en {selectedYear}
          </Badge>
        </div>
      </div>

      {/* Onglets des États Financiers */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="sig" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <TrendingUp className="h-4 w-4 mr-1.5 text-blue-600" />
            Soldes Intermédiaires (SIG)
          </TabsTrigger>
          <TabsTrigger value="bilan" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <Building className="h-4 w-4 mr-1.5 text-purple-600" />
            Bilan Comptable
          </TabsTrigger>
          <TabsTrigger value="fonctionnel" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
            <Scale className="h-4 w-4 mr-1.5 text-emerald-600" />
            Bilan Fonctionnel & BFR
          </TabsTrigger>
          <TabsTrigger value="seuil" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
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
                <FinancialRow label="- Charges de personnel (Salaires & Charges 64)" amount={sig.ebe.chargesPersonnel.amount} aggregateItem={sig.ebe.chargesPersonnel} isNegative level={1} />
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
        {/* ONGLET 2 : BILAN COMPTABLE NORMALISÉ                                   */}
        {/* ==================================================================== */}
        <TabsContent value="bilan" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ACTIF */}
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-600" />
                    <CardTitle className="text-base font-bold text-slate-900">ACTIF (Emplois)</CardTitle>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Valeur Nette</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Actif Immobilisé */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Actif Immobilisé (Cl. 2)</div>
                  <FinancialRow label="Immobilisations incorporelles (20)" amount={bilan.actif.actifImmobilise.incorporelles.amount} aggregateItem={bilan.actif.actifImmobilise.incorporelles} level={1} />
                  <FinancialRow label="Immobilisations corporelles (21-23)" amount={bilan.actif.actifImmobilise.corporelles.amount} aggregateItem={bilan.actif.actifImmobilise.corporelles} level={1} />
                  <FinancialRow label="Immobilisations financières (26, 27)" amount={bilan.actif.actifImmobilise.financieres.amount} aggregateItem={bilan.actif.actifImmobilise.financieres} level={1} />
                  <FinancialRow label="- Amortissements & Dépréciations (28, 29)" amount={bilan.actif.actifImmobilise.amortissements.amount} aggregateItem={bilan.actif.actifImmobilise.amortissements} isNegative level={1} />
                  <FinancialRow label="Total Actif Immobilisé Net" amount={bilan.actif.actifImmobilise.totalNet} isSubtotal />
                </div>

                {/* Actif Circulant */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Actif Circulant (Cl. 3, 4, 5)</div>
                  <FinancialRow label="Stocks & en-cours nets (Classe 3)" amount={bilan.actif.actifCirculant.stocks.totalNet} aggregateItem={bilan.actif.actifCirculant.stocks.brut} level={1} />
                  <FinancialRow label="Créances clients & comptes rattachés (411)" amount={bilan.actif.actifCirculant.creancesClients.totalNet} aggregateItem={bilan.actif.actifCirculant.creancesClients.brut} level={1} />
                  <FinancialRow label="Autres créances & acomptes (409, 4456, 467)" amount={bilan.actif.actifCirculant.autresCreances.amount} aggregateItem={bilan.actif.actifCirculant.autresCreances} level={1} />
                  <FinancialRow label="Disponibilités & Banque (512, 53, 50)" amount={bilan.actif.actifCirculant.tresorerieActive.amount} aggregateItem={bilan.actif.actifCirculant.tresorerieActive} level={1} />
                  <FinancialRow label="Total Actif Circulant Net" amount={bilan.actif.actifCirculant.totalNet} isSubtotal />
                </div>

                <FinancialRow label="TOTAL GÉNÉRAL DE L’ACTIF" amount={bilan.actif.totalNet} isTotal />
              </CardContent>
            </Card>

            {/* PASSIF */}
            <Card className="rounded-3xl border-slate-200/90 shadow-xs overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-purple-600" />
                    <CardTitle className="text-base font-bold text-slate-900">PASSIF (Ressources)</CardTitle>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Montant</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Capitaux Propres */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Capitaux Propres (Cl. 1)</div>
                  <FinancialRow label="Capital, réserves, report à nouveau (10, 11)" amount={bilan.passif.capitauxPropres.capitalReserves.amount} aggregateItem={bilan.passif.capitauxPropres.capitalReserves} level={1} />
                  <FinancialRow label="Résultat net de l’exercice (calculé)" amount={bilan.passif.capitauxPropres.resultatNetExercice} level={1} badge="Dynamique" />
                  <FinancialRow label="Total Capitaux Propres" amount={bilan.passif.capitauxPropres.total} isSubtotal />
                </div>

                {/* Dettes */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Dettes & Engagements (Cl. 1, 4, 5)</div>
                  <FinancialRow label="Emprunts et dettes financières LMT (16, 17)" amount={bilan.passif.dettesFinancieresStables.amount} aggregateItem={bilan.passif.dettesFinancieresStables} level={1} />
                  <FinancialRow label="Dettes fournisseurs & comptes rattachés (401)" amount={bilan.passif.dettesExploitation.fournisseurs.amount} aggregateItem={bilan.passif.dettesExploitation.fournisseurs} level={1} />
                  <FinancialRow label="Dettes fiscales et sociales (42, 43, 4457)" amount={bilan.passif.dettesExploitation.fiscalesSociales.amount} aggregateItem={bilan.passif.dettesExploitation.fiscalesSociales} level={1} />
                  <FinancialRow label="Autres dettes & acomptes reçus (419, 455, 467)" amount={bilan.passif.autresDettesPassif.amount} aggregateItem={bilan.passif.autresDettesPassif} level={1} />
                  <FinancialRow label="Concours bancaires courants / Découverts (519)" amount={bilan.passif.tresoreriePassive.amount} aggregateItem={bilan.passif.tresoreriePassive} level={1} />
                  <FinancialRow label="Total Dettes" amount={bilan.passif.total - bilan.passif.capitauxPropres.total} isSubtotal />
                </div>

                <FinancialRow label="TOTAL GÉNÉRAL DU PASSIF" amount={bilan.passif.total} isTotal />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================================================================== */}
        {/* ONGLET 3 : BILAN FONCTIONNEL, FRNG, BFR & TRÉSORERIE NETTE            */}
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
        {/* ONGLET 4 : SEUIL DE RENTABILITÉ & POINT MORT                          */}
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
            {/* Synthèse du poste */}
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

            {/* Liste des comptes contributeurs avec débits, crédits et solde */}
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
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
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