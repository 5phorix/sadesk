import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Upload, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const TVA_RATES = [0, 5.5, 10, 20];

export default function InvoiceForm({ open, onClose, invoice, onSave }) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    invoice_number: '',
    type: 'client',
    date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    third_party_id: '',
    third_party_name: '',
    description: '',
    amount_ht: 0,
    tva_rate: 20,
    amount_tva: 0,
    amount_ttc: 0,
    status: 'brouillon',
    payment_method: '',
    account_code: '',
    notes: '',
    file_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: thirdParties = [] } = useQuery({
    queryKey: ['third-parties', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('third_parties')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  useEffect(() => {
    if (invoice) {
      setFormData(invoice);
    } else {
      setFormData({
        invoice_number: `FAC-${Date.now().toString().slice(-6)}`,
        type: 'client',
        date: format(new Date(), 'yyyy-MM-dd'),
        due_date: '',
        third_party_id: '',
        third_party_name: '',
        description: '',
        amount_ht: 0,
        tva_rate: 20,
        amount_tva: 0,
        amount_ttc: 0,
        status: 'brouillon',
        payment_method: '',
        account_code: '',
        notes: '',
        file_url: ''
      });
    }
  }, [invoice, open]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Calcul automatique TVA et TTC
      if (field === 'amount_ht' || field === 'tva_rate') {
        const ht = field === 'amount_ht' ? parseFloat(value) || 0 : parseFloat(prev.amount_ht) || 0;
        const rate = field === 'tva_rate' ? parseFloat(value) || 0 : parseFloat(prev.tva_rate) || 0;
        updated.amount_tva = ht * (rate / 100);
        updated.amount_ttc = ht + updated.amount_tva;
      }

      // Auto-fill third party name
      if (field === 'third_party_id') {
        const party = thirdParties.find(p => p.id === value);
        if (party) {
          updated.third_party_name = party.name;
          updated.account_code = party.account_code || '';
        }
      }

      return updated;
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const filePath = `${user.active_company_id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
      handleChange('file_url', data.publicUrl);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...formData,
        company_id: user.active_company_id,
        amount_ht: parseFloat(formData.amount_ht) || 0,
        amount_tva: parseFloat(formData.amount_tva) || 0,
        amount_ttc: parseFloat(formData.amount_ttc) || 0,
        tva_rate: parseFloat(formData.tva_rate) || 20
      };

      const { data: duplicate, error: duplicateError } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', user.active_company_id)
        .eq('invoice_number', data.invoice_number)
        .neq('id', invoice?.id || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) throw new Error(`La facture ${data.invoice_number} existe déjà dans cette société.`);
      
      if (invoice) {
        const { error } = await supabase.from('invoices').update(data).eq('id', invoice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('invoices').insert(data);
        if (error) throw error;
      }
      onSave();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const filteredParties = thirdParties.filter(p => p.type === formData.type);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>
            {invoice ? 'Modifier la facture' : 'Nouvelle facture'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type et Numéro */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v) => handleChange('type', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Facture client</SelectItem>
                  <SelectItem value="fournisseur">Facture fournisseur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Numéro de facture</Label>
              <Input
                value={formData.invoice_number}
                onChange={(e) => handleChange('invoice_number', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date de facture</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date d'échéance</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => handleChange('due_date', e.target.value)}
              />
            </div>
          </div>

          {/* Tiers */}
          <div className="space-y-2">
            <Label>{formData.type === 'client' ? 'Client' : 'Fournisseur'}</Label>
            <Select value={formData.third_party_id} onValueChange={(v) => handleChange('third_party_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un tiers" />
              </SelectTrigger>
              <SelectContent>
                {filteredParties.map(party => (
                  <SelectItem key={party.id} value={party.id}>
                    {party.code} - {party.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!formData.third_party_id && (
              <Input
                placeholder="Ou saisir le nom manuellement"
                value={formData.third_party_name}
                onChange={(e) => handleChange('third_party_name', e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
            />
          </div>

          {/* Montants */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Montant HT</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount_ht}
                onChange={(e) => handleChange('amount_ht', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Taux TVA (%)</Label>
              <Select value={formData.tva_rate.toString()} onValueChange={(v) => handleChange('tva_rate', parseFloat(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TVA_RATES.map(rate => (
                    <SelectItem key={rate} value={rate.toString()}>{rate}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Montant TTC</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount_ttc.toFixed(2)}
                readOnly
                className="bg-slate-50"
              />
            </div>
          </div>

          {/* Statut et Paiement */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brouillon">Brouillon</SelectItem>
                  <SelectItem value="validée">Validée</SelectItem>
                  <SelectItem value="payée">Payée</SelectItem>
                  <SelectItem value="annulée">Annulée</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mode de paiement</Label>
              <Select value={formData.payment_method || ''} onValueChange={(v) => handleChange('payment_method', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="virement">Virement</SelectItem>
                  <SelectItem value="chèque">Chèque</SelectItem>
                  <SelectItem value="espèces">Espèces</SelectItem>
                  <SelectItem value="carte">Carte bancaire</SelectItem>
                  <SelectItem value="prélèvement">Prélèvement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Compte comptable */}
          <div className="space-y-2">
            <Label>Compte comptable</Label>
            <Input
              value={formData.account_code}
              onChange={(e) => handleChange('account_code', e.target.value)}
              placeholder="ex: 411000, 401000..."
            />
          </div>

          {/* Fichier joint */}
          <div className="space-y-2">
            <Label>Pièce jointe</Label>
            <div className="flex items-center gap-4">
              <label className="flex-1">
                <div className="flex items-center justify-center h-12 border-2 border-dashed border-slate-200 rounded-xl hover:border-slate-300 cursor-pointer transition-colors">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Upload className="h-4 w-4" />
                      {formData.file_url ? 'Remplacer le fichier' : 'Ajouter un fichier'}
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.jpg,.jpeg,.png"
                />
              </label>
              {formData.file_url && (
                <a
                  href={formData.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Voir
                </a>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes internes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {invoice ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}