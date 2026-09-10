import React, { useEffect, useState } from 'react';
import { useManagementSettings, useSaveManagementSettings } from '@/components/hooks/useManagement';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { DEFAULT_MANAGEMENT_SETTINGS } from '@/lib/management';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Seuils d'alerte et coefficients de scénario, appliqués à toute la société. */
export default function ThresholdSettingsDialog({ open, onClose }) {
  const { data: settings } = useManagementSettings();
  const saveSettings = useSaveManagementSettings();
  const [form, setForm] = useState(DEFAULT_MANAGEMENT_SETTINGS);

  useEffect(() => {
    if (settings) setForm({ ...DEFAULT_MANAGEMENT_SETTINGS, ...settings });
  }, [settings, open]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    const warning = parseFloat(form.warning_threshold);
    const alert = parseFloat(form.alert_threshold);
    const prudent = parseFloat(form.scenario_prudent);
    const realiste = parseFloat(form.scenario_realiste);
    const optimiste = parseFloat(form.scenario_optimiste);

    if (warning > alert) {
      toast.error("Le seuil de vigilance doit être inférieur ou égal au seuil d'alerte.");
      return;
    }
    if (!(prudent <= realiste && realiste <= optimiste)) {
      toast.error('Les coefficients doivent être ordonnés : prudent ≤ réaliste ≤ optimiste.');
      return;
    }

    try {
      await saveSettings.mutateAsync({
        warning_threshold: warning,
        alert_threshold: alert,
        scenario_prudent: prudent,
        scenario_realiste: realiste,
        scenario_optimiste: optimiste,
        forecast_months: parseInt(form.forecast_months, 10) || 12,
        forecast_history_months: parseInt(form.forecast_history_months, 10) || 6,
      });
      toast.success('Paramètres enregistrés');
      onClose();
    } catch (error) {
      toastSupabaseError(error, "Les paramètres n'ont pas pu être enregistrés.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seuils et scénarios</DialogTitle>
          <DialogDescription>
            Ces valeurs s&apos;appliquent par défaut à tous les budgets de la société.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Seuil de vigilance (%)</Label>
              <Input
                type="number"
                min="0"
                max="200"
                value={form.warning_threshold}
                onChange={(e) => handleChange('warning_threshold', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Seuil d&apos;alerte (%)</Label>
              <Input
                type="number"
                min="0"
                max="200"
                value={form.alert_threshold}
                onChange={(e) => handleChange('alert_threshold', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Coefficients de scénario</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-slate-500">Prudent</span>
                <Input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={form.scenario_prudent}
                  onChange={(e) => handleChange('scenario_prudent', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500">Réaliste</span>
                <Input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={form.scenario_realiste}
                  onChange={(e) => handleChange('scenario_realiste', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500">Optimiste</span>
                <Input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={form.scenario_optimiste}
                  onChange={(e) => handleChange('scenario_optimiste', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Multiplicateur appliqué aux montants budgétés et aux projections.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Historique utilisé pour la projection (mois)</Label>
            <Input
              type="number"
              min="1"
              max="36"
              value={form.forecast_history_months}
              onChange={(e) => handleChange('forecast_history_months', e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
              disabled={saveSettings.isPending}
            >
              {saveSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
