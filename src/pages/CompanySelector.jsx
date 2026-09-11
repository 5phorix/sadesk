import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { createPageUrl } from '../utils';
import { useUser } from '@/components/hooks/useUser';
import {
  Building2,
  Plus,
  ArrowRight,
  Globe,
  BookOpen,
  Check,
  Loader2,
  Archive,
  ArchiveRestore,
  Upload
} from 'lucide-react';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseErrorMessage, toastSupabaseError } from '@/lib/supabase-errors';

const CURRENCIES = [
  { code: 'EUR', name: 'Euro (€)', symbol: '€' },
  { code: 'USD', name: 'Dollar américain ($)', symbol: '$' },
  { code: 'GBP', name: 'Livre sterling (£)', symbol: '£' },
  { code: 'CHF', name: 'Franc suisse (CHF)', symbol: 'CHF' },
  { code: 'CAD', name: 'Dollar canadien (CAD)', symbol: 'CAD' },
  { code: 'XOF', name: 'Franc CFA BCEAO (XOF)', symbol: 'FCFA' },
  { code: 'XAF', name: 'Franc CFA BEAC (XAF)', symbol: 'FCFA' },
  { code: 'MAD', name: 'Dirham marocain (MAD)', symbol: 'MAD' },
  { code: 'TND', name: 'Dinar tunisien (TND)', symbol: 'TND' },
  { code: 'DZD', name: 'Dinar algérien (DZD)', symbol: 'DZD' }
];

const ACCOUNTING_PLANS = [
  { code: 'PCG', name: 'Plan Comptable Général (France)', description: 'Standard français' },
  { code: 'OHADA', name: 'OHADA', description: 'Afrique francophone' },
  { code: 'SYSCOHADA', name: 'SYSCOHADA', description: 'Système OHADA révisé' },
  { code: 'IAS_IFRS', name: 'IAS/IFRS', description: 'Normes internationales' }
];

export default function CompanySelector() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useUser();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newCompany, setNewCompany] = useState({
    name: '',
    siret: '',
    tva_number: '',
    address: '',
    postal_code: '',
    city: '',
    phone: '',
    email: '',
    legal_form: '',
    capital: '',
    currency: 'EUR',
    accounting_plan: 'PCG',
    country: 'France',
    logo_url: ''
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const { data: companyUsers = [] } = useQuery({
    queryKey: ['company-users', user?.email],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_users').select('*').eq('user_email', user?.email).eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const handleSelectCompany = async (company) => {
    try {
      await updateUser({ active_company_id: company.id });
      window.location.href = createPageUrl('Dashboard');
    } catch (error) {
      setCreateError(getSupabaseErrorMessage(error, "La société n'a pas pu être sélectionnée."));
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const filePath = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from('documents').upload(filePath, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
      setNewCompany(c => ({ ...c, logo_url: data.publicUrl }));
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const { data: company, error: companyError } = await supabase.rpc(
        'create_company_for_current_user',
        { company_data: newCompany }
      );
      if (companyError) throw companyError;

      await updateUser({ active_company_id: company.id });

      queryClient.invalidateQueries({ queryKey: ['companies'] });
      window.location.href = createPageUrl('Dashboard');
    } catch (error) {
      console.error('Create error:', error);
      setCreateError(getSupabaseErrorMessage(error, "La société n'a pas pu être créée."));
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (company, event) => {
    event.stopPropagation();
    try {
      const rpc = company.archived_at ? 'restore_company' : 'archive_company';
      const { error } = await supabase.rpc(rpc, { target_company_id: company.id });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success(company.archived_at ? 'Société restaurée' : 'Société archivée');
    } catch (error) {
      toastSupabaseError(error, "L'opération sur la société a échoué.");
    }
  };

  const activeCompanies = companies.filter((c) => !c.archived_at);
  const myCompanies = activeCompanies.filter(c => c.owner_email === user?.email);
  const sharedCompanies = companyUsers
    .filter(cu => cu.role !== 'owner')
    .map(cu => activeCompanies.find(c => c.id === cu.company_id))
    .filter(Boolean);
  const archivedCompanies = companies.filter((c) => c.archived_at);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="/logo%20sadesk.png" 
              alt="Sadesk" 
              className="h-12 w-12"
            />
            <h1 className="text-4xl font-bold text-slate-800">Sadesk</h1>
          </div>
          <p className="text-slate-600">Sélectionnez une société ou créez-en une nouvelle</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Mes sociétés */}
            {myCompanies.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">Mes sociétés</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myCompanies.map(company => (
                    <Card 
                      key={company.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-[#1e3a5f]"
                      onClick={() => handleSelectCompany(company)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] flex items-center justify-center">
                            <Building2 className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700">Propriétaire</Badge>
                        </div>
                        <CardTitle className="mt-4">{company.name}</CardTitle>
                        <CardDescription className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {CURRENCIES.find(c => c.code === company.currency)?.symbol}
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {company.accounting_plan}
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#2d4a6f]">
                          Ouvrir
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full text-slate-500"
                          onClick={(event) => handleArchive(company, event)}
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          Archiver
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Sociétés partagées */}
            {sharedCompanies.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">Sociétés partagées</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sharedCompanies.map(company => {
                    const myRole = companyUsers.find(cu => cu.company_id === company.id)?.role;
                    return (
                      <Card 
                        key={company.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-blue-500"
                        onClick={() => handleSelectCompany(company)}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                              <Building2 className="h-6 w-6 text-white" />
                            </div>
                            <Badge variant="outline">{myRole}</Badge>
                          </div>
                          <CardTitle className="mt-4">{company.name}</CardTitle>
                          <CardDescription className="flex items-center gap-4 mt-2">
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {CURRENCIES.find(c => c.code === company.currency)?.symbol}
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {company.accounting_plan}
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full gap-2" variant="outline">
                            Ouvrir
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sociétés archivées */}
            {archivedCompanies.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">Sociétés archivées</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {archivedCompanies.map(company => (
                    <Card key={company.id} className="border-2 bg-slate-50">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="h-12 w-12 rounded-xl bg-slate-300 flex items-center justify-center">
                            <Archive className="h-6 w-6 text-white" />
                          </div>
                          <Badge className="bg-slate-200 text-slate-700">Archivée</Badge>
                        </div>
                        <CardTitle className="mt-4 text-slate-600">{company.name}</CardTitle>
                        <CardDescription className="mt-2">
                          Données consultables mais figées.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={(event) => handleArchive(company, event)}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                          Restaurer
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Créer nouvelle société */}
            <Card className="border-2 border-dashed border-slate-300 bg-slate-50/50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="h-16 w-16 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center mb-4">
                  <Plus className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Créer une nouvelle société</h3>
                <p className="text-slate-500 text-center mb-6 max-w-md">
                  Gérez plusieurs entreprises avec Sadesk
                </p>
                <Button 
                  onClick={() => setShowCreate(true)}
                  className="gap-2 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle société
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Dialog création */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créer une nouvelle société</DialogTitle>
            <DialogDescription>
              Configurez les paramètres de base de votre société
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCompany} className="space-y-6">
            {createError && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                {createError}
              </p>
            )}

            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo de la société</Label>
              <div className="flex items-center gap-4">
                {newCompany.logo_url ? (
                  <img src={newCompany.logo_url} alt="Logo" className="h-16 w-16 object-contain rounded-lg border border-slate-200" />
                ) : (
                  <div className="h-16 w-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    id="logo-upload"
                    className="hidden"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('logo-upload').click()}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {newCompany.logo_url ? 'Changer le logo' : 'Télécharger un logo'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Informations de base */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-slate-800">Informations générales</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom de la société *</Label>
                  <Input
                    value={newCompany.name}
                    onChange={(e) => setNewCompany(c => ({ ...c, name: e.target.value }))}
                    placeholder="Ma Société SAS"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Forme juridique</Label>
                  <Input
                    value={newCompany.legal_form}
                    onChange={(e) => setNewCompany(c => ({ ...c, legal_form: e.target.value }))}
                    placeholder="SAS, SARL, EI..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>SIRET</Label>
                  <Input
                    value={newCompany.siret}
                    onChange={(e) => setNewCompany(c => ({ ...c, siret: e.target.value }))}
                    placeholder="123 456 789 00012"
                  />
                </div>

                <div className="space-y-2">
                  <Label>N° TVA intracommunautaire</Label>
                  <Input
                    value={newCompany.tva_number}
                    onChange={(e) => setNewCompany(c => ({ ...c, tva_number: e.target.value }))}
                    placeholder="FR12345678901"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Capital social</Label>
                  <Input
                    value={newCompany.capital}
                    onChange={(e) => setNewCompany(c => ({ ...c, capital: e.target.value }))}
                    placeholder="10 000 €"
                  />
                </div>
              </div>
            </div>

            {/* Adresse */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-slate-800">Adresse</h3>
              
              <div className="space-y-2">
                <Label>Adresse complète</Label>
                <Input
                  value={newCompany.address}
                  onChange={(e) => setNewCompany(c => ({ ...c, address: e.target.value }))}
                  placeholder="1 rue de la Paix"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Code postal</Label>
                  <Input
                    value={newCompany.postal_code}
                    onChange={(e) => setNewCompany(c => ({ ...c, postal_code: e.target.value }))}
                    placeholder="75001"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ville</Label>
                  <Input
                    value={newCompany.city}
                    onChange={(e) => setNewCompany(c => ({ ...c, city: e.target.value }))}
                    placeholder="Paris"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pays</Label>
                  <Input
                    value={newCompany.country}
                    onChange={(e) => setNewCompany(c => ({ ...c, country: e.target.value }))}
                    placeholder="France"
                  />
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-slate-800">Contact</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    value={newCompany.phone}
                    onChange={(e) => setNewCompany(c => ({ ...c, phone: e.target.value }))}
                    placeholder="01 23 45 67 89"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newCompany.email}
                    onChange={(e) => setNewCompany(c => ({ ...c, email: e.target.value }))}
                    placeholder="contact@masociete.fr"
                  />
                </div>
              </div>
            </div>

            {/* Paramètres comptables */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-slate-800">Paramètres comptables</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Devise *</Label>
                  <Select value={newCompany.currency} onValueChange={(v) => setNewCompany(c => ({ ...c, currency: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(curr => (
                        <SelectItem key={curr.code} value={curr.code}>
                          {curr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Plan comptable *</Label>
                  <Select value={newCompany.accounting_plan} onValueChange={(v) => setNewCompany(c => ({ ...c, accounting_plan: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNTING_PLANS.map(plan => (
                        <SelectItem key={plan.code} value={plan.code}>
                          <div>
                            <div className="font-medium">{plan.name}</div>
                            <div className="text-xs text-slate-500">{plan.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="flex-1">
                Annuler
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Créer la société
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}