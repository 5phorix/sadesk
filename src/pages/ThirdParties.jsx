import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { 
  Plus, 
  Search, 
  Building2, 
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import ThirdPartyForm from '@/components/thirdparties/ThirdPartyForm';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { useUser } from '@/components/hooks/useUser';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { usePagination } from '@/components/common/usePagination';
import PaginationBar from '@/components/common/PaginationBar';

export default function ThirdParties() {
  const { user } = useUser();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [deleteParty, setDeleteParty] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    status: 'all'
  });

  const queryClient = useQueryClient();
  const { data: thirdParties = [], isLoading } = useQuery({
    queryKey: ['third-parties', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('third_parties')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ['third-parties'] });
    setFormOpen(false);
    setSelectedParty(null);
  };

  const handleDelete = async () => {
    if (deleteParty) {
      const { error } = await supabase.from('third_parties').delete().eq('id', deleteParty.id);
      if (error) {
        toast.error('Impossible de supprimer ce tiers');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['third-parties'] });
      setDeleteParty(null);
    }
  };

  const handleEdit = (party) => {
    setSelectedParty(party);
    setFormOpen(true);
  };

  const filteredParties = thirdParties.filter(party => {
    const matchSearch = !filters.search || 
      party.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
      party.code?.toLowerCase().includes(filters.search.toLowerCase()) ||
      party.email?.toLowerCase().includes(filters.search.toLowerCase()) ||
      party.phone?.toLowerCase().includes(filters.search.toLowerCase()) ||
      party.city?.toLowerCase().includes(filters.search.toLowerCase()) ||
      party.siret?.toLowerCase().includes(filters.search.toLowerCase());
    const matchType = filters.type === 'all' || party.type === filters.type;
    const matchStatus = filters.status === 'all' || 
      (filters.status === 'active' && party.is_active !== false) ||
      (filters.status === 'inactive' && party.is_active === false);
    return matchSearch && matchType && matchStatus;
  });

  const handleNewParty = async () => {
    setSelectedParty(null);
    setFormOpen(true);
  };

  const { paginatedItems: pagedParties, currentPage, totalPages, totalItems, goToPrevious, goToNext } = usePagination(filteredParties, 9);

  return (
    <ProtectedRoute>
      <div className="space-y-6">
      <PageHeader
        title="Tiers"
        subtitle="Gérez vos clients et fournisseurs"
        actions={
          <Button 
            onClick={handleNewParty}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f] gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouveau tiers
          </Button>
        }
      />

      {/* Filtres avancés */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par nom, code, email, téléphone, ville, SIRET..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-10"
          />
        </div>
        <Select value={filters.type} onValueChange={(v) => setFilters(f => ({ ...f, type: v }))}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="client">Clients</SelectItem>
            <SelectItem value="fournisseur">Fournisseurs</SelectItem>
            <SelectItem value="les deux">Client & Fournisseur</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 animate-pulse">
              <div className="h-12 w-12 bg-slate-200 rounded-xl mb-4" />
              <div className="h-5 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredParties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-400">Aucun tiers trouvé</p>
          <Button 
            variant="outline" 
            className="mt-4 gap-2"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Créer un tiers
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pagedParties.map((party) => (
            <a
              key={party.id}
              href={createPageUrl('ThirdPartyDetail') + '?id=' + party.id}
              className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 block"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                    party.type === 'client' 
                      ? 'bg-violet-100 text-violet-600' 
                      : 'bg-amber-100 text-amber-600'
                  }`}>
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">{party.code}</p>
                    <StatusBadge status={party.type} />
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(party)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => setDeleteParty(party)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <h3 className="font-semibold text-slate-800 text-lg mb-3">{party.name}</h3>
              
              <div className="space-y-2 text-sm">
                {party.email && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{party.email}</span>
                  </div>
                )}
                {party.phone && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{party.phone}</span>
                  </div>
                )}
                {(party.city || party.country) && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{[party.city, party.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>

              {!party.is_active && (
                <Badge variant="outline" className="mt-4 bg-slate-100 text-slate-500">
                  Inactif
                </Badge>
              )}
            </a>
          ))}
        </div>
      )}

      <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={9} onPrevious={goToPrevious} onNext={goToNext} />

      {/* Form Sheet */}
      <ThirdPartyForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedParty(null); }}
        thirdParty={selectedParty}
        onSave={handleSave}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteParty} onOpenChange={() => setDeleteParty(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le tiers</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer {deleteParty?.name} ? 
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
    </ProtectedRoute>
  );
}