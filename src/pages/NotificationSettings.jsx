import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Bell, Mail, Clock, Users, Save } from 'lucide-react';

export default function NotificationSettings() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ['notification-settings', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_settings').select('*').eq('company_id', user.active_company_id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  const currentSettings = settings[0] || {
    invoice_reminder_days: 7,
    third_party_inactive_months: 6,
    send_email_notifications: false,
    notification_email: '',
    enabled_types: {
      invoice_due_soon: true,
      invoice_overdue: true,
      third_party_inactive: true,
      budget_alert: true
    }
  };

  const [formData, setFormData] = useState(currentSettings);

  useEffect(() => {
    setFormData(currentSettings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (currentSettings.id) {
        const { data: updated, error } = await supabase.from('notification_settings').update(data).eq('id', currentSettings.id).select().single();
        if (error) throw error;
        return updated;
      } else {
        const { data: created, error } = await supabase.from('notification_settings').insert({
          ...data,
          company_id: user.active_company_id
        }).select().single();
        if (error) throw error;
        return created;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Paramètres enregistrés');
    }
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée');
      const response = await fetch('/api/generate-notifications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: user.active_company_id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Génération impossible');
      return result;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(response.data.message || 'Notifications générées');
    },
    onError: (error) => {
      toast.error('Erreur lors de la génération des notifications');
      console.error(error);
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres de Notification"
        subtitle="Configurez vos rappels et alertes"
        actions={
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="gap-2 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f]"
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        }
      />

      <div className="grid md:grid-cols-2 gap-6">
        {/* Paramètres généraux */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Paramètres Généraux
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="invoice_days">Rappel factures (jours avant échéance)</Label>
              <Input
                id="invoice_days"
                type="number"
                value={formData.invoice_reminder_days}
                onChange={(e) => setFormData({ ...formData, invoice_reminder_days: parseInt(e.target.value) })}
                min={1}
                max={30}
              />
              <p className="text-xs text-slate-500">Recevoir une alerte N jours avant l'échéance d'une facture</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inactive_months">Tiers inactifs (mois sans activité)</Label>
              <Input
                id="inactive_months"
                type="number"
                value={formData.third_party_inactive_months}
                onChange={(e) => setFormData({ ...formData, third_party_inactive_months: parseInt(e.target.value) })}
                min={1}
                max={24}
              />
              <p className="text-xs text-slate-500">Alerter si un tiers n'a pas eu de facture depuis X mois</p>
            </div>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Notifications Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Envoyer des emails</Label>
                <p className="text-xs text-slate-500">Recevoir les notifications par email</p>
              </div>
              <Switch
                checked={formData.send_email_notifications}
                onCheckedChange={(checked) => setFormData({ ...formData, send_email_notifications: checked })}
              />
            </div>

            {formData.send_email_notifications && (
              <div className="space-y-2">
                <Label htmlFor="email">Email de notification</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemple.com"
                  value={formData.notification_email}
                  onChange={(e) => setFormData({ ...formData, notification_email: e.target.value })}
                />
                <p className="text-xs text-slate-500">Laissez vide pour utiliser l'email du propriétaire</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Types de notifications */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Types de Notifications Activés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Factures à échoir</p>
                  <p className="text-xs text-slate-500">Rappels avant échéance</p>
                </div>
                <Switch
                  checked={formData.enabled_types?.invoice_due_soon}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    enabled_types: { ...formData.enabled_types, invoice_due_soon: checked }
                  })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Factures en retard</p>
                  <p className="text-xs text-slate-500">Alertes pour factures échues</p>
                </div>
                <Switch
                  checked={formData.enabled_types?.invoice_overdue}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    enabled_types: { ...formData.enabled_types, invoice_overdue: checked }
                  })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Tiers inactifs</p>
                  <p className="text-xs text-slate-500">Alertes pour tiers sans activité</p>
                </div>
                <Switch
                  checked={formData.enabled_types?.third_party_inactive}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    enabled_types: { ...formData.enabled_types, third_party_inactive: checked }
                  })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Alertes budgétaires</p>
                  <p className="text-xs text-slate-500">Alertes de dépassement budget</p>
                </div>
                <Switch
                  checked={formData.enabled_types?.budget_alert}
                  onCheckedChange={(checked) => setFormData({
                    ...formData,
                    enabled_types: { ...formData.enabled_types, budget_alert: checked }
                  })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test */}
        <Card className="md:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Générer les notifications maintenant</h3>
                <p className="text-sm text-slate-600">Analyser les factures et tiers pour créer les notifications</p>
              </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Clock className="h-4 w-4 mr-2" />
                {generateMutation.isPending ? 'Génération...' : 'Générer'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}