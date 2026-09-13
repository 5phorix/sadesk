import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { extractStructuredData, uploadDocument } from '@/api/aiClient';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { duplicateKey } from '@/lib/import-validation';
import { useUser } from '@/components/hooks/useUser';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function BankStatementImport() {
  const { user } = useUser();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [bankAccount, setBankAccount] = useState('512000');
  const queryClient = useQueryClient();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    if (!user?.active_company_id) {
      toast.error('Veuillez sélectionner une société avant d\'importer');
      return;
    }

    setLoading(true);
    try {
      const { path: filePath } = await uploadDocument(file, user.active_company_id);

      // Prompt professionnel pour relevé bancaire
      const bankPrompt = `Tu es un expert-comptable. Analyse ce relevé bancaire avec PRÉCISION PROFESSIONNELLE.

═══════════════════════════════════════════════════
INSTRUCTIONS D'EXTRACTION - RELEVÉ BANCAIRE
═══════════════════════════════════════════════════

Pour CHAQUE transaction du relevé, extrait:

→ transaction_date: Date de la transaction (format YYYY-MM-DD)
   Mots-clés: "Date", "Date opération", "Date transaction"

→ value_date: Date de valeur (format YYYY-MM-DD)
   Mots-clés: "Date valeur", "Date comptable"
   Si absente: utilise transaction_date

→ description: Libellé complet de l'opération
   Mots-clés: "Libellé", "Description", "Intitulé", "Opération"
   Copie le texte complet tel quel

→ reference: Référence bancaire unique
   Mots-clés: "Référence", "Réf", "N° opération"
   Si absente: laisser vide ""

→ amount: Montant (NOMBRE décimal avec 2 décimales)
   - POSITIF pour les CRÉDITS (entrées d'argent)
   - NÉGATIF pour les DÉBITS (sorties d'argent)
   Colonnes possibles: "Débit", "Crédit", "Montant"
   ⚠️ Respecter le signe (+/-)

→ balance_after: Solde après opération (si présent)
   Mots-clés: "Solde", "Balance", "Solde après opération"
   Si absent: mettre 0

═══════════════════════════════════════════════════
RÈGLES TECHNIQUES
═══════════════════════════════════════════════════
✓ Extraire TOUTES les transactions visibles
✓ Dates au format YYYY-MM-DD strict
✓ Montants: nombres décimaux (2 décimales)
✓ Respecter le signe des montants (+ crédit, - débit)
✓ Ne pas ignorer les petites transactions
✓ Ignorer les lignes d'en-tête et de total`;

      const extractedData = await extractStructuredData({
        companyId: user.active_company_id,
        prompt: bankPrompt,
        filePaths: [filePath],
        schema: {
          type: 'object',
          properties: {
            transactions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  transaction_date: { type: 'string' },
                  value_date: { type: 'string' },
                  description: { type: 'string' },
                  reference: { type: 'string' },
                  amount: { type: 'number' },
                  balance_after: { type: 'number' }
                },
                required: ['transaction_date', 'description', 'amount']
              }
            }
          },
          required: ['transactions']
        }
      });

      if (extractedData && extractedData.transactions) {
        // Validation et normalisation professionnelle
        const validatedTransactions = extractedData.transactions.map(t => ({
          transaction_date: t.transaction_date || format(new Date(), 'yyyy-MM-dd'),
          value_date: t.value_date || t.transaction_date || format(new Date(), 'yyyy-MM-dd'),
          description: (t.description || 'Transaction bancaire').trim(),
          reference: (t.reference || '').trim(),
          amount: Math.round((parseFloat(t.amount) || 0) * 100) / 100,
          balance_after: Math.round((parseFloat(t.balance_after) || 0) * 100) / 100
        }));

        setPreview(validatedTransactions);
        toast.success(`${validatedTransactions.length} transactions extraites et validées`);
      } else {
        toast.error('Aucune transaction trouvée dans le fichier');
      }
    } catch (error) {
      toastSupabaseError(error, "Impossible d'analyser ce relevé bancaire.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.length === 0) return;

    setLoading(true);
    try {
      const { data: existingTransactions, error: existingError } = await supabase
        .from('bank_transactions')
        .select('bank_account, transaction_date, amount, reference, description')
        .eq('company_id', user.active_company_id);
      if (existingError) throw existingError;

      const existingKeys = new Set((existingTransactions || []).map((transaction) => duplicateKey(
        transaction.bank_account,
        transaction.transaction_date,
        transaction.amount,
        transaction.reference,
        transaction.description
      )));
      const importedKeys = new Set();
      const transactions = preview.map((transaction) => ({
          company_id: user.active_company_id,
          bank_account: bankAccount,
          transaction_date: transaction.transaction_date || format(new Date(), 'yyyy-MM-dd'),
          value_date: transaction.value_date || transaction.transaction_date,
          description: transaction.description || 'Transaction bancaire',
          reference: transaction.reference || '',
          amount: parseFloat(transaction.amount) || 0,
          balance_after: parseFloat(transaction.balance_after) || 0,
          is_reconciled: false
      })).filter((transaction) => {
        const key = duplicateKey(
          transaction.bank_account,
          transaction.transaction_date,
          transaction.amount,
          transaction.reference,
          transaction.description
        );
        if (existingKeys.has(key) || importedKeys.has(key)) return false;
        importedKeys.add(key);
        return true;
      });

      if (transactions.length === 0) {
        toast.info('Toutes les transactions de ce relevé existent déjà.');
        return;
      }
      const { error } = await supabase.from('bank_transactions').insert(transactions);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      toast.success(`${transactions.length} transactions importées${transactions.length < preview.length ? `, ${preview.length - transactions.length} doublon(s) ignoré(s)` : ''}`);
      setFile(null);
      setPreview(null);
    } catch (error) {
      toastSupabaseError(error, "Impossible d'enregistrer les transactions importées.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importer un relevé bancaire
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Compte bancaire</Label>
            <Input
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="512000"
            />
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
              id="statement-upload"
            />
            <label htmlFor="statement-upload" className="cursor-pointer">
              <FileText className="h-12 w-12 mx-auto text-slate-400 mb-4" />
              <p className="text-sm text-slate-600 mb-2">
                Cliquez pour importer un relevé bancaire
              </p>
              <p className="text-xs text-slate-400">
                Formats acceptés : PDF et images JPG, PNG, WEBP ou GIF
              </p>
            </label>
          </div>

          {file && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Fichier sélectionné : <span className="font-medium">{file.name}</span>
              </p>
              <Button
                onClick={handleImport}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Analyser le fichier
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Aperçu des transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!preview ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="text-sm text-slate-400">
                L'aperçu des transactions apparaîtra ici
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
                {preview.slice(0, 10).map((transaction, idx) => (
                  <div 
                    key={idx}
                    className="p-3 border-b border-slate-100 last:border-0 text-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-slate-800">{transaction.description}</p>
                        <p className="text-xs text-slate-500">{transaction.transaction_date}</p>
                      </div>
                      <p className={`font-semibold ${transaction.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {transaction.amount?.toFixed(2)} €
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {preview.length > 10 && (
                <p className="text-xs text-slate-500 text-center">
                  ... et {preview.length - 10} autres transactions
                </p>
              )}
              <Button
                onClick={handleConfirmImport}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirmer l'import ({preview.length} transactions)
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}