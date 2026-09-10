import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { usePermissions } from '@/components/hooks/usePermissions';
import {
  ACTION_LABELS,
  FEATURES,
  ROLES,
  effectivePermissions,
  isRestricted,
  rolePermissions,
  sanitizePermissions,
} from '@/lib/permissions';
import { Users, Plus, Mail, Shield, Check, X, Trash2, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { toastSupabaseError } from '@/lib/supabase-errors';

const STATUS_STYLES = {
  active: { label: 'Actif', className: 'bg-emerald-100 text-emerald-800' },
  pending: { label: 'Invitation envoyée', className: 'bg-amber-100 text-amber-800' },
  inactive: { label: 'Désactivé', className: 'bg-slate-200 text-slate-700' },
};

function PermissionEditor({ role, value, onChange }) {
  const ceiling = rolePermissions(role);
  const effective = effectivePermissions(role, value);

  const toggle = (feature, action) => {
    const current = effective[feature] || [];
    const next = current.includes(action)
      ? current.filter((item) => item !== action)
      : [...current, action];
    onChange({ ...effective, [feature]: next });
  };

  return (
    <div className="space-y-3">
      {FEATURES.map((feature) => {
        const allowed = ceiling[feature.key] || [];
        if (allowed.length === 0) return null;

        return (
          <div key={feature.key} className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium text-slate-900">{feature.label}</p>
            <div className="flex flex-wrap gap-4">
              {feature.actions.map((action) => {
                const permitted = allowed.includes(action);
                return (
                  <label
                    key={action}
                    className={`flex items-center gap-2 text-sm ${permitted ? 'text-slate-700' : 'text-slate-300'}`}
                  >
                    <Checkbox
                      disabled={!permitted}
                      checked={(effective[feature.key] || []).includes(action)}
                      onCheckedChange={() => toggle(feature.key, action)}
                    />
                    {ACTION_LABELS[action] || action}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-500">
        Les actions grisées ne sont pas accessibles au rôle sélectionné : une permission ne peut que
        restreindre le rôle, jamais l&apos;étendre.
      </p>
    </div>
  );
}

export default function CompanyUsers() {
  const queryClient = useQueryClient();
  const { user, loading: loadingUser } = useUser();
  const { can, isOwner } = usePermissions();

  const [showInvite, setShowInvite] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [permissionTarget, setPermissionTarget] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState({});
  const [inviteData, setInviteData] = useState({ email: '', name: '', role: 'viewer' });

  const companyId = user?.active_company_id;

  const { data: activeCompany } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, owner_email')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['company-users', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_users')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['company-users', companyId] });

  const inviteMutation = useMutation({
    mutationFn: async (data) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée, veuillez vous reconnecter.');

      const response = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_id: companyId, ...data }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "L'invitation a échoué.");
      return payload;
    },
    onSuccess: (payload) => {
      refresh();
      setShowInvite(false);
      setInviteData({ email: '', name: '', role: 'viewer' });
      toast.success(payload.message);
    },
    onError: (error) => toastSupabaseError(error, "L'invitation n'a pas pu être envoyée."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...changes }) => {
      const { error } = await supabase
        .from('company_users')
        .update(changes)
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success('Membre mis à jour');
    },
    onError: (error) => toastSupabaseError(error, "Le membre n'a pas pu être mis à jour."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('company_users')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      setMemberToDelete(null);
      toast.success('Utilisateur retiré');
    },
    onError: (error) => toastSupabaseError(error, "L'utilisateur n'a pas pu être retiré."),
  });

  const openPermissions = (member) => {
    setPermissionTarget(member);
    setPermissionDraft(effectivePermissions(member.role, member.permissions));
  };

  const savePermissions = () => {
    updateMutation.mutate({
      id: permissionTarget.id,
      permissions: sanitizePermissions(permissionTarget.role, permissionDraft),
    });
    setPermissionTarget(null);
  };

  const owners = members.filter((member) => member.role === 'owner' && member.status === 'active');
  const canManage = can('users', 'update');

  if (loadingUser) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ProtectedRoute permission="users:read">
      <div className="space-y-6">
        <PageHeader
          title="Utilisateurs"
          subtitle={`Gérez les accès à ${activeCompany?.name || 'la société'}`}
          actions={
            can('users', 'create') && (
              <Button className="bg-[#1e3a5f] hover:bg-[#2d4a6f]" onClick={() => setShowInvite(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Inviter
              </Button>
            )
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membres ({members.length})
            </CardTitle>
            <CardDescription>
              Les droits sont appliqués par la base de données : masquer un bouton ne suffit pas à
              autoriser une action.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}

            {members.map((member) => {
              const status = STATUS_STYLES[member.status] || STATUS_STYLES.inactive;
              const restricted = isRestricted(member.role, member.permissions);
              const isLastOwner = member.role === 'owner' && owners.length <= 1;
              const isSelf = member.user_id === user?.id;

              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {member.user_name || member.user_email}
                      </span>
                      <Badge className={status.className}>{status.label}</Badge>
                      {restricted && (
                        <Badge variant="outline" className="text-amber-700">
                          Droits restreints
                        </Badge>
                      )}
                      {isSelf && <Badge variant="outline">Vous</Badge>}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                      <Mail className="h-3 w-3" />
                      {member.user_email}
                      {member.invited_by && ` · invité par ${member.invited_by}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={member.role}
                      disabled={!canManage || isLastOwner || (member.role === 'owner' && !isOwner)}
                      onValueChange={(role) =>
                        updateMutation.mutate({
                          id: member.id,
                          role,
                          permissions: sanitizePermissions(role, {}),
                        })
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem
                            key={role.value}
                            value={role.value}
                            disabled={role.value === 'owner' && !isOwner}
                          >
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canManage}
                      onClick={() => openPermissions(member)}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Droits
                    </Button>

                    {member.status === 'active' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canManage || isLastOwner || isSelf}
                        onClick={() => updateMutation.mutate({ id: member.id, status: 'inactive' })}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Désactiver
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canManage}
                        onClick={() => updateMutation.mutate({ id: member.id, status: 'active' })}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Activer
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:bg-red-50 hover:text-red-700"
                      disabled={!can('users', 'delete') || isLastOwner || isSelf}
                      onClick={() => setMemberToDelete(member)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {!isLoading && members.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">Aucun membre.</p>
            )}
          </CardContent>
        </Card>

        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un utilisateur</DialogTitle>
              <DialogDescription>
                Un email d&apos;invitation est envoyé. Si un compte existe déjà, l&apos;accès est
                accordé immédiatement.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                inviteMutation.mutate(inviteData);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Adresse email *</Label>
                <Input
                  type="email"
                  required
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  placeholder="collaborateur@exemple.fr"
                />
              </div>

              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Rôle *</Label>
                <Select
                  value={inviteData.role}
                  onValueChange={(role) => setInviteData({ ...inviteData, role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem
                        key={role.value}
                        value={role.value}
                        disabled={role.value === 'owner' && !isOwner}
                      >
                        <div>
                          <p>{role.label}</p>
                          <p className="text-xs text-slate-500">{role.description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Envoyer l&apos;invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!permissionTarget} onOpenChange={() => setPermissionTarget(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Droits de {permissionTarget?.user_name || permissionTarget?.user_email}
              </DialogTitle>
              <DialogDescription>
                Rôle : {ROLES.find((role) => role.value === permissionTarget?.role)?.label}
              </DialogDescription>
            </DialogHeader>

            {permissionTarget && (
              <PermissionEditor
                role={permissionTarget.role}
                value={permissionDraft}
                onChange={setPermissionDraft}
              />
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setPermissionTarget(null)}>
                Annuler
              </Button>
              <Button className="bg-[#1e3a5f] hover:bg-[#2d4a6f]" onClick={savePermissions}>
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retirer cet utilisateur ?</AlertDialogTitle>
              <AlertDialogDescription>
                {memberToDelete?.user_email} perdra tout accès à cette société. Les écritures qu&apos;il
                a saisies sont conservées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteMutation.mutate(memberToDelete.id)}
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
