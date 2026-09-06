import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/components/hooks/useUser';
import { useThirdParties } from '@/components/hooks/useCompanyData';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '../components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, Upload, FileText, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ScanInvoice() {
  const { user } = useUser();
  const { data: thirdParties = [] } = useThirdParties();
  const [category, setCategory] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [creating, setCreating] = useState(false);

  const queryClient = useQueryClient();

  const categories = [
    { value: 'achats', label: 'Achats', icon: '🛒', journal: 'AC', accounts: { expense: '607000', vat: '445660', third: '401000' } },
    { value: 'ventes', label: 'Ventes', icon: '💰', journal: 'VE', accounts: { revenue: '707000', vat: '445710', third: '411000' } },
    { value: 'impots', label: 'Impôts & Taxes', icon: '🏛️', journal: 'OD', accounts: { expense: '635000', third: '447000' } },
    { value: 'salaires', label: 'Salaires', icon: '👥', journal: 'OD', accounts: { expense: '641000', third: '421000' } },
    { value: 'banque', label: 'Opérations bancaires', icon: '🏦', journal: 'BQ', accounts: { bank: '512000' } },
  ];

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractedData(null);
      setEntries([]);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    // Vérification critique: utilisateur et société
    if (!user || !user.active_company_id) {
      toast.error('Veuillez sélectionner une société avant d\'extraire');
      return;
    }

    // S'assurer que company_ids est initialisé
    if (!user.company_ids || !Array.isArray(user.company_ids) || user.company_ids.length === 0) {
      toast.error('Initialisation en cours, veuillez réessayer dans quelques secondes');
      return;
    }

    setLoading(true);
    try {
      // Upload le fichier
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Utiliser les tiers du hook
      const thirdPartiesInfo = thirdParties.map(tp => ({
        name: tp.name,
        code: tp.code,
        account_code: tp.account_code,
        tva_number: tp.tva_number,
        siret: tp.siret
      }));

      // Prompt LLM ultra-professionnel et structuré
      const prompt = `Tu es un expert comptable professionnel. Analyse cette facture avec PRÉCISION MAXIMALE et extrait CHAQUE élément.

═══════════════════════════════════════════════════
SECTION 1: IDENTIFICATION DU DOCUMENT
═══════════════════════════════════════════════════
→ NUMÉRO DE FACTURE (obligatoire):
   Cherche: "Facture n°", "Invoice #", "FA", "FACT", numéro unique en haut du document
   Format attendu: texte alphanumérique (ex: "FA-2024-001", "INV123")

→ ÉMETTEUR (fournisseur/client):
   - Cherche le nom de société en HAUT du document (généralement en gros caractères)
   - Compare avec ces tiers existants: ${thirdPartiesInfo.map(t => t.name).join(', ')}
   - Si match trouvé, utilise EXACTEMENT le nom du tiers existant
   - Cherche aussi: SIRET, SIREN, TVA intracommunautaire si présents

═══════════════════════════════════════════════════
SECTION 2: DATES (format YYYY-MM-DD strict)
═══════════════════════════════════════════════════
→ DATE D'ÉMISSION: date de la facture
→ DATE D'ÉCHÉANCE: date de paiement (peut être calculée: émission + délai de paiement)
   Si échéance absente: utilise date émission + 30 jours

═══════════════════════════════════════════════════
SECTION 3: MONTANTS FINANCIERS (CRITIQUE)
═══════════════════════════════════════════════════
Cherche le TABLEAU RÉCAPITULATIF en bas de facture:

→ TOTAL HT (Hors Taxes): montant avant TVA
   Mots-clés: "Total HT", "Montant HT", "Subtotal", "Net HT"
   
→ TVA: montant de la taxe
   Mots-clés: "TVA", "VAT", "Taxe"
   
→ TOTAL TTC (Toutes Taxes Comprises): montant FINAL à payer
   Mots-clés: "Total TTC", "Total à payer", "Net à payer", "Amount Due"
   
→ TAUX DE TVA: pourcentage (20%, 10%, 5.5%, 2.1%, 0%)

⚠️ VALIDATION OBLIGATOIRE:
   TTC = HT + TVA (tolérance ±0.50€)
   Si incohérent, recalcule: HT = TTC / (1 + taux/100)

═══════════════════════════════════════════════════
SECTION 4: LIGNES D'ARTICLES DÉTAILLÉES
═══════════════════════════════════════════════════
Pour CHAQUE ligne du tableau principal (produits/services):

→ description: nom complet du produit/service
→ quantity: quantité (nombre décimal, ex: 1.5, 2, 10)
→ unit_price: prix unitaire HT (nombre décimal)
→ vat_rate: taux TVA de cette ligne (%)
→ total_ht: montant total HT de la ligne (quantity × unit_price)

Extrais TOUTES les lignes visibles dans le tableau.

═══════════════════════════════════════════════════
SECTION 5: DESCRIPTION GÉNÉRALE
═══════════════════════════════════════════════════
→ description: résumé de la prestation/objet de la facture
   (ex: "Prestation conseil", "Achat marchandises", "Services informatiques")

═══════════════════════════════════════════════════
RÈGLES TECHNIQUES STRICTES
═══════════════════════════════════════════════════
✓ Tous les montants = NOMBRES purs (pas de texte, pas d'unités)
✓ Dates = format ISO YYYY-MM-DD uniquement
✓ Si donnée manquante: mettre 0 pour nombres, "" pour textes
✓ Arrondir les montants à 2 décimales
✓ Ne JAMAIS inventer de données, extraire uniquement ce qui est visible`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            invoice_number: { type: 'string' },
            supplier_name: { type: 'string' },
            date: { type: 'string' },
            due_date: { type: 'string' },
            amount_ht: { type: 'number' },
            amount_tva: { type: 'number' },
            amount_ttc: { type: 'number' },
            tva_rate: { type: 'number' },
            description: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price: { type: 'number' },
                  vat_rate: { type: 'number' },
                  total_ht: { type: 'number' }
                }
              }
            }
          },
          required: ['invoice_number', 'supplier_name', 'amount_ht', 'amount_tva', 'amount_ttc', 'tva_rate']
        }
      });

      if (result) {
        // VALIDATION PROFESSIONNELLE DES DONNÉES EXTRAITES
        let amountHt = Math.round((parseFloat(result.amount_ht) || 0) * 100) / 100;
        let amountTva = Math.round((parseFloat(result.amount_tva) || 0) * 100) / 100;
        let amountTtc = Math.round((parseFloat(result.amount_ttc) || 0) * 100) / 100;
        const tvaRate = parseFloat(result.tva_rate) || 20;

        // COHÉRENCE DES MONTANTS (validation comptable)
        if (amountTtc > 0 && Math.abs(amountTtc - (amountHt + amountTva)) > 0.50) {
          // Recalculer HT et TVA si incohérence
          amountHt = Math.round((amountTtc / (1 + tvaRate / 100)) * 100) / 100;
          amountTva = Math.round((amountTtc - amountHt) * 100) / 100;
          toast.warning('Montants recalculés pour cohérence comptable');
        }

        // Normalisation complète
        const data = {
          ...result,
          invoice_number: (result.invoice_number || `SCAN-${Date.now()}`).trim(),
          supplier_name: (result.supplier_name || '').trim(),
          date: result.date || format(new Date(), 'yyyy-MM-dd'),
          due_date: result.due_date || format(new Date(), 'yyyy-MM-dd'),
          description: (result.description || '').trim(),
          amount_ht: amountHt,
          amount_tva: amountTva,
          amount_ttc: amountTtc,
          tva_rate: tvaRate,
          items: (result.items || []).map(item => ({
            description: (item.description || 'Article').trim(),
            quantity: Math.round((parseFloat(item.quantity) || 1) * 100) / 100,
            unit_price: Math.round((parseFloat(item.unit_price) || 0) * 100) / 100,
            vat_rate: parseFloat(item.vat_rate) || tvaRate,
            total_ht: Math.round((parseFloat(item.total_ht) || 0) * 100) / 100
          }))
        };
        
        // Recherche intelligente du tiers
        let matchedThirdParty = null;
        if (data.supplier_name) {
          matchedThirdParty = thirdParties.find(tp => 
            tp.name.toLowerCase().includes(data.supplier_name.toLowerCase()) ||
            data.supplier_name.toLowerCase().includes(tp.name.toLowerCase())
          );
        }
        
        const finalData = {
          ...data,
          file_url,
          supplier_name: matchedThirdParty?.name || data.supplier_name,
          third_party_id: matchedThirdParty?.id,
          account_code: matchedThirdParty?.account_code
        };
        
        setExtractedData(finalData);

        // Générer les écritures comptables selon la catégorie
        const cat = categories.find(c => c.value === category);
        let invoiceEntries = [];

        if (category === 'achats') {
          const ht = Math.round((parseFloat(finalData.amount_ht) || 0) * 100) / 100;
          const tva = Math.round((parseFloat(finalData.amount_tva) || 0) * 100) / 100;
          const ttc = Math.round((parseFloat(finalData.amount_ttc) || 0) * 100) / 100;
          
          // ÉCRITURES PROFESSIONNELLES - ACHATS
          invoiceEntries = [
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: cat.accounts.expense,
              account_label: 'Achats de marchandises',
              label: `Fact. ${finalData.invoice_number} - ${finalData.supplier_name}${finalData.description ? ' - ' + finalData.description.substring(0, 50) : ''}`,
              debit: ht,
              credit: 0,
              reference: finalData.invoice_number
            },
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: cat.accounts.vat,
              account_label: `TVA déductible ${finalData.tva_rate}%`,
              label: `TVA fact. ${finalData.invoice_number}`,
              debit: tva,
              credit: 0,
              reference: finalData.invoice_number
            },
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: finalData.account_code || cat.accounts.third,
              account_label: `Fournisseur - ${finalData.supplier_name}`,
              label: `Fact. ${finalData.invoice_number} à payer`,
              debit: 0,
              credit: ttc,
              reference: finalData.invoice_number,
              third_party_name: finalData.supplier_name,
              third_party_id: finalData.third_party_id
            }
          ];
        } else if (category === 'ventes') {
          const ht = Math.round((parseFloat(finalData.amount_ht) || 0) * 100) / 100;
          const tva = Math.round((parseFloat(finalData.amount_tva) || 0) * 100) / 100;
          const ttc = Math.round((parseFloat(finalData.amount_ttc) || 0) * 100) / 100;
          
          // ÉCRITURES PROFESSIONNELLES - VENTES
          invoiceEntries = [
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: finalData.account_code || cat.accounts.third,
              account_label: `Client - ${finalData.supplier_name}`,
              label: `Fact. ${finalData.invoice_number} à encaisser`,
              debit: ttc,
              credit: 0,
              reference: finalData.invoice_number,
              third_party_name: finalData.supplier_name,
              third_party_id: finalData.third_party_id
            },
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: cat.accounts.revenue,
              account_label: 'Ventes de marchandises',
              label: `Fact. ${finalData.invoice_number} - ${finalData.supplier_name}${finalData.description ? ' - ' + finalData.description.substring(0, 50) : ''}`,
              debit: 0,
              credit: ht,
              reference: finalData.invoice_number
            },
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: cat.accounts.vat,
              account_label: `TVA collectée ${finalData.tva_rate}%`,
              label: `TVA fact. ${finalData.invoice_number}`,
              debit: 0,
              credit: tva,
              reference: finalData.invoice_number
            }
          ];
        } else {
          const ttc = Math.round((parseFloat(finalData.amount_ttc) || 0) * 100) / 100;
          
          // ÉCRITURES PROFESSIONNELLES - AUTRES OPÉRATIONS
          invoiceEntries = [
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: cat.accounts.expense || cat.accounts.bank,
              account_label: cat.label,
              label: `${finalData.supplier_name} - ${finalData.description || cat.label}`,
              debit: ttc,
              credit: 0,
              reference: finalData.invoice_number
            },
            {
              date: finalData.date,
              journal: cat.journal,
              account_code: finalData.account_code || cat.accounts.third || cat.accounts.bank,
              account_label: finalData.supplier_name || 'Tiers',
              label: `Règlement ${finalData.invoice_number}`,
              debit: 0,
              credit: ttc,
              reference: finalData.invoice_number,
              third_party_name: finalData.supplier_name,
              third_party_id: finalData.third_party_id
            }
          ];
        }

        setEntries(invoiceEntries);
        
        if (matchedThirdParty) {
          toast.success(`Tiers reconnu automatiquement : ${matchedThirdParty.name}`);
        } else {
          toast.success('Données extraites avec succès');
        }
      } else {
        toast.error('Erreur lors de l\'extraction');
      }
    } catch (error) {
      toast.error('Erreur lors du traitement du fichier');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEntries = async () => {
    if (!extractedData || entries.length === 0) return;

    // Vérification critique: utilisateur et société
    if (!user || !user.active_company_id) {
      toast.error('Veuillez sélectionner une société avant de créer les écritures');
      return;
    }

    // S'assurer que company_ids est initialisé
    if (!user.company_ids || !Array.isArray(user.company_ids) || user.company_ids.length === 0) {
      toast.error('Initialisation en cours, veuillez réessayer dans quelques secondes');
      return;
    }

    setCreating(true);
    try {
      // Vérifier les doublons
      const existingInvoices = await base44.entities.Invoice.list();
      const duplicate = existingInvoices.find(
        inv => inv.invoice_number === extractedData.invoice_number && 
               inv.third_party_name === extractedData.supplier_name
      );
      
      if (duplicate) {
        const duplicateDate = format(parseISO(duplicate.date), 'dd/MM/yyyy');
        toast.error(`Cette facture existe déjà (créée le ${duplicateDate})`);
        setCreating(false);
        return;
      }

      // Créer la facture avec montants garantis
      const invoice = await base44.entities.Invoice.create({
        company_id: user.active_company_id,
        invoice_number: extractedData.invoice_number || `FACT-${Date.now()}`,
        type: category === 'ventes' ? 'client' : 'fournisseur',
        date: extractedData.date || format(new Date(), 'yyyy-MM-dd'),
        due_date: extractedData.due_date || format(new Date(), 'yyyy-MM-dd'),
        third_party_name: extractedData.supplier_name || 'Fournisseur',
        third_party_id: extractedData.third_party_id,
        description: extractedData.description || '',
        amount_ht: parseFloat(extractedData.amount_ht) || 0,
        tva_rate: parseFloat(extractedData.tva_rate) || 20,
        amount_tva: parseFloat(extractedData.amount_tva) || 0,
        amount_ttc: parseFloat(extractedData.amount_ttc) || 0,
        status: 'validée',
        file_url: extractedData.file_url
      });

      // Créer les écritures comptables avec montants garantis numériques
      const entryNumber = `${entries[0]?.journal || 'OD'}-${invoice.invoice_number}`;
      for (const entry of entries) {
        await base44.entities.AccountingEntry.create({
          ...entry,
          entry_number: entryNumber,
          company_id: user.active_company_id,
          invoice_id: invoice.id,
          debit: parseFloat(entry.debit) || 0,
          credit: parseFloat(entry.credit) || 0,
          is_validated: false
        });
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });

      toast.success('Facture et écritures créées avec succès');
      
      // Reset
      setFile(null);
      setPreview(null);
      setExtractedData(null);
      setEntries([]);
    } catch (error) {
      toast.error('Erreur lors de la création des écritures');
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <PageHeader
          title="Scanner une facture"
          subtitle="Prenez en photo ou importez une facture pour générer automatiquement les écritures"
        />

      {!category ? (
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Choisissez une catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className="flex items-center gap-4 p-6 border-2 border-slate-200 rounded-xl hover:border-[#1e3a5f] hover:bg-slate-50 transition-all"
                  >
                    <span className="text-4xl">{cat.icon}</span>
                    <div className="text-left">
                      <p className="font-semibold text-slate-800">{cat.label}</p>
                      <p className="text-xs text-slate-500">Journal {cat.journal}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => { setCategory(null); setFile(null); setPreview(null); setExtractedData(null); setEntries([]); }}
            className="gap-2"
          >
            ← Changer de catégorie
          </Button>

          <div className="grid lg:grid-cols-2 gap-6">
        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Importer la facture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
                id="invoice-upload"
              />
              <label htmlFor="invoice-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                <p className="text-sm text-slate-600 mb-2">
                  Cliquez pour importer ou glissez une facture
                </p>
                <p className="text-xs text-slate-400">
                  Formats acceptés : JPG, PNG, PDF (mono ou multi-pages)
                </p>
              </label>
            </div>

            {preview && (
              <div className="mt-4">
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="w-full rounded-lg border border-slate-200 max-h-96 object-contain"
                />
                <Button
                  onClick={handleExtract}
                  disabled={loading}
                  className="w-full mt-4 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Extraction en cours...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Extraire les données
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Résultats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Données extraites
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!extractedData ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-sm text-slate-400">
                  Les données extraites apparaîtront ici
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-slate-500">N° Facture</Label>
                      <p className="font-medium">{extractedData.invoice_number || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500">Fournisseur</Label>
                      <p className="font-medium">
                        {extractedData.supplier_name || '-'}
                        {extractedData.third_party_id && (
                          <span className="ml-2 text-xs text-emerald-600">✓ Reconnu</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-slate-500">Date</Label>
                      <p className="font-medium">{extractedData.date || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-slate-500">Échéance</Label>
                      <p className="font-medium">{extractedData.due_date || '-'}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <Label className="text-slate-500">Montant HT</Label>
                        <p className="font-semibold text-slate-800">
                          {(extractedData.amount_ht || 0).toFixed(2)} €
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">TVA ({extractedData.tva_rate}%)</Label>
                        <p className="font-semibold text-slate-800">
                          {(extractedData.amount_tva || 0).toFixed(2)} €
                        </p>
                      </div>
                      <div>
                        <Label className="text-slate-500">Total TTC</Label>
                        <p className="font-bold text-lg text-[#1e3a5f]">
                          {(extractedData.amount_ttc || 0).toFixed(2)} €
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {extractedData.items && extractedData.items.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Lignes d'articles détaillées ({extractedData.items.length})
                    </Label>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-600 border-b border-slate-200">
                        <div className="col-span-5">Description</div>
                        <div className="col-span-2 text-right">Qté</div>
                        <div className="col-span-2 text-right">PU HT</div>
                        <div className="col-span-1 text-center">TVA</div>
                        <div className="col-span-2 text-right">Total HT</div>
                      </div>
                      {extractedData.items.map((item, idx) => (
                        <div 
                          key={idx}
                          className="px-3 py-2 grid grid-cols-12 gap-2 text-xs border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          <div className="col-span-5 text-slate-800">{item.description}</div>
                          <div className="col-span-2 text-right text-slate-600">{item.quantity}</div>
                          <div className="col-span-2 text-right text-slate-600">{item.unit_price?.toFixed(2)} €</div>
                          <div className="col-span-1 text-center text-slate-600">{item.vat_rate}%</div>
                          <div className="col-span-2 text-right font-semibold text-slate-800">{item.total_ht?.toFixed(2)} €</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {entries.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Écritures générées</Label>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {entries.map((entry, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-800">{entry.account_code}</p>
                            <p className="text-xs text-slate-500">{entry.account_label}</p>
                          </div>
                          <div className="text-right">
                            {entry.debit > 0 && (
                              <p className="font-semibold text-slate-800">
                                {entry.debit.toFixed(2)} € <span className="text-xs text-slate-500">Débit</span>
                              </p>
                            )}
                            {entry.credit > 0 && (
                              <p className="font-semibold text-slate-800">
                                {entry.credit.toFixed(2)} € <span className="text-xs text-slate-500">Crédit</span>
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={handleCreateEntries}
                      disabled={creating}
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:opacity-90"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Création en cours...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Valider et créer les écritures
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </div>
      )}
      </div>
    </ProtectedRoute>
  );
}