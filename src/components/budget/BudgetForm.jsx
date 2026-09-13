import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { useCostCenters } from '@/components/hooks/useCompanyData';
import { useBudgetLines, useSaveBudgetLines } from '@/components/hooks/useManagement';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { MONTH_LABELS, monthlyBudgetAmounts, round2 } from '@/lib/management';
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
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

const NO_COST_CENTER = '__all__';

const emptyForm = () => ({
  name: '',
  fiscal_year: new Date().getFullYear().toString(),
  period_type: 'monthly',
  category: 'expense',
  account_code: '',
  cost_center_code: '',
  total_amount: 0,
  warning_threshold: 80,
  alert_threshold: 100,
  description: '',
  is_active: true
});

export default function BudgetForm({ open, budget, onClose, onSave }) {
  const { user } = useUser();
  const { data: costCenters = [] } = useCostCenters();
  const { data: budgetLines = [] } = useBudgetLines();
  const saveLines = useSaveBudgetLines();

  const [formData, setFormData] = useState(emptyForm);
  const [monthlyAmounts, setMonthlyAmounts] = useState(Array(12).fill(0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (budget) {
      setFormData({ ...emptyForm(), ...budget });
      setMonthlyAmounts(monthlyBudgetAmounts(budget, budgetLines));
    } else {
      setFormData(emptyForm());
      setMonthlyAmounts(Array(12).fill(0));
    }
  }, [budget, open, budgetLines]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const monthlyTotal = useMemo(
    () => round2(monthlyAmounts.reduce((total, amount) => total + (parseFloat(amount) || 0), 0)),
    [monthlyAmounts]
  );

  const totalAmount = round2(formData.total_amount);
  const isBalanced = Math.abs(monthlyTotal - totalAmount) < 0.01;

  const handleMonthChange = (index, value) => {
    setMonthlyAmounts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const spreadEvenly = () => {
    setMonthlyAmounts(monthlyBudgetAmounts({ ...formData, total_amount: totalAmount }, []));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (monthlyTotal > 0 && !isBalanced) {
      toast.error(
        `La ventilation mensuelle (${monthlyTotal.toFixed(2)} €) ne correspond pas au montant annuel (${totalAmount.toFixed(2)} €).`
      );
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        name: formData.name,
        fiscal_year: parseInt(formData.fiscal_year, 10) || null,
        period_type: formData.period_type,
        category: formData.category,
        account_code: formData.account_code || null,
        cost_center_code: formData.cost_center_code || null,
        total_amount: totalAmount,
        warning_threshold: parseFloat(formData.warning_threshold) || null,
        alert_threshold: parseFloat(formData.alert_threshold) || null,
        description: formData.description,
        is_active: formData.is_active,
        company_id: user.active_company_id
      };

      let budgetId = budget?.id;
      if (budget) {
        const { error } = await supabase.from('budgets').update(dataToSave).eq('id', budget.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('budgets').insert(dataToSave).select().single();
        if (error) throw error;
        budgetId = data.id;
      }

      await saveLines.mutateAsync({ budgetId, amounts: monthlyAmounts });

      const { data: versions, error: versionsError } = await supabase
        .from('performance_budget_versions')
        .select('version')
        .eq('budget_id', budgetId)
        .order('version', { ascending: false })
        .limit(1);
      if (versionsError) throw versionsError;
      const nextVersion = (versions?.[0]?.version || 0) + 1;
      const { error: versionError } = await supabase.from('performance_budget_versions').insert({
        company_id: user.active_company_id,
        budget_id: budgetId,
        version: nextVersion,
        total_amount: totalAmount,
        monthly_amounts: Object.fromEntries(monthlyAmounts.map((amount, index) => [index + 1, Number(amount) || 0])),
        reason: budget ? 'Révision du budget' : 'Version initiale',
        status: 'draft',
        valid_from: `${formData.fiscal_year}-01-01`,
        created_by: user.id,
      });
      if (versionError) throw versionError;

      toast.success(budget ? 'Budget mis à jour' : 'Budget créé');
      onSave();
    } catch (error) {
      toastSupabaseError(error, "Le budget n'a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{budget ? 'Modifier le budget' : 'Nouveau budget'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Nom du budget *</Label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Ex : Marketing 2026"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Exercice</Label>
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
                value={formData.account_code || ''}
                onChange={(e) => handleChange('account_code', e.target.value)}
                placeholder="Ex : 641"
              />
              <p className="text-xs text-slate-500">Préfixe de compte, vide = tous les comptes</p>
            </div>
            <div className="space-y-2">
              <Label>Centre de coûts</Label>
              <Select
                value={formData.cost_center_code || NO_COST_CENTER}
                onValueChange={(v) => handleChange('cost_center_code', v === NO_COST_CENTER ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous les centres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COST_CENTER}>Tous les centres</SelectItem>
                  {costCenters.map((center) => (
                    <SelectItem key={center.id} value={center.code}>
                      {center.code} — {center.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Montant annuel *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount}
                onChange={(e) => handleChange('total_amount', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Seuil de vigilance (%)</Label>
              <Input
                type="number"
                min="0"
                max="200"
                value={formData.warning_threshold ?? ''}
                onChange={(e) => handleChange('warning_threshold', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Seuil d&apos;alerte (%)</Label>
              <Input
                type="number"
                min="0"
                max="200"
                value={formData.alert_threshold ?? ''}
                onChange={(e) => handleChange('alert_threshold', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ventilation mensuelle</Label>
                <p className="text-xs text-slate-500">
                  Laissez à zéro pour une répartition linéaire automatique.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={spreadEvenly}>
                <Wand2 className="mr-2 h-4 w-4" />
                Répartir
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {MONTH_LABELS.map((label, index) => (
                <div key={label} className="space-y-1">
                  <Label className="text-xs font-normal text-slate-500">{label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlyAmounts[index]}
                    onChange={(e) => handleMonthChange(index, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div
              className={`text-sm ${monthlyTotal > 0 && !isBalanced ? 'text-red-600' : 'text-slate-600'}`}
            >
              Total ventilé : {monthlyTotal.toFixed(2)} € / {totalAmount.toFixed(2)} €
              {monthlyTotal > 0 && !isBalanced && ' — écart à corriger'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              placeholder="Détails sur ce budget..."
            />
          </div>

          <div className="flex gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {budget ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
