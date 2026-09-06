import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Loader2, Plus, X } from 'lucide-react';

export default function ThirdPartyForm({ open, onClose, thirdParty, onSave }) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    code: '',
    type: 'client',
    name: '',
    contact_name: '',
    email: '',
    additional_emails: [],
    phone: '',
    additional_phones: [],
    address: '',
    address_line_2: '',
    postal_code: '',
    city: '',
    country: 'France',
    siret: '',
    siren: '',
    tva_number: '',
    legal_form: '',
    website: '',
    account_code: '',
    payment_terms: 30,
    payment_method: '',
    bank_details: { iban: '', bic: '', bank_name: '' },
    tags: [],
    notes: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (thirdParty) {
      setFormData(thirdParty);
    } else {
      const prefix = formData.type === 'client' ? 'CLI' : 'FOU';
      setFormData({
        code: `${prefix}-${Date.now().toString().slice(-5)}`,
        type: 'client',
        name: '',
        contact_name: '',
        email: '',
        additional_emails: [],
        phone: '',
        additional_phones: [],
        address: '',
        address_line_2: '',
        postal_code: '',
        city: '',
        country: 'France',
        siret: '',
        siren: '',
        tva_number: '',
        legal_form: '',
        website: '',
        account_code: '',
        payment_terms: 30,
        payment_method: '',
        bank_details: { iban: '', bic: '', bank_name: '' },
        tags: [],
        notes: '',
        is_active: true
      });
    }
  }, [thirdParty, open]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-generate code prefix based on type
      if (field === 'type' && !thirdParty) {
        const prefix = value === 'client' ? 'CLI' : 'FOU';
        updated.code = `${prefix}-${Date.now().toString().slice(-5)}`;
        // Suggest default account code
        updated.account_code = value === 'client' ? '411000' : '401000';
      }

      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        company_id: user.active_company_id
      };
      
      if (thirdParty) {
        const { error } = await supabase.from('third_parties').update(dataToSave).eq('id', thirdParty.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('third_parties').insert(dataToSave);
        if (error) throw error;
      }
      onSave();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>
            {thirdParty ? 'Modifier le tiers' : 'Nouveau tiers'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type et Code */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v) => handleChange('type', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="fournisseur">Fournisseur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Raison sociale */}
          <div className="space-y-2">
            <Label>Raison sociale *</Label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom du contact</Label>
              <Input
                value={formData.contact_name}
                onChange={(e) => handleChange('contact_name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email principal</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>

          {/* Emails supplémentaires */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Emails supplémentaires</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const emails = formData.additional_emails || [];
                  handleChange('additional_emails', [...emails, { email: '', label: '' }]);
                }}
                className="h-7 gap-1"
              >
                <Plus className="h-3 w-3" />
                Ajouter
              </Button>
            </div>
            {(formData.additional_emails || []).map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="Email"
                  value={item.email}
                  onChange={(e) => {
                    const updated = [...(formData.additional_emails || [])];
                    updated[idx].email = e.target.value;
                    handleChange('additional_emails', updated);
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Libellé"
                  value={item.label}
                  onChange={(e) => {
                    const updated = [...(formData.additional_emails || [])];
                    updated[idx].label = e.target.value;
                    handleChange('additional_emails', updated);
                  }}
                  className="w-32"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const updated = (formData.additional_emails || []).filter((_, i) => i !== idx);
                    handleChange('additional_emails', updated);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Téléphones supplémentaires */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Téléphones supplémentaires</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const phones = formData.additional_phones || [];
                  handleChange('additional_phones', [...phones, { phone: '', label: '' }]);
                }}
                className="h-7 gap-1"
              >
                <Plus className="h-3 w-3" />
                Ajouter
              </Button>
            </div>
            {(formData.additional_phones || []).map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="Téléphone"
                  value={item.phone}
                  onChange={(e) => {
                    const updated = [...(formData.additional_phones || [])];
                    updated[idx].phone = e.target.value;
                    handleChange('additional_phones', updated);
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Libellé"
                  value={item.label}
                  onChange={(e) => {
                    const updated = [...(formData.additional_phones || [])];
                    updated[idx].label = e.target.value;
                    handleChange('additional_phones', updated);
                  }}
                  className="w-32"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const updated = (formData.additional_phones || []).filter((_, i) => i !== idx);
                    handleChange('additional_phones', updated);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Adresse */}
          <div className="space-y-2">
            <Label>Adresse</Label>
            <Input
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Complément d'adresse</Label>
            <Input
              value={formData.address_line_2}
              onChange={(e) => handleChange('address_line_2', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Code postal</Label>
              <Input
                value={formData.postal_code}
                onChange={(e) => handleChange('postal_code', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Pays</Label>
              <Input
                value={formData.country}
                onChange={(e) => handleChange('country', e.target.value)}
              />
            </div>
          </div>

          {/* Infos légales */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-semibold">Informations légales</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SIRET</Label>
                <Input
                  value={formData.siret}
                  onChange={(e) => handleChange('siret', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>SIREN</Label>
                <Input
                  value={formData.siren}
                  onChange={(e) => handleChange('siren', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>N° TVA intracom</Label>
                <Input
                  value={formData.tva_number}
                  onChange={(e) => handleChange('tva_number', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Forme juridique</Label>
                <Input
                  value={formData.legal_form}
                  onChange={(e) => handleChange('legal_form', e.target.value)}
                  placeholder="SARL, SAS, SA..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Site web</Label>
              <Input
                value={formData.website}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="https://exemple.com"
              />
            </div>
          </div>

          {/* Comptabilité & Paiement */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-semibold">Informations comptables</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Compte comptable</Label>
                <Input
                  value={formData.account_code}
                  onChange={(e) => handleChange('account_code', e.target.value)}
                  placeholder={formData.type === 'client' ? '411000' : '401000'}
                />
              </div>
              <div className="space-y-2">
                <Label>Délai de paiement (jours)</Label>
                <Input
                  type="number"
                  value={formData.payment_terms}
                  onChange={(e) => handleChange('payment_terms', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mode de paiement préféré</Label>
              <Select value={formData.payment_method} onValueChange={(v) => handleChange('payment_method', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="virement">Virement</SelectItem>
                  <SelectItem value="chèque">Chèque</SelectItem>
                  <SelectItem value="espèces">Espèces</SelectItem>
                  <SelectItem value="carte">Carte</SelectItem>
                  <SelectItem value="prélèvement">Prélèvement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Coordonnées bancaires</Label>
              <Input
                placeholder="IBAN"
                value={formData.bank_details?.iban || ''}
                onChange={(e) => handleChange('bank_details', { 
                  ...(formData.bank_details || {}), 
                  iban: e.target.value 
                })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="BIC"
                  value={formData.bank_details?.bic || ''}
                  onChange={(e) => handleChange('bank_details', { 
                    ...(formData.bank_details || {}), 
                    bic: e.target.value 
                  })}
                />
                <Input
                  placeholder="Nom banque"
                  value={formData.bank_details?.bank_name || ''}
                  onChange={(e) => handleChange('bank_details', { 
                    ...(formData.bank_details || {}), 
                    bank_name: e.target.value 
                  })}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>

          {/* Actif */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <Label className="text-base">Tiers actif</Label>
              <p className="text-sm text-slate-500">Désactivez pour masquer dans les listes</p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(v) => handleChange('is_active', v)}
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
              {thirdParty ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}