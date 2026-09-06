import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, TrendingUp, AlertCircle } from 'lucide-react';
import AmountDisplay from '@/components/common/AmountDisplay';
import { startOfYear, endOfYear } from 'date-fns';

export default function FinancialStatements() {
  const { user } = useUser();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id); if (error) throw error; return data; },
    enabled: !!user?.active_company_id
  });

  // Filtrer par année
  const yearEntries = useMemo(() => {
    return entries.filter(e => {
      const year = new Date(e.date).getFullYear().toString();
      return year === selectedYear;
    });
  }, [entries, selectedYear]);

  // Calcul du bilan comptable
  const bilanComptable = useMemo(() => {
    const actif = {
      immobilisations: 0, // Classe 2
      stocks: 0, // Classe 3
      creances: 0, // Classe 4 (clients)
      tresorerie: 0, // Classe 5
    };

    const passif = {
      capitaux: 0, // Classe 1
      dettes: 0, // Classe 4 (fournisseurs)
      resultat: 0,
    };

    yearEntries.forEach(e => {
      const account = e.account_code || '';
      const solde = (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);

      if (account.startsWith('2')) {
        actif.immobilisations += solde;
      } else if (account.startsWith('3')) {
        actif.stocks += solde;
      } else if (account.startsWith('41')) {
        actif.creances += solde;
      } else if (account.startsWith('5')) {
        actif.tresorerie += solde;
      } else if (account.startsWith('1')) {
        passif.capitaux += -solde;
      } else if (account.startsWith('40')) {
        passif.dettes += -solde;
      } else if (account.startsWith('6')) {
        passif.resultat -= (parseFloat(e.debit) || 0);
      } else if (account.startsWith('7')) {
        passif.resultat += (parseFloat(e.credit) || 0);
      }
    });

    actif.total = actif.immobilisations + actif.stocks + actif.creances + actif.tresorerie;
    passif.total = passif.capitaux + passif.dettes + passif.resultat;

    return { actif, passif };
  }, [yearEntries]);

  // Calcul des SIG (Soldes Intermédiaires de Gestion)
  const sig = useMemo(() => {
    let production = 0;
    let achats = 0;
    let chargesExternes = 0;
    let impots = 0;
    let salaires = 0;
    let dotations = 0;
    let autresCharges = 0;
    let produitsFinanciers = 0;
    let chargesFinancieres = 0;
    let produitsExceptionnels = 0;
    let chargesExceptionnelles = 0;

    yearEntries.forEach(e => {
      const account = e.account_code || '';
      
      if (account.startsWith('70')) production += (parseFloat(e.credit) || 0);
      else if (account.startsWith('60')) achats += (parseFloat(e.debit) || 0);
      else if (account.startsWith('61') || account.startsWith('62')) chargesExternes += (parseFloat(e.debit) || 0);
      else if (account.startsWith('63')) impots += (parseFloat(e.debit) || 0);
      else if (account.startsWith('64')) salaires += (parseFloat(e.debit) || 0);
      else if (account.startsWith('681')) dotations += (parseFloat(e.debit) || 0);
      else if (account.startsWith('65') || account.startsWith('66') || account.startsWith('67')) autresCharges += (parseFloat(e.debit) || 0);
      else if (account.startsWith('76') || account.startsWith('786')) produitsFinanciers += (parseFloat(e.credit) || 0);
      else if (account.startsWith('66') || account.startsWith('686')) chargesFinancieres += (parseFloat(e.debit) || 0);
      else if (account.startsWith('77') || account.startsWith('787')) produitsExceptionnels += (parseFloat(e.credit) || 0);
      else if (account.startsWith('67') || account.startsWith('687')) chargesExceptionnelles += (parseFloat(e.debit) || 0);
    });

    const margeCommerciale = production - achats;
    const valeurAjoutee = margeCommerciale - chargesExternes;
    const ebe = valeurAjoutee - impots - salaires;
    const resultatExploitation = ebe - dotations - autresCharges;
    const resultatFinancier = produitsFinanciers - chargesFinancieres;
    const resultatCourant = resultatExploitation + resultatFinancier;
    const resultatExceptionnel = produitsExceptionnels - chargesExceptionnelles;
    const resultatNet = resultatCourant + resultatExceptionnel;

    const tauxMarge = production > 0 ? (margeCommerciale / production * 100) : 0;
    const tauxVA = production > 0 ? (valeurAjoutee / production * 100) : 0;
    const tauxEBE = production > 0 ? (ebe / production * 100) : 0;

    return {
      production,
      achats,
      margeCommerciale,
      chargesExternes,
      valeurAjoutee,
      impots,
      salaires,
      ebe,
      dotations,
      resultatExploitation,
      resultatFinancier,
      resultatCourant,
      resultatExceptionnel,
      resultatNet,
      tauxMarge,
      tauxVA,
      tauxEBE
    };
  }, [yearEntries]);

  // Calcul FRNG, BFR, Trésorerie
  const frngBfrTreso = useMemo(() => {
    const frng = bilanComptable.passif.capitaux - bilanComptable.actif.immobilisations;
    const bfr = (bilanComptable.actif.stocks + bilanComptable.actif.creances) - bilanComptable.passif.dettes;
    const tresorerie = frng - bfr;

    return { frng, bfr, tresorerie };
  }, [bilanComptable]);

  // Seuil de rentabilité
  const seuilRentabilite = useMemo(() => {
    const chargesVariables = sig.achats;
    const chargesFixes = sig.chargesExternes + sig.impots + sig.salaires;
    const ca = sig.production;
    
    const tauxMargeVariable = ca > 0 ? ((ca - chargesVariables) / ca) : 0;
    const seuilCA = tauxMargeVariable > 0 ? (chargesFixes / tauxMargeVariable) : 0;
    const pointMort = 365 * (seuilCA / ca);
    const margeSecurite = ca - seuilCA;
    const tauxMargeSecurite = ca > 0 ? (margeSecurite / ca * 100) : 0;

    return {
      chargesVariables,
      chargesFixes,
      seuilCA,
      pointMort,
      margeSecurite,
      tauxMargeSecurite,
      atteint: ca >= seuilCA
    };
  }, [sig]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="États Financiers"
        subtitle="Bilans, SIG et indicateurs de gestion"
        actions={
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="sig" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sig">SIG</TabsTrigger>
          <TabsTrigger value="bilan">Bilan</TabsTrigger>
          <TabsTrigger value="frng">FRNG/BFR</TabsTrigger>
          <TabsTrigger value="seuil">Seuil de rentabilité</TabsTrigger>
        </TabsList>

        <TabsContent value="sig" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Soldes Intermédiaires de Gestion {selectedYear}</CardTitle>
              <CardDescription>Analyse de la performance par niveau</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Production vendue</p>
                    <AmountDisplay amount={sig.production} size="lg" className="font-bold text-blue-700" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Achats consommés</p>
                    <AmountDisplay amount={sig.achats} size="lg" className="font-bold text-red-600" />
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-xl border-l-4 border-emerald-500">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-slate-600">Marge commerciale</p>
                      <p className="text-xs text-slate-500 mt-1">Taux: {sig.tauxMarge.toFixed(1)}%</p>
                    </div>
                    <AmountDisplay amount={sig.margeCommerciale} size="lg" className="font-bold text-emerald-700" />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">- Charges externes</p>
                    <AmountDisplay amount={sig.chargesExternes} size="sm" className="text-red-600" />
                  </div>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl border-l-4 border-purple-500">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-slate-600">Valeur ajoutée</p>
                      <p className="text-xs text-slate-500 mt-1">Taux: {sig.tauxVA.toFixed(1)}%</p>
                    </div>
                    <AmountDisplay amount={sig.valeurAjoutee} size="lg" className="font-bold text-purple-700" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">- Impôts et taxes</p>
                    <AmountDisplay amount={sig.impots} size="sm" className="text-red-600" />
                  </div>
                  <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">- Charges de personnel</p>
                    <AmountDisplay amount={sig.salaires} size="sm" className="text-red-600" />
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border-l-4 border-amber-500">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-slate-600">EBE (Excédent Brut d'Exploitation)</p>
                      <p className="text-xs text-slate-500 mt-1">Taux: {sig.tauxEBE.toFixed(1)}%</p>
                    </div>
                    <AmountDisplay amount={sig.ebe} size="lg" className="font-bold text-amber-700" />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">- Dotations aux amortissements</p>
                    <AmountDisplay amount={sig.dotations} size="sm" className="text-red-600" />
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-xl border-l-4 border-indigo-500">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">Résultat d'exploitation</p>
                    <AmountDisplay amount={sig.resultatExploitation} size="lg" className="font-bold text-indigo-700" />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">+/- Résultat financier</p>
                    <AmountDisplay amount={sig.resultatFinancier} size="sm" showSign />
                  </div>
                </div>

                <div className="p-4 bg-cyan-50 rounded-xl border-l-4 border-cyan-500">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">Résultat courant</p>
                    <AmountDisplay amount={sig.resultatCourant} size="lg" className="font-bold text-cyan-700" />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">+/- Résultat exceptionnel</p>
                    <AmountDisplay amount={sig.resultatExceptionnel} size="sm" showSign />
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl">
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-semibold text-white">RÉSULTAT NET</p>
                    <AmountDisplay amount={sig.resultatNet} size="xl" className="font-bold text-white" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bilan" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>ACTIF</CardTitle>
                <CardDescription>Emplois</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 bg-blue-50 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold text-slate-700">Actif immobilisé</p>
                    <AmountDisplay amount={bilanComptable.actif.immobilisations} size="lg" className="font-bold" />
                  </div>
                  <p className="text-xs text-slate-500">Classe 2</p>
                </div>

                <div className="space-y-2">
                  <p className="font-semibold text-slate-700">Actif circulant</p>
                  <div className="pl-4 space-y-2">
                    <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Stocks</span>
                      <AmountDisplay amount={bilanComptable.actif.stocks} size="sm" />
                    </div>
                    <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Créances clients</span>
                      <AmountDisplay amount={bilanComptable.actif.creances} size="sm" />
                    </div>
                    <div className="flex justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Trésorerie</span>
                      <AmountDisplay amount={bilanComptable.actif.tresorerie} size="sm" />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-800 text-white rounded-xl mt-4">
                  <div className="flex justify-between items-center">
                    <p className="font-bold">TOTAL ACTIF</p>
                    <AmountDisplay amount={bilanComptable.actif.total} size="lg" className="font-bold text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PASSIF</CardTitle>
                <CardDescription>Ressources</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold text-slate-700">Capitaux propres</p>
                    <AmountDisplay amount={bilanComptable.passif.capitaux} size="lg" className="font-bold" />
                  </div>
                  <p className="text-xs text-slate-500">Classe 1</p>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold text-slate-700">Résultat de l'exercice</p>
                    <AmountDisplay 
                      amount={bilanComptable.passif.resultat} 
                      size="lg" 
                      className={bilanComptable.passif.resultat >= 0 ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}
                    />
                  </div>
                </div>

                <div className="p-4 bg-red-50 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-semibold text-slate-700">Dettes</p>
                    <AmountDisplay amount={bilanComptable.passif.dettes} size="lg" className="font-bold" />
                  </div>
                  <p className="text-xs text-slate-500">Dettes fournisseurs</p>
                </div>

                <div className="p-4 bg-slate-800 text-white rounded-xl mt-4">
                  <div className="flex justify-between items-center">
                    <p className="font-bold">TOTAL PASSIF</p>
                    <AmountDisplay amount={bilanComptable.passif.total} size="lg" className="font-bold text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frng" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>FRNG</CardTitle>
                <CardDescription>Fonds de Roulement Net Global</CardDescription>
              </CardHeader>
              <CardContent>
                <AmountDisplay 
                  amount={frngBfrTreso.frng} 
                  size="xl" 
                  className={frngBfrTreso.frng >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}
                />
                <p className="text-xs text-slate-500 mt-3">
                  {frngBfrTreso.frng >= 0 
                    ? '✓ Ressources stables supérieures aux emplois stables' 
                    : '⚠️ Ressources stables insuffisantes'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>BFR</CardTitle>
                <CardDescription>Besoin en Fonds de Roulement</CardDescription>
              </CardHeader>
              <CardContent>
                <AmountDisplay 
                  amount={frngBfrTreso.bfr} 
                  size="xl" 
                  className={frngBfrTreso.bfr >= 0 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}
                />
                <p className="text-xs text-slate-500 mt-3">
                  {frngBfrTreso.bfr >= 0 
                    ? 'Besoin de financement du cycle d\'exploitation' 
                    : 'Ressource dégagée par le cycle'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trésorerie Nette</CardTitle>
                <CardDescription>TN = FRNG - BFR</CardDescription>
              </CardHeader>
              <CardContent>
                <AmountDisplay 
                  amount={frngBfrTreso.tresorerie} 
                  size="xl" 
                  className={frngBfrTreso.tresorerie >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}
                />
                <p className="text-xs text-slate-500 mt-3">
                  {frngBfrTreso.tresorerie >= 0 
                    ? '✓ Situation de trésorerie saine' 
                    : '⚠️ Trésorerie négative - attention'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Analyse de la situation financière</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-xl">
                  <h4 className="font-semibold text-slate-800 mb-2">Formule de calcul</h4>
                  <p className="text-sm text-slate-600">Trésorerie Nette = FRNG - BFR</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {frngBfrTreso.tresorerie.toLocaleString('fr-FR')} € = {frngBfrTreso.frng.toLocaleString('fr-FR')} € - {frngBfrTreso.bfr.toLocaleString('fr-FR')} €
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl">
                  <h4 className="font-semibold text-slate-800 mb-2">Interprétation</h4>
                  {frngBfrTreso.frng > 0 && frngBfrTreso.bfr > 0 && frngBfrTreso.tresorerie > 0 && (
                    <p className="text-sm text-emerald-700">
                      ✓ Situation idéale : Le FRNG couvre le BFR et génère une trésorerie positive.
                    </p>
                  )}
                  {frngBfrTreso.frng > 0 && frngBfrTreso.tresorerie < 0 && (
                    <p className="text-sm text-amber-700">
                      ⚠️ Le FRNG ne suffit pas à couvrir le BFR. Besoin de financement à court terme.
                    </p>
                  )}
                  {frngBfrTreso.frng < 0 && (
                    <p className="text-sm text-red-700">
                      ⛔ FRNG négatif : Les ressources stables ne couvrent pas les emplois stables. Situation préoccupante.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seuil" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Seuil de Rentabilité {selectedYear}</CardTitle>
              <CardDescription>Point mort et marge de sécurité</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-600 mb-1">Charges variables</p>
                  <AmountDisplay amount={seuilRentabilite.chargesVariables} size="lg" className="font-bold" />
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-600 mb-1">Charges fixes</p>
                  <AmountDisplay amount={seuilRentabilite.chargesFixes} size="lg" className="font-bold" />
                </div>
              </div>

              <div className={`p-6 rounded-xl ${seuilRentabilite.atteint ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-3 mb-4">
                  {seuilRentabilite.atteint ? (
                    <>
                      <TrendingUp className="h-8 w-8 text-emerald-600" />
                      <div>
                        <h3 className="text-lg font-bold text-emerald-800">Seuil atteint ✓</h3>
                        <p className="text-sm text-emerald-600">L'entreprise est rentable</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-8 w-8 text-red-600" />
                      <div>
                        <h3 className="text-lg font-bold text-red-800">Seuil non atteint</h3>
                        <p className="text-sm text-red-600">L'entreprise n'est pas encore rentable</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Seuil de rentabilité (CA)</p>
                    <AmountDisplay amount={seuilRentabilite.seuilCA} size="xl" className="font-bold text-slate-800" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Point mort</p>
                    <p className="text-3xl font-bold text-slate-800">
                      {seuilRentabilite.pointMort.toFixed(0)} jours
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-slate-600 mb-1">Marge de sécurité</p>
                <AmountDisplay amount={seuilRentabilite.margeSecurite} size="lg" className="font-bold text-blue-700" />
                <p className="text-xs text-slate-500 mt-2">
                  Soit {seuilRentabilite.tauxMargeSecurite.toFixed(1)}% du CA
                </p>
              </div>

              <Card className="bg-slate-50">
                <CardHeader>
                  <CardTitle className="text-base">Formules utilisées</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  <p>• Taux de marge sur coût variable = (CA - Charges variables) / CA</p>
                  <p>• Seuil de rentabilité = Charges fixes / Taux de marge variable</p>
                  <p>• Point mort = (Seuil de rentabilité / CA annuel) × 365 jours</p>
                  <p>• Marge de sécurité = CA réalisé - Seuil de rentabilité</p>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}