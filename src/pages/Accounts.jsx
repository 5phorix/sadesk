import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { 
  Plus, 
  Search, 
  BookOpen, 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  Loader2,
  Download,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Building,
  TrendingDown,
  TrendingUp
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { 
  getPlanClasses, 
  getClassMeta, 
  inferAccountMeta,
  isPrincipalAccount
} from '@/lib/accounting';

export default function Accounts() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [deleteAccount, setDeleteAccount] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importingPlan, setImportingPlan] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null);
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' | 'table'
  const [selectedClassTab, setSelectedClassTab] = useState('all');

  const [filters, setFilters] = useState({
    search: '',
    scope: 'all', // 'all' | 'bilan' | 'gestion' | 'special' | 'auxiliary'
    status: 'all', // 'all' | 'active' | 'inactive'
    type: 'all'
  });

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    label: '',
    class: '4',
    type: 'bilan',
    category: 'actif',
    parent_code: '',
    is_auxiliary: false,
    is_active: true,
    notes: ''
  });

  const { user, loading: loadingUser } = useUser();
  const queryClient = useQueryClient();

  const activeCompanyId = user?.active_company_id;

  // 1. Récupération des informations de la société active (dont le plan comptable configuré)
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company_plan', activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, accounting_plan, currency')
        .eq('id', activeCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId
  });

  const currentPlanCode = (company?.accounting_plan || 'PCG').toUpperCase();
  const availableClasses = useMemo(() => getPlanClasses(currentPlanCode), [currentPlanCode]);

  // 2. Récupération des comptes de la société pour le plan actif (ou sans plan spécifique)
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts', activeCompanyId, currentPlanCode],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('company_id', activeCompanyId)
        .or(`plan_code.eq.${currentPlanCode},plan_code.is.null`)
        .order('code', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeCompanyId
  });

  const isDataLoading = loadingUser || accountsLoading || companyLoading;

  // 3. Calcul des statistiques en temps réel
  const stats = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter(a => a.is_active !== false).length;
    const auxiliary = accounts.filter(a => a.is_auxiliary).length;
    
    // Répartition par grand bloc
    const bilan = accounts.filter(a => ['1', '2', '3', '4', '5'].includes(String(a.class))).length;
    const charges = accounts.filter(a => String(a.class) === '6').length;
    const produits = accounts.filter(a => String(a.class) === '7').length;
    const speciauxAnalytique = accounts.filter(a => ['8', '9'].includes(String(a.class))).length;

    // Compteurs par classe individuelle
    const byClass = {};
    availableClasses.forEach(cls => {
      byClass[cls.code] = accounts.filter(a => String(a.class) === cls.code).length;
    });

    return {
      total,
      active,
      inactive: total - active,
      auxiliary,
      bilan,
      charges,
      produits,
      speciauxAnalytique,
      byClass
    };
  }, [accounts, availableClasses]);

  // 4. Filtrage dynamique des comptes
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      // Recherche textuelle sur le code et le libellé
      if (filters.search) {
        const query = filters.search.toLowerCase().trim();
        const codeMatch = String(acc.code || '').toLowerCase().includes(query);
        const labelMatch = String(acc.label || '').toLowerCase().includes(query);
        if (!codeMatch && !labelMatch) return false;
      }

      // Onglet de classe
      if (selectedClassTab !== 'all' && String(acc.class) !== selectedClassTab) {
        return false;
      }

      // Filtre de scope
      if (filters.scope === 'bilan' && !['1', '2', '3', '4', '5'].includes(String(acc.class))) return false;
      if (filters.scope === 'gestion' && !['6', '7'].includes(String(acc.class))) return false;
      if (filters.scope === 'special' && !['8', '9'].includes(String(acc.class))) return false;
      if (filters.scope === 'auxiliary' && !acc.is_auxiliary) return false;

      // Filtre de statut
      if (filters.status === 'active' && acc.is_active === false) return false;
      if (filters.status === 'inactive' && acc.is_active !== false) return false;

      // Filtre de type
      if (filters.type !== 'all' && acc.category !== filters.type) return false;

      return true;
    });
  }, [accounts, filters, selectedClassTab]);

  // 5. Comptes groupés par classe pour l'affichage "grouped"
  const groupedAccounts = useMemo(() => {
    return availableClasses.map(cls => {
      const clsAccounts = filteredAccounts.filter(acc => String(acc.class) === cls.code);
      return {
        ...cls,
        accounts: clsAccounts
      };
    }).filter(group => selectedClassTab === 'all' ? group.accounts.length > 0 : group.code === selectedClassTab);
  }, [availableClasses, filteredAccounts, selectedClassTab]);

  // 6. Gestion du formulaire intelligent
  const handleCodeChange = (newCode) => {
    const inferred = inferAccountMeta(newCode, currentPlanCode);
    setFormData(prev => ({
      ...prev,
      code: newCode,
      class: inferred.classCode || prev.class,
      type: inferred.type || prev.type,
      category: inferred.category || prev.category,
      parent_code: newCode.length > 2 ? newCode.slice(0, newCode.length - 1) : prev.parent_code,
      is_auxiliary: newCode.startsWith('401') || newCode.startsWith('411') ? true : prev.is_auxiliary
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSave = {
        code: formData.code.trim(),
        label: formData.label.trim(),
        class: formData.class,
        type: formData.type,
        category: formData.category,
        parent_code: formData.parent_code?.trim() || null,
        is_auxiliary: Boolean(formData.is_auxiliary),
        is_active: Boolean(formData.is_active),
        notes: formData.notes?.trim() || null,
        plan_code: currentPlanCode
      };

      if (selectedAccount) {
        const { error } = await supabase
          .from('accounts')
          .update(dataToSave)
          .eq('id', selectedAccount.id);
        if (error) throw error;
      } else {
        dataToSave.company_id = user?.active_company_id;
        const { error } = await supabase
          .from('accounts')
          .insert(dataToSave);
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setFormOpen(false);
      setSelectedAccount(null);
    } catch (error) {
      console.error('Save error:', error);
      alert('Erreur lors de l’enregistrement du compte : ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteAccount) {
      try {
        const { error } = await supabase
          .from('accounts')
          .delete()
          .eq('id', deleteAccount.id);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
        setDeleteAccount(null);
      } catch (error) {
        alert('Impossible de supprimer ce compte : il est probablement lié à des écritures ou factures.');
      }
    }
  };

  const handleToggleActive = async (account, e) => {
    e.stopPropagation();
    try {
      const updatedStatus = !account.is_active;
      const { error } = await supabase
        .from('accounts')
        .update({ is_active: updatedStatus })
        .eq('id', account.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleEdit = (account) => {
    setSelectedAccount(account);
    setFormData({
      code: account.code || '',
      label: account.label || '',
      class: account.class || '4',
      type: account.type || 'bilan',
      category: account.category || 'actif',
      parent_code: account.parent_code || '',
      is_auxiliary: Boolean(account.is_auxiliary),
      is_active: account.is_active !== false,
      notes: account.notes || ''
    });
    setFormOpen(true);
  };

  const handleNew = () => {
    setSelectedAccount(null);
    setFormData({
      code: '',
      label: '',
      class: '4',
      type: 'bilan',
      category: 'actif',
      parent_code: '',
      is_auxiliary: false,
      is_active: true,
      notes: ''
    });
    setFormOpen(true);
  };

  // Basculement instantané de référentiel (PCG <-> SYSCOHADA)
  const handleSwitchPlan = async (targetPlan) => {
    if (!activeCompanyId || targetPlan === currentPlanCode) return;
    try {
      await supabase
        .from('companies')
        .update({ accounting_plan: targetPlan })
        .eq('id', activeCompanyId);

      const { count } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', activeCompanyId)
        .eq('plan_code', targetPlan);

      if (!count || count === 0) {
        await handleImportOfficialPlan(targetPlan);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['company_plan'] });
        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      }
    } catch (err) {
      console.error('Error switching plan:', err);
    }
  };

  // 7. Synchronisation / Import officiel du plan complet
  const handleImportOfficialPlan = async (planToImport) => {
    if (!user?.active_company_id) return;
    setImportingPlan(true);
    setImportFeedback(null);
    try {
      const { data: catalogItems, error: catalogError } = await supabase
        .from('accounting_plan_catalog')
        .select('*')
        .eq('plan_code', planToImport);

      if (catalogError) throw catalogError;
      if (!catalogItems || catalogItems.length === 0) {
        throw new Error(`Aucun compte disponible dans le catalogue pour le plan ${planToImport}`);
      }

      // Formatage pour la société
      const accountsToUpsert = catalogItems.map(item => ({
        company_id: user.active_company_id,
        code: item.code,
        label: item.label,
        class: item.class,
        parent_code: item.parent_code,
        type: item.type || 'general',
        category: item.category,
        is_auxiliary: Boolean(item.is_auxiliary),
        is_active: item.is_active !== false,
        plan_code: planToImport,
        review_required: Boolean(item.review_required)
      }));

      // Insertion par batch de 150
      for (let i = 0; i < accountsToUpsert.length; i += 150) {
        const chunk = accountsToUpsert.slice(i, i + 150);
        const { error: upsertError } = await supabase
          .from('accounts')
          .upsert(chunk, { onConflict: 'company_id,code' });
        if (upsertError) throw upsertError;
      }

      // Mettre à jour le plan de l'entreprise si nécessaire
      await supabase
        .from('companies')
        .update({ accounting_plan: planToImport })
        .eq('id', user.active_company_id);

      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['company_plan'] });
      setImportFeedback({
        success: true,
        message: `${accountsToUpsert.length} comptes du plan ${planToImport} ont été importés et synchronisés avec succès !`
      });
    } catch (err) {
      console.error('Import error:', err);
      setImportFeedback({
        success: false,
        message: 'Erreur lors de l’importation : ' + (err.message || 'Erreur inconnue')
      });
    } finally {
      setImportingPlan(false);
    }
  };

  // 8. Export CSV du plan comptable
  const handleExportCSV = () => {
    if (accounts.length === 0) return;
    const headers = ['Code', 'Libellé', 'Classe', 'Type', 'Catégorie', 'Compte Parent', 'Auxiliaire', 'Actif'];
    const rows = accounts.map(a => [
      `"${a.code}"`,
      `"${(a.label || '').replace(/"/g, '""')}"`,
      `"${a.class || ''}"`,
      `"${a.type || ''}"`,
      `"${a.category || ''}"`,
      `"${a.parent_code || ''}"`,
      a.is_auxiliary ? 'Oui' : 'Non',
      a.is_active !== false ? 'Oui' : 'Non'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `plan-comptable-${currentPlanCode}-${company?.name || 'sadesk'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isDataLoading) {
    return (
      <div className="space-y-8 pb-16 animate-pulse">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200">
          <div className="space-y-2">
            <div className="h-8 bg-slate-200 rounded-xl w-64" />
            <div className="h-4 bg-slate-100 rounded-md w-96" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 bg-slate-200 rounded-xl w-32" />
            <div className="h-10 bg-slate-200 rounded-xl w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 h-24" />
          ))}
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6">
              <div className="h-6 bg-slate-200 rounded w-48 mb-4" />
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-12 bg-slate-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* En-tête de page moderne */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
              Plan Comptable
            </h1>
            
            {/* Sélecteur rapide de référentiel comptable (PCG / SYSCOHADA) */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleSwitchPlan('PCG')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  currentPlanCode === 'PCG'
                    ? "bg-[#1e3a5f] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <span>PCG France</span>
                <span className="text-[10px] opacity-80">(Classes 1-8 · 850 cptes)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchPlan('SYSCOHADA')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                  currentPlanCode === 'SYSCOHADA'
                    ? "bg-[#1e3a5f] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <span>SYSCOHADA OHADA</span>
                <span className="text-[10px] opacity-80">(Classes 1-9 · 1 215 cptes)</span>
              </button>
            </div>
          </div>
          <p className="text-slate-500 mt-1 text-sm lg:text-base">
            Structure et nomenclature officielle des comptes · Référentiel actif : <strong>{currentPlanCode === 'SYSCOHADA' ? 'SYSCOHADA (OHADA révisé - Classes 1 à 9)' : 'PCG (France - Classes 1 à 8)'}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="gap-2 text-slate-700 hover:bg-slate-100/80 border-slate-200"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Exporter CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setImportFeedback(null);
              setImportModalOpen(true);
            }}
            className="gap-2 bg-indigo-50/70 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
          >
            <Sparkles className="h-4 w-4 text-indigo-600" />
            Synchroniser plan officiel
          </Button>

          <Button 
            onClick={handleNew}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white shadow-sm gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouveau compte
          </Button>
        </div>
      </div>

      {/* Cartes KPI et statistiques globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Comptes</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          <p className="text-xs text-slate-500 mt-1">
            <span className="text-emerald-600 font-medium">{stats.active} actifs</span> · {stats.inactive} inactifs
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Bilan (Cl. 1-5)</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
              <Building className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-950">{stats.bilan}</div>
          <p className="text-xs text-slate-500 mt-1">Capitaux, Immos, Stocks, Tiers, Trésorerie</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Charges (Cl. 6)</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-950">{stats.charges}</div>
          <p className="text-xs text-slate-500 mt-1">Achats, services, personnel, impôts</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Produits (Cl. 7)</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-teal-950">{stats.produits}</div>
          <p className="text-xs text-slate-500 mt-1">Ventes et prestations facturées</p>
        </div>

        <div className="col-span-2 md:col-span-4 lg:col-span-1 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Spéciaux & HAO</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-950">{stats.speciauxAnalytique}</div>
          <p className="text-xs text-slate-500 mt-1">Classes 8 & 9 (Engagements / Analytique)</p>
        </div>
      </div>

      {/* Navigation par Onglets de Classe (Toutes les classes 1 à 9) */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedClassTab('all')}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all shrink-0 flex items-center gap-2",
              selectedClassTab === 'all' 
                ? "bg-slate-900 text-white shadow-xs" 
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <span>Toutes les classes</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px]",
              selectedClassTab === 'all' ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600"
            )}>
              {stats.total}
            </span>
          </button>

          {availableClasses.map((cls) => {
            const count = stats.byClass[cls.code] || 0;
            const isSelected = selectedClassTab === cls.code;
            return (
              <button
                key={cls.code}
                type="button"
                onClick={() => setSelectedClassTab(cls.code)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all shrink-0 flex items-center gap-2 border",
                  isSelected
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-xs"
                    : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <span>Cl. {cls.code} · {cls.shortLabel}</span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-mono",
                  isSelected ? "bg-[#142640] text-blue-100" : "bg-slate-100 text-slate-600"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Barre de Recherche et Filtres Avancés */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par numéro de compte ou libellé (ex: 411, Banques, Achats)..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-10 h-11 bg-white border-slate-200 rounded-xl focus:border-blue-600"
          />
          {filters.search && (
            <button
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Effacer
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre par grand bloc */}
          <Select value={filters.scope} onValueChange={(v) => setFilters(f => ({ ...f, scope: v }))}>
            <SelectTrigger className="h-11 w-44 bg-white border-slate-200 rounded-xl text-xs">
              <SelectValue placeholder="Périmètre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tout le plan</SelectItem>
              <SelectItem value="subaccounts">Sous-comptes personnalisés (≥ 3 chiffres)</SelectItem>
              <SelectItem value="principals">Comptes principaux normatifs (≤ 2 chiffres)</SelectItem>
              <SelectItem value="bilan">Comptes de Bilan (1-5)</SelectItem>
              <SelectItem value="gestion">Comptes de Gestion (6-7)</SelectItem>
              <SelectItem value="special">Comptes Spéciaux (8-9)</SelectItem>
              <SelectItem value="auxiliary">Comptes Auxiliaires</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre par statut */}
          <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v }))}>
            <SelectTrigger className="h-11 w-32 bg-white border-slate-200 rounded-xl text-xs">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="inactive">Inactifs</SelectItem>
            </SelectContent>
          </Select>

          {/* Bascule de vue Groupée / Liste */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                viewMode === 'grouped' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Par classe
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                viewMode === 'table' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
              )}
            >
              <FolderTree className="h-3.5 w-3.5" />
              Liste simple
            </button>
          </div>
        </div>
      </div>

      {/* Affichage de la liste des comptes */}
      {isDataLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 animate-pulse">
              <div className="h-6 bg-slate-200 rounded w-48 mb-4" />
              <div className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-12 bg-slate-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
            <BookOpen className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">Aucun compte trouvé</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1 mb-6">
            Aucun compte ne correspond à vos filtres actuels. Vous pouvez créer un compte personnalisé ou importer le plan comptable officiel complet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setFilters({ search: '', scope: 'all', status: 'all', type: 'all' });
                setSelectedClassTab('all');
              }}
            >
              Réinitialiser les filtres
            </Button>
            <Button 
              onClick={() => setImportModalOpen(true)}
              className="bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Importer le plan {currentPlanCode}
            </Button>
          </div>
        </div>
      ) : viewMode === 'grouped' ? (
        /* VUE GROUPÉE PAR CLASSE AVEC CARTES STYLISÉES */
        <div className="space-y-6">
          {groupedAccounts.map(group => (
            <div 
              key={group.code} 
              className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:border-slate-300 transition-all"
            >
              {/* En-tête de classe */}
              <div className="p-4 sm:px-6 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={cn("px-3 py-1 rounded-xl text-xs font-bold font-mono tracking-wider border uppercase", group.color)}>
                    Classe {group.code}
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                      {group.label}
                    </h3>
                    <p className="text-xs text-slate-500 hidden sm:block">
                      {group.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs font-medium bg-white border border-slate-200 text-slate-700">
                    {group.accounts.length} compte{group.accounts.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>

              {/* Lignes de comptes */}
              <div className="divide-y divide-slate-100">
                {group.accounts.map(account => {
                  const isPrincipal = isPrincipalAccount(account);
                  return (
                    <div 
                      key={account.id || account.code}
                      className={cn(
                        "p-3.5 sm:px-6 flex items-center justify-between transition-colors group",
                        isPrincipal ? "bg-slate-50/40 hover:bg-slate-50" : "hover:bg-blue-50/30"
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Numéro de compte badge monospace */}
                        <div className={cn(
                          "h-10 px-2.5 rounded-xl border flex items-center justify-center shrink-0 font-mono text-sm font-bold",
                          isPrincipal ? "bg-slate-200/70 border-slate-300 text-slate-900" : "bg-white border-blue-200 text-blue-900"
                        )}>
                          {account.code}
                        </div>

                        {/* Libellé et méta */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(
                              "text-sm truncate",
                              isPrincipal ? "font-bold text-slate-900" : "font-medium text-slate-800"
                            )}>
                              {account.label}
                            </span>
                            {isPrincipal ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-300">
                                Racine légale
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                                Personnalisable
                              </Badge>
                            )}
                            {account.is_auxiliary && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50/60 text-blue-700 border-blue-200">
                                Auxiliaire
                              </Badge>
                            )}
                            {account.parent_code && (
                              <span className="text-[11px] font-mono text-slate-400">
                                (parent: {account.parent_code})
                              </span>
                            )}
                            {account.is_active === false && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                                Inactif
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span className="capitalize">{account.category || account.type || 'Général'}</span>
                            {account.notes && <span>• {account.notes}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Actions & Menu */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isPrincipal ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleAddSubAccount(account)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#1e3a5f] hover:bg-blue-50 h-8 px-2.5 hidden sm:flex border-blue-200"
                          >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Créer sous-compte
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(account)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-900 h-8 px-2.5 hidden sm:flex"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Modifier
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {isPrincipal ? (
                              <DropdownMenuItem onClick={() => handleAddSubAccount(account)}>
                                <Plus className="h-4 w-4 mr-2 text-blue-600" />
                                Créer un sous-compte ({account.code}xxx)
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleEdit(account)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifier le sous-compte
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => handleToggleActive(account, e)}>
                              <CheckCircle2 className="h-4 w-4 mr-2 text-slate-500" />
                              {account.is_active !== false ? 'Désactiver le compte' : 'Activer le compte'}
                            </DropdownMenuItem>
                            {!isPrincipal && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => setDeleteAccount(account)}
                                  className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Supprimer le sous-compte
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* VUE TABLE SIMPLE AVEC TOUS LES COMPTES */
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200/80 tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Code</th>
                  <th className="py-3.5 px-4">Libellé</th>
                  <th className="py-3.5 px-4">Classe</th>
                  <th className="py-3.5 px-4">Catégorie</th>
                  <th className="py-3.5 px-4 text-center">Auxiliaire</th>
                  <th className="py-3.5 px-4 text-center">Statut</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map(account => {
                  const meta = getClassMeta(account.class, currentPlanCode);
                  return (
                    <tr key={account.id || account.code} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 sm:px-6">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/70">
                          {account.code}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {account.label}
                        {account.parent_code && (
                          <span className="block text-xs font-mono text-slate-400">
                            Parent: {account.parent_code}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border", meta.color)}>
                          Cl. {account.class}
                        </span>
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600">
                        {account.category || account.type || 'Général'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {account.is_auxiliary ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                            Oui
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge 
                          variant="outline" 
                          className={cn("text-[10px]", account.is_active !== false ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}
                        >
                          {account.is_active !== false ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(account)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setDeleteAccount(account)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal d'import du plan officiel complet */}
      <AlertDialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">
                  Importer le plan comptable officiel
                </AlertDialogTitle>
                <p className="text-sm text-slate-500">
                  Synchronisation du catalogue officiel ({currentPlanCode})
                </p>
              </div>
            </div>
            <AlertDialogDescription className="text-slate-600 space-y-3 pt-2">
              <span>
                Cette action va charger l’ensemble des comptes normalisés dans votre société <strong>{company?.name || ''}</strong> sans écraser vos comptes personnalisés existants.
              </span>
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 block">Plan PCG (France)</span>
                  <span className="text-slate-500">850 comptes officiels (Classes 1 à 8)</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-700 block">Plan SYSCOHADA (Afrique)</span>
                  <span className="text-slate-500">1 215 comptes officiels (Classes 1 à 9)</span>
                </div>
              </div>

              {importFeedback && (
                <div className={cn(
                  "p-3 rounded-xl text-xs font-medium border flex items-center gap-2",
                  importFeedback.success 
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-red-50 text-red-800 border-red-200"
                )}>
                  {importFeedback.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />}
                  <span>{importFeedback.message}</span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel disabled={importingPlan}>Fermer</AlertDialogCancel>
            <Button
              type="button"
              disabled={importingPlan}
              onClick={() => handleImportOfficialPlan(currentPlanCode)}
              className="bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white"
            >
              {importingPlan ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importation en cours...
                </>
              ) : (
                `Importer le plan ${currentPlanCode}`
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sheet Formulaire Création / Modification de Compte */}
      <Sheet open={formOpen} onOpenChange={() => setFormOpen(false)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl">
              {selectedAccount ? 'Modifier le compte' : 'Nouveau compte comptable'}
            </SheetTitle>
            <SheetDescription>
              Renseignez le numéro et les propriétés du compte dans le plan {currentPlanCode}.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Numéro de compte *
                </Label>
                <Input
                  value={formData.code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="ex: 411001, 606100"
                  className="font-mono text-base font-semibold"
                  disabled={selectedAccount && isPrincipalAccount(selectedAccount)}
                  required
                />
                {selectedAccount && isPrincipalAccount(selectedAccount) && (
                  <p className="text-[11px] text-amber-600 font-medium">
                    Compte principal normatif non modifiable (créez des sous-comptes à 3 chiffres ou plus).
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Classe comptable *
                </Label>
                <Select value={formData.class} onValueChange={(v) => setFormData(f => ({ ...f, class: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClasses.map(cls => (
                      <SelectItem key={cls.code} value={cls.code}>
                        Classe {cls.code} · {cls.shortLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Libellé du compte *
              </Label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData(f => ({ ...f, label: e.target.value }))}
                placeholder="ex: Fournisseurs divers, Ventes de prestations"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Type de compte
                </Label>
                <Select value={formData.type} onValueChange={(v) => setFormData(f => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bilan">Bilan</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                    <SelectItem value="produit">Produit</SelectItem>
                    <SelectItem value="tiers">Tiers</SelectItem>
                    <SelectItem value="banque">Banque / Trésorerie</SelectItem>
                    <SelectItem value="tva">TVA</SelectItem>
                    <SelectItem value="hao">HAO (Hors Activités Ordinaires)</SelectItem>
                    <SelectItem value="analytique">Analytique & Engagements</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Catégorie
                </Label>
                <Select value={formData.category} onValueChange={(v) => setFormData(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="passif">Passif</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                    <SelectItem value="produit">Produit</SelectItem>
                    <SelectItem value="special">Spécial / Analytique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Compte parent (racine)
              </Label>
              <Input
                value={formData.parent_code}
                onChange={(e) => setFormData(f => ({ ...f, parent_code: e.target.value }))}
                placeholder="ex: 411 ou 60"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <Label className="text-sm font-semibold text-slate-800">Compte auxiliaire</Label>
                  <p className="text-xs text-slate-500">Pour les sous-comptes clients ou fournisseurs</p>
                </div>
                <Switch
                  checked={formData.is_auxiliary}
                  onCheckedChange={(v) => setFormData(f => ({ ...f, is_auxiliary: v }))}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <Label className="text-sm font-semibold text-slate-800">Compte actif</Label>
                  <p className="text-xs text-slate-500">Permet la saisie d’écritures et factures</p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData(f => ({ ...f, is_active: v }))}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t border-slate-200/80">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1">
                Annuler
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white"
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedAccount ? 'Enregistrer les modifications' : 'Créer le compte'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Dialogue de suppression */}
      <AlertDialog open={!!deleteAccount} onOpenChange={() => setDeleteAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le compte</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le compte <strong>{deleteAccount?.code} - {deleteAccount?.label}</strong> ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}