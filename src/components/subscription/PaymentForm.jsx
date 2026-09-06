import React, { useState, useEffect } from 'react';
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
import { format, addMonths } from 'date-fns';

export default function PaymentForm({ open, subscription, onClose, onSave }) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    payment_number: '',
    subscription_id: '',
    third_party_id: '',
    third_party_name: '',
    type: 'expense',
    amount: 0,
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'virement',
    status: 'paid',
    reference: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (subscription && open) {
      setFormData({
        payment_number: `PAY-${Date.now().toString().slice(-6)}`,
        subscription_id: subscription.id,
        third_party_id: subscription.third_party_id,
        third_party_name: subscription.third_party_name,
        type: subscription.type,
        amount: subscription.amount,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: subscription.next_payment_date || format(new Date(), 'yyyy-MM-dd'),
        payment_method: subscription.payment_method || 'virement',
        status: 'paid',
        reference: '',
        description: `Paiement ${subscription.name}`
      });
    }
  }, [subscription, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

      const { error: paymentError } = await supabase.from('payments').insert(dataToSave);
      if (paymentError) throw paymentError;

      // Mettre à jour la prochaine échéance de l'abonnement
      if (subscription) {
        let nextDate = new Date(subscription.next_payment_date || new Date());
        
        if (subscription.frequency === 'monthly') {
          nextDate = addMonths(nextDate, 1);
        } else if (subscription.frequency === 'quarterly') {
          nextDate = addMonths(nextDate, 3);
        } else if (subscription.frequency === 'semi-annual') {
          nextDate = addMonths(nextDate, 6);
        } else if (subscription.frequency === 'annual') {
          nextDate = addMonths(nextDate, 12);
        }

        const { error: subscriptionError } = await supabase.from('subscriptions').update({
          next_payment_date: format(nextDate, 'yyyy-MM-dd')
        }).eq('id', subscription.id);
        if (subscriptionError) throw subscriptionError;
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
          <SheetTitle>Enregistrer un paiement</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <div className="text-sm text-slate-600">Abonnement</div>
            <div className="font-semibold text-lg">{subscription?.name}</div>
            <div className="text-sm text-slate-600">
              {subscription?.third_party_name}
            </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date de paiement *</Label>
              <Input
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleChange('payment_date', e.target.value)}
                required
              />
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
                  <SelectItem value="espèces">Espèces</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Référence</Label>
            <Input
              value={formData.reference}
              onChange={(e) => handleChange('reference', e.target.value)}
              placeholder="Numéro de transaction..."
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer le paiement
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}