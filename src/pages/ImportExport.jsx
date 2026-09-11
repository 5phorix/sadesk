import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { extractStructuredData, uploadDocument } from '@/api/aiClient';
import { getSupabaseErrorMessage, toastSupabaseError } from '@/lib/supabase-errors';
import { buildFecRows, fecFileName, serializeFec, validateFec } from '@/lib/fec';
import { detectAccountingAnomalies } from '@/lib/accounting';
import { format } from 'date-fns';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { 
  Upload, 
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  FileCheck,
  ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PageHeader from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

export default function ImportExport() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('import');
  const [category, setCategory] = useState(null);
  const [importType, setImportType] = useState('invoices');
  const [exportType, setExportType] = useState('invoices');
  const [exportFormat, setExportFormat] = useState('csv');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearType, setClearType] = useState('');
  const [fecYear, setFecYear] = useState(new Date().getFullYear().toString());

  const queryClient = useQueryClient();

  const categories = [
    { value: 'achats', label: 'Achats', icon: '🛒' },
    { value: 'ventes', label: 'Ventes', icon: '💰' },
    { value: 'impots', label: 'Impôts & Taxes', icon: '🏛️' },
    { value: 'salaires', label: 'Salaires', icon: '👥' },
    { value: 'banque', label: 'Opérations bancaires', icon: '🏦' },
    { value: 'autre', label: 'Autre', icon: '📄' },
  ];

  // Charger les données avec filtre explicite pour éviter l'erreur RLS "$in needs an array"
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*').eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: thirdParties = [] } = useQuery({
    queryKey: ['thirdParties', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('third_parties').select('*').eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounting_entries').select('*').eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const { data: company } = useQuery({
    queryKey: ['company', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, siret')
        .eq('id', user.active_company_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
  });

  const anomalies = useMemo(
    () => detectAccountingAnomalies(entries, {
      knownAccountCodes: accounts.map((account) => account.code),
    }),
    [entries, accounts]
  );

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Vérification critique: utilisateur et société
    if (!user || !user.active_company_id) {
      toast.error('Veuillez sélectionner une société avant d\'importer');
      return;
    }

    // S'assurer que company_ids est initialisé
    if (!user.company_ids || !Array.isArray(user.company_ids) || user.company_ids.length === 0) {
      toast.error('Initialisation en cours, veuillez réessayer dans quelques secondes');
      return;
    }

    // Vérifier la taille selon le type de fichier
    const isPDF = file.name.toLowerCase().endsWith('.pdf');
    const maxSize = isPDF ? 10 * 1024 * 1024 : 50 * 1024 * 1024; // 10MB pour PDF, 50MB pour autres
    
    if (file.size > maxSize) {
      setUploadResult({ 
        success: false, 
        message: isPDF 
          ? `Les fichiers PDF sont limités à 10 MB (votre fichier: ${(file.size / 1024 / 1024).toFixed(1)} MB). Essayez de réduire la qualité ou diviser le document.`
          : `Le fichier est trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB). La taille maximale est de 50 MB.`
      });
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const { path: filePath } = await uploadDocument(file, user.active_company_id);

      const schemas = {
        invoices: {
          type: 'object',
          properties: {
            invoices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  invoice_number: { type: 'string' },
                  type: { type: 'string' },
                  date: { type: 'string' },
                  due_date: { type: 'string' },
                  third_party_name: { type: 'string' },
                  description: { type: 'string' },
                  amount_ht: { type: 'number' },
                  tva_rate: { type: 'number' },
                  amount_ttc: { type: 'number' },
                  status: { type: 'string' }
                }
              }
            }
          }
        },
        thirdparties: {
          type: 'object',
          properties: {
            thirdparties: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  type: { type: 'string' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  address: { type: 'string' },
                  postal_code: { type: 'string' },
                  city: { type: 'string' },
                  siret: { type: 'string' },
                  tva_number: { type: 'string' }
                }
              }
            }
          }
        },
        entries: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  journal: { type: 'string' },
                  account_code: { type: 'string' },
                  account_label: { type: 'string' },
                  label: { type: 'string' },
                  debit: { type: 'number' },
                  credit: { type: 'number' },
                  reference: { type: 'string' }
                }
              }
            }
          }
        },
        accounts: {
          type: 'object',
          properties: {
            accounts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  label: { type: 'string' },
                  class: { type: 'string' },
                  type: { type: 'string' },
                  category: { type: 'string' }
                }
              }
            }
          }
        }
      };

      const output = await extractStructuredData({
        companyId: user.active_company_id,
        prompt: `Extrais l'intégralité des lignes de type "${importType}" présentes dans ce document comptable. Respecte strictement le schéma JSON demandé : dates au format YYYY-MM-DD, montants en nombres décimaux, aucune valeur inventée.`,
        filePaths: [filePath],
        schema: schemas[importType]
      });

      let data = [];
      
      if (importType === 'invoices' && output.invoices) {
        data = output.invoices;
      } else if (importType === 'thirdparties' && output.thirdparties) {
        data = output.thirdparties;
      } else if (importType === 'entries' && output.entries) {
        data = output.entries;
      } else if (importType === 'accounts' && output.accounts) {
        data = output.accounts;
      }

      if (!Array.isArray(data) || data.length === 0) {
        setUploadResult({ success: false, message: 'Aucune donnée extraite du fichier' });
        return;
      }

      let created = 0;
      let skipped = 0;
      let skippedDetails = [];

      if (importType === 'invoices') {
        // Charger les factures existantes pour vérifier les doublons
        const existingInvoices = invoices;
        
        for (const item of data) {
          if (item.invoice_number && item.third_party_name) {
            // Vérifier si la facture existe déjà
            const duplicate = existingInvoices.find(
              inv => inv.invoice_number === item.invoice_number && 
                     inv.third_party_name === item.third_party_name
            );
            
            if (duplicate) {
              skipped++;
              skippedDetails.push(`${item.invoice_number} (existe depuis le ${format(new Date(duplicate.date), 'dd/MM/yyyy')})`);
              continue;
            }
            
            const { error } = await supabase.from('invoices').insert({
              ...item,
              company_id: user.active_company_id,
              amount_ht: item.amount_ht || 0,
              amount_tva: item.amount_tva || (item.amount_ttc - (item.amount_ht || 0)),
              amount_ttc: item.amount_ttc || 0,
              tva_rate: item.tva_rate || 20,
              status: item.status || 'brouillon',
              type: item.type || 'fournisseur',
              file_url: file_url
            });
            if (error) throw error;
            created++;
          }
        }
      } else if (importType === 'thirdparties') {
        // Charger les tiers existants pour vérifier les doublons
        const existingThirdParties = thirdParties;
        
        for (const item of data) {
          if (item.code && item.name) {
            // Vérifier si le tiers existe déjà
            const duplicate = existingThirdParties.find(
              tp => tp.code === item.code
            );
            
            if (duplicate) {
              skipped++;
              skippedDetails.push(`${item.code} - ${item.name} (existe déjà)`);
              continue;
            }
            
            const { error } = await supabase.from('third_parties').insert({
              ...item,
              company_id: user.active_company_id,
              type: item.type || 'client',
              is_active: true
            });
            if (error) throw error;
            created++;
          }
        }
      } else if (importType === 'entries') {
        for (const item of data) {
          if (item.date && item.account_code && item.label) {
            const { error } = await supabase.from('accounting_entries').insert({
              ...item,
              company_id: user.active_company_id,
              entry_number: item.entry_number || `IMP-${Date.now()}-${created}`,
              debit: parseFloat(item.debit) || 0,
              credit: parseFloat(item.credit) || 0,
              is_validated: false
            });
            if (error) throw error;
            created++;
          }
        }
      } else if (importType === 'accounts') {
        // Charger les comptes existants pour vérifier les doublons
        const existingAccounts = accounts;
        
        for (const item of data) {
          if (item.code && item.label) {
            // Vérifier si le compte existe déjà
            const duplicate = existingAccounts.find(
              acc => acc.code === item.code
            );
            
            if (duplicate) {
              skipped++;
              skippedDetails.push(`${item.code} - ${item.label} (existe déjà)`);
              continue;
            }
            
            const { error } = await supabase.from('accounts').insert({
              ...item,
              company_id: user.active_company_id,
              class: item.class || item.code.charAt(0),
              type: item.type || 'bilan',
              is_active: true
            });
            if (error) throw error;
            created++;
          }
        }
      }

      queryClient.invalidateQueries();
      
      let message = `${created} élément(s) importé(s) avec succès`;
      if (skipped > 0) {
        message += `\n\n${skipped} doublon(s) ignoré(s) :\n${skippedDetails.slice(0, 5).join('\n')}`;
        if (skippedDetails.length > 5) {
          message += `\n... et ${skippedDetails.length - 5} autre(s)`;
        }
      }
      
      setUploadResult({ 
        success: true, 
        message
      });

    } catch (error) {
      console.error('Import error:', error);
      setUploadResult({ 
        success: false, 
        message: getSupabaseErrorMessage(error, "L'import du fichier a échoué.")
      });
    } finally {
      setUploading(false);
    }
  };

  const fecEntries = useMemo(
    () => entries.filter((entry) => new Date(entry.date).getFullYear().toString() === fecYear),
    [entries, fecYear]
  );

  const fecReport = useMemo(
    () => validateFec(fecEntries, { year: Number(fecYear) }),
    [fecEntries, fecYear]
  );

  const handleExportFEC = async () => {
    if (!fecReport.isValid) {
      toast.error('Corrigez les anomalies bloquantes avant d\'exporter le FEC.');
      return;
    }

    setExporting(true);
    try {
      const rows = buildFecRows(fecEntries, { thirdParties });
      const content = serializeFec(rows);

      const blob = new Blob([`\ufeff${content}`], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fecFileName(company?.siret, `${fecYear}-12-31`);
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`FEC ${fecYear} exporté (${rows.length} lignes)`);
    } catch (error) {
      toastSupabaseError(error, "L'export FEC a échoué.");
    } finally {
      setExporting(false);
    }
  };

  const handleImportFEC = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Vérification critique: utilisateur et société
    if (!user || !user.active_company_id) {
      toast.error('Veuillez sélectionner une société avant d\'importer');
      return;
    }

    // S'assurer que company_ids est initialisé
    if (!user.company_ids || !Array.isArray(user.company_ids) || user.company_ids.length === 0) {
      toast.error('Initialisation en cours, veuillez réessayer dans quelques secondes');
      return;
    }

    // Vérifier la taille selon le type de fichier
    const isPDF = file.name.toLowerCase().endsWith('.pdf');
    const maxSize = isPDF ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    
    if (file.size > maxSize) {
      setUploadResult({ 
        success: false, 
        message: isPDF 
          ? `Les fichiers PDF sont limités à 10 MB (votre fichier: ${(file.size / 1024 / 1024).toFixed(1)} MB). Essayez de réduire la qualité ou diviser le document.`
          : `Le fichier est trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB). La taille maximale est de 50 MB.`
      });
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        setUploadResult({ success: false, message: 'Fichier FEC vide ou invalide' });
        return;
      }

      const headers = lines[0].split('|').map(h => h.trim());
      let created = 0;
      let skipped = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('|');
        if (values.length < headers.length) continue;

        const entry = {};
        headers.forEach((h, idx) => {
          entry[h] = values[idx]?.trim() || '';
        });

        // Convertir les dates du format AAAAMMJJ vers AAAA-MM-JJ
        const dateStr = entry.EcritureDate;
        const formattedDate = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;

        const { error } = await supabase.from('accounting_entries').insert({
          company_id: user.active_company_id,
          entry_number: entry.EcritureNum,
          date: formattedDate,
          journal: entry.JournalCode,
          account_code: entry.CompteNum,
          account_label: entry.CompteLib,
          label: entry.EcritureLib,
          debit: parseFloat(entry.Debit.replace(',', '.')) || 0,
          credit: parseFloat(entry.Credit.replace(',', '.')) || 0,
          reference: entry.PieceRef,
          third_party_name: entry.CompAuxLib,
          lettering: entry.EcritureLet,
          is_validated: !!entry.ValidDate
        });
        if (error) throw error;
        created++;
      }

      queryClient.invalidateQueries();
      setUploadResult({ 
        success: true, 
        message: `${created} écriture(s) importée(s) depuis le FEC`
      });
    } catch (error) {
      console.error('FEC import error:', error);
      setUploadResult({ 
        success: false, 
        message: 'Erreur lors de l\'import FEC: ' + error.message 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);

    try {
      let data = [];
      let filename = '';

      if (exportType === 'invoices') {
        data = invoices.map(inv => ({
          'Numéro': inv.invoice_number,
          'Type': inv.type,
          'Date': inv.date,
          'Échéance': inv.due_date,
          'Tiers': inv.third_party_name,
          'Description': inv.description,
          'Montant HT': inv.amount_ht,
          'TVA %': inv.tva_rate,
          'Montant TVA': inv.amount_tva,
          'Montant TTC': inv.amount_ttc,
          'Statut': inv.status
        }));
        filename = `factures_${format(new Date(), 'yyyy-MM-dd')}`;
      } else if (exportType === 'thirdparties') {
        data = thirdParties.map(tp => ({
          'Code': tp.code,
          'Type': tp.type,
          'Nom': tp.name,
          'Contact': tp.contact_name,
          'Email': tp.email,
          'Téléphone': tp.phone,
          'Adresse': tp.address,
          'CP': tp.postal_code,
          'Ville': tp.city,
          'SIRET': tp.siret,
          'TVA Intra': tp.tva_number,
          'Compte': tp.account_code
        }));
        filename = `tiers_${format(new Date(), 'yyyy-MM-dd')}`;
      } else if (exportType === 'entries') {
        data = entries.map(e => ({
          'N° Écriture': e.entry_number,
          'Date': e.date,
          'Journal': e.journal,
          'Compte': e.account_code,
          'Libellé Compte': e.account_label,
          'Libellé': e.label,
          'Débit': e.debit,
          'Crédit': e.credit,
          'Référence': e.reference,
          'Tiers': e.third_party_name,
          'Lettrage': e.lettering
        }));
        filename = `ecritures_${format(new Date(), 'yyyy-MM-dd')}`;
      } else if (exportType === 'accounts') {
        data = accounts.map(a => ({
          'Code': a.code,
          'Libellé': a.label,
          'Classe': a.class,
          'Type': a.type,
          'Catégorie': a.category
        }));
        filename = `plan_comptable_${format(new Date(), 'yyyy-MM-dd')}`;
      }

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const csv = [
          headers.join(';'),
          ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(';'))
        ].join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleClearData = async () => {
    try {
      const entities = {
        invoices: { table: 'invoices', data: invoices },
        thirdparties: { table: 'third_parties', data: thirdParties },
        entries: { table: 'accounting_entries', data: entries },
        accounts: { table: 'accounts', data: accounts }
      };

      const { table, data } = entities[clearType];
      for (const item of data) {
        const { error } = await supabase.from(table).delete().eq('id', item.id).eq('company_id', user.active_company_id);
        if (error) throw error;
      }

      queryClient.invalidateQueries();
      setShowClearDialog(false);
    } catch (error) {
      console.error('Clear error:', error);
    }
  };

  const importTypes = [
    { value: 'invoices', label: 'Factures', count: invoices.length },
    { value: 'thirdparties', label: 'Tiers', count: thirdParties.length },
    { value: 'entries', label: 'Écritures', count: entries.length },
    { value: 'accounts', label: 'Plan comptable', count: accounts.length }
  ];

  return (
    <ProtectedRoute>
      <div className="space-y-6">
      <PageHeader
        title="Import / Export"
        subtitle="Importez et exportez vos données comptables"
      />

      {anomalies.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <ShieldAlert className="h-5 w-5" />
              Contrôles de cohérence
              <Badge variant="outline" className="border-amber-300 text-amber-800">
                {anomalies.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-amber-800">
              Ces signaux nécessitent une vérification avant toute correction ou validation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {anomalies.slice(0, 5).map((anomaly, index) => (
              <div key={`${anomaly.type}-${index}`} className="flex items-start gap-2 text-sm text-amber-950">
                <Badge variant="secondary" className="shrink-0">{anomaly.severity}</Badge>
                <span>{anomaly.message}</span>
              </div>
            ))}
            {anomalies.length > 5 && (
              <p className="text-xs text-amber-800">{anomalies.length - 5} autre(s) signalement(s)</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="import" className="gap-2">
            <Upload className="h-4 w-4" />
            Importer
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </TabsTrigger>
          <TabsTrigger value="fec" className="gap-2">
            <FileCheck className="h-4 w-4" />
            FEC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-6 space-y-6">
          {!category ? (
            <Card>
              <CardHeader>
                <CardTitle>Choisissez une catégorie</CardTitle>
                <CardDescription>Sélectionnez le type de documents que vous souhaitez importer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className="flex items-center gap-4 p-6 border-2 border-slate-200 rounded-xl hover:border-[#1e3a5f] hover:bg-slate-50 transition-all"
                    >
                      <span className="text-4xl">{cat.icon}</span>
                      <div className="text-left">
                        <p className="font-semibold text-slate-800">{cat.label}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Button
                variant="outline"
                onClick={() => { setCategory(null); setUploadResult(null); }}
                className="gap-2"
              >
                ← Changer de catégorie
              </Button>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Importer des données</CardTitle>
                <CardDescription>
                  Importez vos données depuis un fichier CSV, Excel ou PDF multi-pages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Type de données à importer</Label>
                  <Select value={importType} onValueChange={setImportType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {importTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fichier</Label>
                  <label className="block">
                    <div className={cn(
                      "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                      uploading 
                        ? "border-blue-300 bg-blue-50" 
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    )}>
                      {uploading ? (
                        <>
                          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
                          <p className="text-sm text-blue-600">Import en cours...</p>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="h-10 w-10 text-slate-400 mb-3" />
                          <p className="text-sm text-slate-600 font-medium">
                            Glissez un fichier ou cliquez pour sélectionner
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            CSV, Excel, PDF (mono ou multi-pages)
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".csv,.xlsx,.xls,.pdf"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>

                {uploadResult && (
                  <div className={cn(
                    "flex items-start gap-3 p-4 rounded-xl",
                    uploadResult.success 
                      ? "bg-emerald-50 text-emerald-700" 
                      : "bg-red-50 text-red-700"
                  )}>
                    {uploadResult.success ? (
                      <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm whitespace-pre-line flex-1">{uploadResult.message}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>État des données</CardTitle>
                <CardDescription>
                  Nombre d'enregistrements dans chaque catégorie
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {importTypes.map(t => (
                  <div key={t.value} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-slate-400" />
                      <span className="font-medium text-slate-700">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-slate-800">{t.count}</span>
                      {t.count > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => { setClearType(t.value); setShowClearDialog(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Informations extraites automatiquement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-xl p-4">
                {importType === 'invoices' && (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    L'IA extraira automatiquement : numéro de facture, type (client/fournisseur), dates, 
                    nom du tiers, description, montants HT/TTC, taux de TVA et statut de paiement.
                  </p>
                )}
                {importType === 'thirdparties' && (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    L'IA extraira automatiquement : code, type, nom, contact, email, téléphone, 
                    adresse complète, SIRET et numéro de TVA intracommunautaire.
                  </p>
                )}
                {importType === 'entries' && (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    L'IA extraira automatiquement : date, journal, numéro et libellé de compte, 
                    libellé d'écriture, montants débit/crédit et références.
                  </p>
                )}
                {importType === 'accounts' && (
                  <p className="text-sm text-slate-600 leading-relaxed">
                    L'IA extraira automatiquement : numéro de compte, libellé, classe comptable, 
                    type (bilan/gestion) et catégorie.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Exporter des données</CardTitle>
              <CardDescription>
                Exportez vos données au format CSV pour les utiliser dans d'autres logiciels
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type de données</Label>
                  <Select value={exportType} onValueChange={setExportType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {importTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label} ({t.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={exportFormat} onValueChange={setExportFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV (Excel compatible)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleExport}
                disabled={exporting}
                className="w-full bg-[#1e3a5f] hover:bg-[#2d4a6f] gap-2"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Exporter en {exportFormat.toUpperCase()}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fec" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Exporter FEC</CardTitle>
                <CardDescription>
                  Générer le Fichier des Écritures Comptables au format officiel français
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FileCheck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800 leading-relaxed">
                      <p className="font-semibold mb-1">Format FEC conforme</p>
                      <p>Fichier texte tabulé, 18 colonnes normalisées, nommé SIRENFECAAAAMMJJ.txt conformément à l&apos;article A47 A-1 du LPF.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Exercice comptable</Label>
                  <Select value={fecYear} onValueChange={setFecYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                      <SelectItem value="2027">2027</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border p-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-700">Contrôles de cohérence</p>
                    {fecReport.isValid ? (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle className="h-4 w-4" />
                        Conforme
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-700">
                        <AlertCircle className="h-4 w-4" />
                        Export bloqué
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <span>{fecReport.totals.count} ligne(s)</span>
                    <span>{fecReport.totals.vouchers ?? 0} pièce(s)</span>
                    <span>Débit {fecReport.totals.debit.toFixed(2)} €</span>
                    <span>Crédit {fecReport.totals.credit.toFixed(2)} €</span>
                  </div>

                  {fecReport.issues.length === 0 ? (
                    <p className="text-emerald-700">Aucune anomalie détectée.</p>
                  ) : (
                    <ul className="space-y-1">
                      {fecReport.issues.map((issue) => (
                        <li
                          key={issue.code}
                          className={issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}
                        >
                          {issue.severity === 'error' ? '⛔' : '⚠️'} {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Button 
                  onClick={handleExportFEC}
                  disabled={exporting || !fecReport.isValid}
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d4a6f] gap-2"
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Générer le FEC {fecYear}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Importer FEC</CardTitle>
                <CardDescription>
                  Importer un fichier FEC existant dans ComptaFlow
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-amber-800 leading-relaxed">
                      <p className="font-semibold mb-1">Format attendu</p>
                      <p>Fichier .txt avec séparateur pipe (|) et encodage UTF-8. Le fichier doit respecter la structure FEC officielle.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Fichier FEC</Label>
                  <label className="block">
                    <div className={cn(
                      "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                      uploading 
                        ? "border-blue-300 bg-blue-50" 
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    )}>
                      {uploading ? (
                        <>
                          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-3" />
                          <p className="text-sm text-blue-600">Import FEC en cours...</p>
                        </>
                      ) : (
                        <>
                          <FileCheck className="h-10 w-10 text-slate-400 mb-3" />
                          <p className="text-sm text-slate-600 font-medium">
                            Cliquez pour sélectionner le FEC
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Fichier .txt avec format FEC
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".txt"
                      onChange={handleImportFEC}
                      disabled={uploading}
                    />
                  </label>
                </div>

                {uploadResult && (
                  <div className={cn(
                    "flex items-start gap-3 p-4 rounded-xl",
                    uploadResult.success 
                      ? "bg-emerald-50 text-emerald-700" 
                      : "bg-red-50 text-red-700"
                  )}>
                    {uploadResult.success ? (
                      <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm whitespace-pre-line flex-1">{uploadResult.message}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        </Tabs>

        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer toutes les données</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer toutes les données de type "{importTypes.find(t => t.value === clearType)?.label}" ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearData}
              className="bg-red-600 hover:bg-red-700"
            >
              Tout supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}