import React, { useState } from 'react';
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
  Loader2
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
import PageHeader from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

const CLASSES = [
  { code: '1', label: 'Capitaux', color: 'bg-purple-100 text-purple-700' },
  { code: '2', label: 'Immobilisations', color: 'bg-blue-100 text-blue-700' },
  { code: '3', label: 'Stocks', color: 'bg-cyan-100 text-cyan-700' },
  { code: '4', label: 'Tiers', color: 'bg-green-100 text-green-700' },
  { code: '5', label: 'Financiers', color: 'bg-yellow-100 text-yellow-700' },
  { code: '6', label: 'Charges', color: 'bg-red-100 text-red-700' },
  { code: '7', label: 'Produits', color: 'bg-emerald-100 text-emerald-700' }
];

export default function Accounts() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [deleteAccount, setDeleteAccount] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    class: 'all'
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

  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*').eq('company_id', user.active_company_id).order('code');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...formData };
      if (!selectedAccount) {
        data.company_id = user?.active_company_id;
      }
      
      if (selectedAccount) {
        const { error } = await supabase.from('accounts').update(data).eq('id', selectedAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounts').insert(data);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setFormOpen(false);
      setSelectedAccount(null);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteAccount) {
      const { error } = await supabase.from('accounts').delete().eq('id', deleteAccount.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDeleteAccount(null);
    }
  };

  const handleEdit = (account) => {
    setSelectedAccount(account);
    setFormData(account);
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

  const filteredAccounts = accounts.filter(acc => {
    const matchSearch = !filters.search || 
      acc.code?.includes(filters.search) ||
      acc.label?.toLowerCase().includes(filters.search.toLowerCase());
    const matchClass = filters.class === 'all' || acc.class === filters.class;
    return matchSearch && matchClass;
  });

  // Group by class
  const groupedAccounts = CLASSES.map(cls => ({
    ...cls,
    accounts: filteredAccounts.filter(acc => acc.class === cls.code)
  })).filter(group => group.accounts.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan comptable"
        subtitle="Gérez vos comptes comptables"
        actions={
          <Button 
            onClick={handleNew}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f] gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouveau compte
          </Button>
        }
      />

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par code ou libellé..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-10"
          />
        </div>
        <Select value={filters.class} onValueChange={(v) => setFilters(f => ({ ...f, class: v }))}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Classe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les classes</SelectItem>
            {CLASSES.map(cls => (
              <SelectItem key={cls.code} value={cls.code}>
                Classe {cls.code} - {cls.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Liste groupée */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 animate-pulse">
              <div className="h-6 bg-slate-200 rounded w-48 mb-4" />
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-12 bg-slate-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groupedAccounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400">Aucun compte trouvé</p>
          <Button 
            variant="outline" 
            className="mt-4 gap-2"
            onClick={handleNew}
          >
            <Plus className="h-4 w-4" />
            Créer un compte
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedAccounts.map(group => (
            <div key={group.code} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                <Badge className={cn("font-semibold", group.color)}>
                  Classe {group.code}
                </Badge>
                <span className="font-medium text-slate-700">{group.label}</span>
                <span className="text-sm text-slate-400">({group.accounts.length})</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.accounts.map(account => (
                  <div 
                    key={account.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <span className="font-mono text-sm font-medium text-slate-600">
                          {account.code?.slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-slate-800">{account.code}</span>
                          {account.is_auxiliary && (
                            <Badge variant="outline" className="text-xs">Auxiliaire</Badge>
                          )}
                          {!account.is_active && (
                            <Badge variant="outline" className="text-xs bg-slate-100">Inactif</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{account.label}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
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
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Sheet */}
      <Sheet open={formOpen} onOpenChange={() => setFormOpen(false)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>
              {selectedAccount ? 'Modifier le compte' : 'Nouveau compte'}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData(f => ({ ...f, code: e.target.value }))}
                  placeholder="ex: 411000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Classe</Label>
                <Select value={formData.class} onValueChange={(v) => setFormData(f => ({ ...f, class: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSES.map(cls => (
                      <SelectItem key={cls.code} value={cls.code}>
                        {cls.code} - {cls.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Libellé *</Label>
              <Input
                value={formData.label}
                onChange={(e) => setFormData(f => ({ ...f, label: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData(f => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bilan">Bilan</SelectItem>
                    <SelectItem value="gestion">Gestion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="passif">Passif</SelectItem>
                    <SelectItem value="charge">Charge</SelectItem>
                    <SelectItem value="produit">Produit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Compte parent</Label>
              <Input
                value={formData.parent_code}
                onChange={(e) => setFormData(f => ({ ...f, parent_code: e.target.value }))}
                placeholder="Optionnel"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div>
                <Label className="text-base">Compte auxiliaire</Label>
                <p className="text-sm text-slate-500">Pour les comptes de tiers</p>
              </div>
              <Switch
                checked={formData.is_auxiliary}
                onCheckedChange={(v) => setFormData(f => ({ ...f, is_auxiliary: v }))}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div>
                <Label className="text-base">Compte actif</Label>
                <p className="text-sm text-slate-500">Désactivez pour masquer</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData(f => ({ ...f, is_active: v }))}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1">
                Annuler
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedAccount ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteAccount} onOpenChange={() => setDeleteAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le compte</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le compte {deleteAccount?.code} - {deleteAccount?.label} ? 
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}