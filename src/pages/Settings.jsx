import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { format } from 'date-fns';
import { createPageUrl } from '../utils';
import { 
  Building2, 
  Calendar,
  Save,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  Settings as SettingsIcon,
  Globe,
  BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/common/PageHeader';
import { toast } from 'sonner';
import { toastSupabaseError } from '@/lib/supabase-errors';
import { cn } from '@/lib/utils';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  loadDashboardPreferences,
  resetDashboardPreferences,
  saveDashboardPreferences,
} from '@/lib/dashboardPreferences';

export default function Settings() {
  const { user, loading: loadingUser } = useUser();
  const [companyData, setCompanyData] = useState({
    name: '',
    siret: '',
    tva_number: '',
    address: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    website: '',
    capital: '',
    legal_form: '',
    ape_code: '',
    currency: 'EUR',
    accounting_plan: 'PCG',
    fiscal_year_start: '01-01',
    invoice_prefix: 'FAC',
    invoice_notes: '',
    rcs: '',
    iban: '',
    bic: '',
    vat_regime: '',
    tax_regime: '',
    default_payment_terms: 30,
    legal_mentions: ''
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newFiscalYear, setNewFiscalYear] = useState({
    name: '',
    start_date: '',
    end_date: ''
  });
  const [deleteFY, setDeleteFY] = useState(null);
  const [dashboardPreferences, setDashboardPreferences] = useState(DEFAULT_DASHBOARD_PREFERENCES);

  const queryClient = useQueryClient();

  // Charger uniquement la company active
  const { data: currentCompany, isLoading: loadingCompany } = useQuery({
    queryKey: ['company', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', user.active_company_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 60000 // Cache 1 minute
  });

  const { data: fiscalYears = [], isLoading: loadingFiscalYears } = useQuery({
    queryKey: ['fiscal-years', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('fiscal_years').select('*').eq('company_id', user.active_company_id).order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 60000 // Cache 1 minute
  });

  useEffect(() => {
    if (currentCompany) {
      setCompanyData({
        name: currentCompany.name || '',
        siret: currentCompany.siret || '',
        tva_number: currentCompany.tva_number || '',
        address: currentCompany.address || '',
        postal_code: currentCompany.postal_code || '',
        city: currentCompany.city || '',
        phone: currentCompany.phone || '',
        email: currentCompany.email || '',
        website: currentCompany.website || '',
        capital: currentCompany.capital || '',
        legal_form: currentCompany.legal_form || '',
        ape_code: currentCompany.ape_code || '',
        currency: currentCompany.currency || 'EUR',
        accounting_plan: currentCompany.accounting_plan || 'PCG',
        fiscal_year_start: currentCompany.fiscal_year_start || '01-01',
        invoice_prefix: currentCompany.invoice_prefix || 'FAC',
        invoice_notes: currentCompany.invoice_notes || '',
        rcs: currentCompany.rcs || '',
        iban: currentCompany.iban || '',
        bic: currentCompany.bic || '',
        vat_regime: currentCompany.vat_regime || '',
        tax_regime: currentCompany.tax_regime || '',
        default_payment_terms: currentCompany.default_payment_terms ?? 30,
        legal_mentions: currentCompany.legal_mentions || ''
      });
    }
  }, [currentCompany]);

  useEffect(() => {
    setDashboardPreferences(loadDashboardPreferences(user?.active_company_id));
  }, [user?.active_company_id]);

  const updateDashboardPreference = (key, value) => {
    const next = { ...dashboardPreferences, [key]: value };
    setDashboardPreferences(next);
    saveDashboardPreferences(user?.active_company_id, next);
  };

  const resetDashboard = () => {
    resetDashboardPreferences(user?.active_company_id);
    setDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES);
    toast.success('Affichage du tableau de bord réinitialisé');
  };

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      const payload = {
        ...companyData,
        // Les colonnes contraintes n'acceptent pas la chaine vide.
        vat_regime: companyData.vat_regime || null,
        default_payment_terms: Number(companyData.default_payment_terms) || null
      };
      const { error } = await supabase.from('companies').update(payload).eq('id', user.active_company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company', user.active_company_id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast.success('Paramètres enregistrés');
    } catch (error) {
      toastSupabaseError(error, "Les paramètres n'ont pas pu être enregistrés.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFiscalYear = async () => {
    if (!newFiscalYear.name || !newFiscalYear.start_date || !newFiscalYear.end_date) return;
    
    try {
      const { error } = await supabase.from('fiscal_years').insert({
        ...newFiscalYear,
        year: Number.parseInt(newFiscalYear.start_date.slice(0, 4), 10),
        company_id: user.active_company_id,
        status: 'open',
        is_current: fiscalYears.length === 0
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      setNewFiscalYear({ name: '', start_date: '', end_date: '' });
      toast.success('Exercice créé');
    } catch (error) {
      toastSupabaseError(error, "L'exercice n'a pas pu être créé.");
    }
  };

  const handleSetCurrentFY = async (fy) => {
    try {
      // Unset all current
      for (const year of fiscalYears) {
        if (year.is_current) {
          const { error } = await supabase.from('fiscal_years').update({ is_current: false }).eq('id', year.id).eq('company_id', user.active_company_id);
          if (error) throw error;
        }
      }
      // Set new current
      const { error } = await supabase.from('fiscal_years').update({ is_current: true }).eq('id', fy.id).eq('company_id', user.active_company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
    } catch (error) {
      console.error('Update error:', error);
    }
  };

  const handleCloseFY = async (fy) => {
    try {
      const { error } = await supabase.from('fiscal_years').update({ status: 'closed' }).eq('id', fy.id).eq('company_id', user.active_company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success(`Exercice ${fy.name} clôturé : les écritures de la période sont verrouillées`);
    } catch (error) {
      toastSupabaseError(error, "L'exercice n'a pas pu être clôturé.");
    }
  };

  const handleReopenFY = async (fy) => {
    try {
      const { error } = await supabase.from('fiscal_years').update({ status: 'open' }).eq('id', fy.id).eq('company_id', user.active_company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      toast.success(`Exercice ${fy.name} rouvert`);
    } catch (error) {
      toastSupabaseError(error, "L'exercice n'a pas pu être rouvert.");
    }
  };

  const handleDeleteFY = async () => {
    if (deleteFY) {
      const { error } = await supabase.from('fiscal_years').delete().eq('id', deleteFY.id).eq('company_id', user.active_company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      setDeleteFY(null);
    }
  };

  // Utiliser ProtectedRoute mais garder la logique de chargement company
  if (loadingUser || loadingCompany) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Chargement des paramètres...</p>
        </div>
      </div>
    );
  }

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <SettingsIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-700 mb-4 font-medium">Société non trouvée</p>
          <Button 
            onClick={() => window.location.href = createPageUrl('CompanySelector')}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white"
          >
            Sélectionner une société
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        subtitle={`Configuration de ${currentCompany?.name || 'votre société'}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Personnaliser le tableau de bord
          </CardTitle>
          <CardDescription>Choisissez les blocs visibles sur votre tableau de bord.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            ['stats', 'Indicateurs clés', 'Chiffre d’affaires, achats, impayés et factures'],
            ['evolution', 'Évolution du chiffre d’affaires', 'Graphique des six derniers mois'],
            ['invoiceSummary', 'Synthèse des factures', 'Factures clients et fournisseurs'],
            ['alerts', 'Alertes et clients principaux', 'Factures en retard et top clients'],
            ['recentActivity', 'Activité récente', 'Dernières factures enregistrées'],
          ].map(([key, label, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div>
                <p className="font-medium text-slate-800">{label}</p>
                <p className="text-sm text-slate-500">{description}</p>
              </div>
              <Switch
                checked={dashboardPreferences[key]}
                onCheckedChange={(checked) => updateDashboardPreference(key, checked)}
                aria-label={`Afficher ${label}`}
              />
            </div>
          ))}
          <Button type="button" variant="outline" onClick={resetDashboard}>
            Réinitialiser l’affichage
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Settings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-[#1e3a5f] rounded-xl flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Informations de l'entreprise</CardTitle>
                <CardDescription>Ces informations apparaîtront sur vos documents</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Raison sociale</Label>
                <Input
                  value={companyData.name}
                  onChange={(e) => setCompanyData(d => ({ ...d, name: e.target.value }))}
                  placeholder="Ma Société SAS"
                />
              </div>
              <div className="space-y-2">
                <Label>Forme juridique</Label>
                <Input
                  value={companyData.legal_form}
                  onChange={(e) => setCompanyData(d => ({ ...d, legal_form: e.target.value }))}
                  placeholder="SAS, SARL, EI..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SIRET</Label>
                <Input
                  value={companyData.siret}
                  onChange={(e) => setCompanyData(d => ({ ...d, siret: e.target.value }))}
                  placeholder="123 456 789 00012"
                />
              </div>
              <div className="space-y-2">
                <Label>N° TVA intracommunautaire</Label>
                <Input
                  value={companyData.tva_number}
                  onChange={(e) => setCompanyData(d => ({ ...d, tva_number: e.target.value }))}
                  placeholder="FR12345678901"
                />
              </div>
              <div className="space-y-2">
                <Label>Code APE</Label>
                <Input
                  value={companyData.ape_code}
                  onChange={(e) => setCompanyData(d => ({ ...d, ape_code: e.target.value }))}
                  placeholder="6201Z"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={companyData.address}
                onChange={(e) => setCompanyData(d => ({ ...d, address: e.target.value }))}
                placeholder="1 rue de la Paix"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Code postal</Label>
                <Input
                  value={companyData.postal_code}
                  onChange={(e) => setCompanyData(d => ({ ...d, postal_code: e.target.value }))}
                  placeholder="75001"
                />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  value={companyData.city}
                  onChange={(e) => setCompanyData(d => ({ ...d, city: e.target.value }))}
                  placeholder="Paris"
                />
              </div>
              <div className="space-y-2">
                <Label>Capital social</Label>
                <Input
                  value={companyData.capital}
                  onChange={(e) => setCompanyData(d => ({ ...d, capital: e.target.value }))}
                  placeholder="10 000 €"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={companyData.phone}
                  onChange={(e) => setCompanyData(d => ({ ...d, phone: e.target.value }))}
                  placeholder="01 23 45 67 89"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={companyData.email}
                  onChange={(e) => setCompanyData(d => ({ ...d, email: e.target.value }))}
                  placeholder="contact@masociete.fr"
                />
              </div>
              <div className="space-y-2">
                <Label>Site web</Label>
                <Input
                  value={companyData.website}
                  onChange={(e) => setCompanyData(d => ({ ...d, website: e.target.value }))}
                  placeholder="www.masociete.fr"
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h4 className="font-medium text-slate-800 mb-4 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Paramètres comptables
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Devise</Label>
                  <Select value={companyData.currency} onValueChange={(v) => setCompanyData(d => ({ ...d, currency: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">Euro (€)</SelectItem>
                      <SelectItem value="USD">Dollar américain ($)</SelectItem>
                      <SelectItem value="GBP">Livre sterling (£)</SelectItem>
                      <SelectItem value="CHF">Franc suisse (CHF)</SelectItem>
                      <SelectItem value="CAD">Dollar canadien (CAD)</SelectItem>
                      <SelectItem value="XOF">Franc CFA BCEAO (FCFA)</SelectItem>
                      <SelectItem value="XAF">Franc CFA BEAC (FCFA)</SelectItem>
                      <SelectItem value="MAD">Dirham marocain (MAD)</SelectItem>
                      <SelectItem value="TND">Dinar tunisien (TND)</SelectItem>
                      <SelectItem value="DZD">Dinar algérien (DZD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Plan comptable</Label>
                  <Select value={companyData.accounting_plan} onValueChange={(v) => setCompanyData(d => ({ ...d, accounting_plan: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PCG">Plan Comptable Général (France)</SelectItem>
                      <SelectItem value="OHADA">OHADA</SelectItem>
                      <SelectItem value="SYSCOHADA">SYSCOHADA</SelectItem>
                      <SelectItem value="IAS_IFRS">IAS/IFRS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Début d'exercice</Label>
                  <Input
                    value={companyData.fiscal_year_start}
                    onChange={(e) => setCompanyData(d => ({ ...d, fiscal_year_start: e.target.value }))}
                    placeholder="01-01"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h4 className="font-medium text-slate-800 mb-4">Identité légale et bancaire</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>RCS</Label>
                  <Input
                    value={companyData.rcs}
                    onChange={(e) => setCompanyData(d => ({ ...d, rcs: e.target.value }))}
                    placeholder="Paris B 123 456 789"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Régime de TVA</Label>
                  <Select
                    value={companyData.vat_regime || 'none'}
                    onValueChange={(v) => setCompanyData(d => ({ ...d, vat_regime: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Non renseigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non renseigné</SelectItem>
                      <SelectItem value="franchise">Franchise en base</SelectItem>
                      <SelectItem value="reel_simplifie">Réel simplifié</SelectItem>
                      <SelectItem value="reel_normal">Réel normal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Régime fiscal</Label>
                  <Input
                    value={companyData.tax_regime}
                    onChange={(e) => setCompanyData(d => ({ ...d, tax_regime: e.target.value }))}
                    placeholder="IS, IR..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Délai de paiement par défaut (jours)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={companyData.default_payment_terms}
                    onChange={(e) => setCompanyData(d => ({ ...d, default_payment_terms: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IBAN</Label>
                  <Input
                    value={companyData.iban}
                    onChange={(e) => setCompanyData(d => ({ ...d, iban: e.target.value }))}
                    placeholder="FR76 ..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>BIC</Label>
                  <Input
                    value={companyData.bic}
                    onChange={(e) => setCompanyData(d => ({ ...d, bic: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Mentions légales</Label>
                <Textarea
                  value={companyData.legal_mentions}
                  onChange={(e) => setCompanyData(d => ({ ...d, legal_mentions: e.target.value }))}
                  placeholder="Mentions à faire figurer sur les documents commerciaux..."
                  rows={3}
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h4 className="font-medium text-slate-800 mb-4">Paramètres de facturation</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Préfixe des factures</Label>
                  <Input
                    value={companyData.invoice_prefix}
                    onChange={(e) => setCompanyData(d => ({ ...d, invoice_prefix: e.target.value }))}
                    placeholder="FAC"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Notes par défaut sur les factures</Label>
                <Textarea
                  value={companyData.invoice_notes}
                  onChange={(e) => setCompanyData(d => ({ ...d, invoice_notes: e.target.value }))}
                  placeholder="Conditions de paiement, mentions légales..."
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveCompany}
                disabled={saving}
                className={cn(
                  "gap-2",
                  saved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                )}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saved ? 'Enregistré !' : 'Enregistrer'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fiscal Years */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-500 rounded-xl flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>Exercices comptables</CardTitle>
                <CardDescription>Gérez vos exercices fiscaux</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Create new */}
            <div className="bg-slate-50 rounded-xl p-4">
              <h4 className="font-medium text-slate-800 mb-4">Nouvel exercice</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input
                    value={newFiscalYear.name}
                    onChange={(e) => setNewFiscalYear(f => ({ ...f, name: e.target.value }))}
                    placeholder="Exercice 2024"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de début</Label>
                  <Input
                    type="date"
                    value={newFiscalYear.start_date}
                    onChange={(e) => setNewFiscalYear(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date de fin</Label>
                  <Input
                    type="date"
                    value={newFiscalYear.end_date}
                    onChange={(e) => setNewFiscalYear(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleCreateFiscalYear}
                    className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                  >
                    <Plus className="h-4 w-4" />
                    Créer
                  </Button>
                </div>
              </div>
            </div>

            {/* List */}
            {loadingFiscalYears ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : fiscalYears.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400">Aucun exercice comptable créé</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fiscalYears.map((fy) => (
                  <div 
                    key={fy.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-colors",
                      fy.is_current 
                        ? "bg-blue-50 border-blue-200" 
                        : "bg-white border-slate-100"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-slate-800">{fy.name}</h4>
                          {fy.is_current && (
                            <Badge className="bg-blue-500 text-white">En cours</Badge>
                          )}
                          <Badge
                            className={
                              fy.status === 'closed'
                                ? 'bg-slate-200 text-slate-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }
                          >
                            {fy.status === 'closed' ? 'Clôturé' : 'Ouvert'}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          Du {format(new Date(fy.start_date), 'dd/MM/yyyy')} au {format(new Date(fy.end_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!fy.is_current && fy.status === 'open' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSetCurrentFY(fy)}
                        >
                          Définir comme actif
                        </Button>
                      )}
                      {fy.status === 'open' ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCloseFY(fy)}
                        >
                          Clôturer
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReopenFY(fy)}
                        >
                          Rouvrir
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteFY(fy)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteFY} onOpenChange={() => setDeleteFY(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'exercice</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'exercice "{deleteFY?.name}" ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteFY}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}