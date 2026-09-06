import React, { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';

export default function BudgetForm({ open, budget, onClose, onSave }) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    name: '',
    fiscal_year: new Date().getFullYear().toString(),
    period_type: 'monthly',
    category: 'expense',
    account_code: '',
    cost_center_code: '',
    total_amount: 0,
    alert_threshold: 90,
    description: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (budget) {
      setFormData(budget);
    } else {
      setFormData({
        name: '',
        fiscal_year: new Date().getFullYear().toString(),
        period_type: 'monthly',
        category: 'expense',
        account_code: '',
        cost_center_code: '',
        total_amount: 0,
        alert_threshold: 90,
        description: '',
        is_active: true
      });
    }
  }, [budget, open]);

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
        total_amount: parseFloat(formData.total_amount) || 0
      };

      if (budget) {
        const { error } = await supabase.from('budgets').update(dataToSave).eq('id', budget.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('budgets').insert(dataToSave);
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
            {budget ? 'Modifier le budget' : 'Nouveau budget'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Nom du budget *</Label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Ex: Marketing 2026"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Exercice fiscal</Label>
              <Input
                value={formData.fiscal_year}
                onChange={(e) => handleChange('fiscal_year', e.target.value)}
                placeholder="2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Catégorie *</Label>
              <Select value={formData.category} onValueChange={(v) => handleChange('category', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Revenus</SelectItem>
                  <SelectItem value="expense">Dépenses</SelectItem>
                  <SelectItem value="investment">Investissements</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Compte comptable</Label>
              <Input
                value={formData.account_code}
                onChange={(e) => handleChange('account_code', e.target.value)}
                placeholder="Ex: 641"
              />
              <p className="text-xs text-slate-500">
                Laissez vide pour tous les comptes
              </p>
            </div>
            <div className="space-y-2">
              <Label>Centre de coût</Label>
              <Input
                value={formData.cost_center_code}
                onChange={(e) => handleChange('cost_center_code', e.target.value)}
                placeholder="Ex: DEPT01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Montant total *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.total_amount}
                onChange={(e) => handleChange('total_amount', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Seuil d'alerte (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formData.alert_threshold}
                onChange={(e) => handleChange('alert_threshold', parseInt(e.target.value) || 90)}
              />
              <p className="text-xs text-slate-500">
                Alerte à {formData.alert_threshold}% du budget
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              placeholder="Détails sur ce budget..."
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
              {budget ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}