import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { useThirdParties } from '@/components/hooks/useCompanyData';
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
import { Loader2 } from 'lucide-react';
import { format, addMonths, addDays } from 'date-fns';

export default function SubscriptionForm({ open, subscription, onClose, onSave }) {
  const { user } = useUser();
  const { data: thirdParties = [] } = useThirdParties();
  const [formData, setFormData] = useState({
    subscription_number: '',
    third_party_id: '',
    third_party_name: '',
    type: 'expense',
    name: '',
    description: '',
    amount: 0,
    frequency: 'monthly',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    next_payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'virement',
    account_code: '',
    status: 'active',
    auto_generate_invoice: false,
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (subscription) {
      setFormData(subscription);
    } else {
      setFormData({
        subscription_number: `SUB-${Date.now().toString().slice(-6)}`,
        third_party_id: '',
        third_party_name: '',
        type: 'expense',
        name: '',
        description: '',
        amount: 0,
        frequency: 'monthly',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: '',
        next_payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'virement',
        account_code: '',
        status: 'active',
        auto_generate_invoice: false,
        notes: ''
      });
    }
  }, [subscription, open]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-fill third party name
      if (field === 'third_party_id' && value) {
        const party = thirdParties.find(p => p.id === value);
        if (party) {
          updated.third_party_name = party.name;
          updated.account_code = party.account_code;
        }
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
        company_id: user.active_company_id,
        amount: parseFloat(formData.amount) || 0
      };

      if (subscription) {
        const { error } = await supabase.from('subscriptions').update(dataToSave).eq('id', subscription.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('subscriptions').insert(dataToSave);
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
            {subscription ? 'Modifier l\'abonnement' : 'Nouvel abonnement'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Nom de l'abonnement *</Label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Ex: Netflix, Adobe Creative Cloud..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={formData.type} onValueChange={(v) => handleChange('type', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Revenu</SelectItem>
                  <SelectItem value="expense">Dépense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Montant *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tiers</Label>
            <Select value={formData.third_party_id} onValueChange={(v) => handleChange('third_party_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un tiers..." />
              </SelectTrigger>
              <SelectContent>
                {thirdParties
                  .filter(p => formData.type === 'income' ? p.type === 'client' : p.type === 'fournisseur')
                  .map(party => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fréquence *</Label>
              <Select value={formData.frequency} onValueChange={(v) => handleChange('frequency', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="quarterly">Trimestriel</SelectItem>
                  <SelectItem value="semi-annual">Semestriel</SelectItem>
                  <SelectItem value="annual">Annuel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mode de paiement</Label>
              <Select value={formData.payment_method} onValueChange={(v) => handleChange('payment_method', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="virement">Virement</SelectItem>
                  <SelectItem value="prélèvement">Prélèvement</SelectItem>
                  <SelectItem value="carte">Carte</SelectItem>
                  <SelectItem value="chèque">Chèque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date de début *</Label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date de fin</Label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prochaine échéance</Label>
            <Input
              type="date"
              value={formData.next_payment_date}
              onChange={(e) => handleChange('next_payment_date', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Compte comptable</Label>
            <Input
              value={formData.account_code}
              onChange={(e) => handleChange('account_code', e.target.value)}
              placeholder="Ex: 651000"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label>Générer automatiquement les factures</Label>
              <p className="text-xs text-slate-500">Créer une facture à chaque échéance</p>
            </div>
            <Switch
              checked={formData.auto_generate_invoice}
              onCheckedChange={(v) => handleChange('auto_generate_invoice', v)}
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {subscription ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}