import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import {
  Users,
  Plus,
  Mail,
  Shield,
  Check,
  X,
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
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { toast } from 'sonner';

const ROLES = [
  { value: 'owner', label: 'Propriétaire', description: 'Tous les droits' },
  { value: 'admin', label: 'Administrateur', description: 'Gestion complète' },
  { value: 'accountant', label: 'Comptable', description: 'Saisie et consultation' },
  { value: 'viewer', label: 'Lecteur', description: 'Consultation uniquement' }
];

export default function CompanyUsers() {
  const queryClient = useQueryClient();
  const { user, loading: loadingUser } = useUser();
  const [showInvite, setShowInvite] = useState(false);
  const [deleteUser, setDeleteUser] = useState(null);
  const [inviteData, setInviteData] = useState({
    email: '',
    name: '',
    role: 'viewer'
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id
  });

  const activeCompany = companies.find(c => c.id === user?.active_company_id);

  const { data: companyUsers = [], isLoading } = useQuery({
    queryKey: ['company-users', user?.active_company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_users')
        .select('*')
        .eq('company_id', user.active_company_id)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.active_company_id,
    staleTime: 30000
  });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      const { data: membership, error } = await supabase.from('company_users').insert({
        company_id: user.active_company_id,
        user_id: null,
        company_name: activeCompany?.name,
        user_email: data.email,
        user_name: data.name,
        role: data.role,
        status: 'pending',
        invited_by: user.email,
        permissions: getRolePermissions(data.role)
      }).select().single();
      if (error) throw error;
      return membership;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      setShowInvite(false);
      setInviteData({ email: '', name: '', role: 'viewer' });
      toast.success('Invitation envoyée');
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'invitation');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase.from('company_users').delete().eq('id', userId).eq('company_id', user.active_company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      setDeleteUser(null);
      toast.success('Utilisateur retiré');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('company_users').update({ status }).eq('id', id).eq('company_id', user.active_company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
      toast.success('Statut mis à jour');
    }
  });

  const getRolePermissions = (role) => {
    switch (role) {
      case 'owner':
      case 'admin':
        return {
          invoices: { create: true, read: true, update: true, delete: true },
          entries: { create: true, read: true, update: true, delete: true },
          settings: true
        };
      case 'accountant':
        return {
          invoices: { create: true, read: true, update: true, delete: false },
          entries: { create: true, read: true, update: true, delete: false },
          settings: false
        };
      case 'viewer':
        return {
          invoices: { create: false, read: true, update: false, delete: false },
          entries: { create: false, read: true, update: false, delete: false },
          settings: false
        };
      default:
        return {
          invoices: { create: false, read: true, update: false, delete: false },
          entries: { create: false, read: true, update: false, delete: false },
          settings: false
        };
    }
  };

  const handleInvite = (e) => {
    e.preventDefault();
    inviteMutation.mutate(inviteData);
  };

  const isOwner = activeCompany?.owner_email === user?.email;

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        subtitle={`Gérez les accès à ${activeCompany?.name}`}
        actions={
          isOwner && (
            <Button 
              onClick={() => setShowInvite(true)}
              className="gap-2 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
            >
              <Plus className="h-4 w-4" />
              Inviter un utilisateur
            </Button>
          )
        }
      />

      {/* Liste des utilisateurs */}
      <Card>
        <CardHeader>
          <CardTitle>Membres de l'équipe</CardTitle>
          <CardDescription>
            {companyUsers.length} utilisateur{companyUsers.length > 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : companyUsers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Aucun utilisateur</p>
            </div>
          ) : (
            <div className="space-y-3">
              {companyUsers.map((cu) => (
                <div 
                  key={cu.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] flex items-center justify-center text-white font-semibold">
                      {cu.user_name?.charAt(0)?.toUpperCase() || cu.user_email?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-800">{cu.user_name || cu.user_email}</h4>
                        {cu.status === 'pending' && (
                          <Badge variant="outline" className="text-xs">En attente</Badge>
                        )}
                        {cu.role === 'owner' && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs">Propriétaire</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{cu.user_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {ROLES.find(r => r.value === cu.role)?.label}
                      </span>
                    </div>
                    {cu.status === 'pending' && isOwner && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: cu.id, status: 'active' })}
                        >
                          <Check className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: cu.id, status: 'suspended' })}
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                    {cu.role !== 'owner' && isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={() => setDeleteUser(cu)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog invitation */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un utilisateur</DialogTitle>
            <DialogDescription>
              Ajoutez un nouveau membre à votre équipe
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={inviteData.email}
                onChange={(e) => setInviteData(d => ({ ...d, email: e.target.value }))}
                placeholder="utilisateur@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={inviteData.name}
                onChange={(e) => setInviteData(d => ({ ...d, name: e.target.value }))}
                placeholder="Jean Dupont"
              />
            </div>

            <div className="space-y-2">
              <Label>Rôle *</Label>
              <Select value={inviteData.role} onValueChange={(v) => setInviteData(d => ({ ...d, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter(r => r.value !== 'owner').map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div>
                        <div className="font-medium">{role.label}</div>
                        <div className="text-xs text-slate-500">{role.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)} className="flex-1">
                Annuler
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Envoyer l'invitation
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer l'utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer {deleteUser?.user_name || deleteUser?.user_email} ? 
              Il n'aura plus accès à cette société.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate(deleteUser.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}