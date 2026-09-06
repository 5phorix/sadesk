import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const JOURNALS = [
  { code: 'AC', label: 'Achats' },
  { code: 'VE', label: 'Ventes' },
  { code: 'BQ', label: 'Banque' },
  { code: 'CA', label: 'Caisse' },
  { code: 'OD', label: 'Opérations Diverses' },
  { code: 'AN', label: 'À Nouveau' }
];

export default function EntryForm({ open, onClose, entry, onSave }) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    entry_number: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    journal: 'OD',
    account_code: '',
    account_label: '',
    label: '',
    debit: 0,
    credit: 0,
    reference: '',
    third_party_id: '',
    third_party_name: '',
    lettering: '',
    is_validated: false,
    fiscal_year: new Date().getFullYear().toString()
  });
  const [saving, setSaving] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').eq('company_id', user.active_company_id).order('code');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  const { data: thirdParties = [] } = useQuery({
    queryKey: ['third-parties', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('third_parties').select('*').eq('company_id', user.active_company_id).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  useEffect(() => {
    if (entry) {
      setFormData(entry);
    } else {
      setFormData({
        entry_number: `EC-${Date.now().toString().slice(-8)}`,
        date: format(new Date(), 'yyyy-MM-dd'),
        journal: 'OD',
        account_code: '',
        account_label: '',
        label: '',
        debit: 0,
        credit: 0,
        reference: '',
        third_party_id: '',
        third_party_name: '',
        lettering: '',
        is_validated: false,
        fiscal_year: new Date().getFullYear().toString()
      });
    }
  }, [entry, open]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // Auto-fill account label
      if (field === 'account_code') {
        const account = accounts.find(a => a.code === value);
        if (account) {
          updated.account_label = account.label;
        }
      }

      // Auto-fill third party name
      if (field === 'third_party_id') {
        const party = thirdParties.find(p => p.id === value);
        if (party) {
          updated.third_party_name = party.name;
        }
      }

      // Ensure only debit OR credit has a value
      if (field === 'debit' && parseFloat(value) > 0) {
        updated.credit = 0;
      }
      if (field === 'credit' && parseFloat(value) > 0) {
        updated.debit = 0;
      }

      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const debit = parseFloat(formData.debit) || 0;
    const credit = parseFloat(formData.credit) || 0;
    
    // Validation de la partie double : une écriture doit avoir soit débit, soit crédit (pas les deux)
    if (debit > 0 && credit > 0) {
      alert('Une écriture ne peut pas avoir à la fois un débit et un crédit. Principe de la partie double.');
      return;
    }
    
    if (debit === 0 && credit === 0) {
      alert('Une écriture doit avoir soit un débit, soit un crédit.');
      return;
    }
    
    setSaving(true);
    try {
      const data = {
        ...formData,
        debit,
        credit
      };

      if (!entry) {
        data.company_id = user?.active_company_id;
      }

      if (entry) {
        const { error } = await supabase.from('accounting_entries').update(data).eq('id', entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounting_entries').insert(data);
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
            {entry ? 'Modifier l\'écriture' : 'Nouvelle écriture'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Numéro et Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>N° d'écriture</Label>
              <Input
                value={formData.entry_number}
                onChange={(e) => handleChange('entry_number', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Journal */}
          <div className="space-y-2">
            <Label>Journal</Label>
            <Select value={formData.journal} onValueChange={(v) => handleChange('journal', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOURNALS.map(j => (
                  <SelectItem key={j.code} value={j.code}>
                    {j.code} - {j.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Compte */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Compte</Label>
              <Select value={formData.account_code} onValueChange={(v) => handleChange('account_code', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.code}>
                      {acc.code} - {acc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Libellé compte</Label>
              <Input
                value={formData.account_label}
                onChange={(e) => handleChange('account_label', e.target.value)}
              />
            </div>
          </div>

          {/* Libellé écriture */}
          <div className="space-y-2">
            <Label>Libellé de l'écriture *</Label>
            <Input
              value={formData.label}
              onChange={(e) => handleChange('label', e.target.value)}
              required
            />
          </div>

          {/* Débit / Crédit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Débit</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.debit || ''}
                onChange={(e) => handleChange('debit', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Crédit</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.credit || ''}
                onChange={(e) => handleChange('credit', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Référence */}
          <div className="space-y-2">
            <Label>Référence (n° pièce)</Label>
            <Input
              value={formData.reference}
              onChange={(e) => handleChange('reference', e.target.value)}
            />
          </div>

          {/* Tiers */}
          <div className="space-y-2">
            <Label>Tiers</Label>
            <Select value={formData.third_party_id || ''} onValueChange={(v) => handleChange('third_party_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Optionnel" />
              </SelectTrigger>
              <SelectContent>
                {thirdParties.map(party => (
                  <SelectItem key={party.id} value={party.id}>
                    {party.code} - {party.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lettrage */}
          <div className="space-y-2">
            <Label>Code de lettrage</Label>
            <Input
              value={formData.lettering}
              onChange={(e) => handleChange('lettering', e.target.value)}
              maxLength={3}
              placeholder="ex: AAA"
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
              {entry ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}