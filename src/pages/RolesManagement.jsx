import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUser } from '@/components/hooks/useUser';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Plus, Shield, Edit, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';

const PERMISSION_MODULES = [
  { key: 'invoices', label: 'Facturation', permissions: ['create', 'read', 'update', 'delete'] },
  { key: 'entries', label: 'Écritures comptables', permissions: ['create', 'read', 'update', 'delete', 'validate'] },
  { key: 'third_parties', label: 'Tiers', permissions: ['create', 'read', 'update', 'delete'] },
  { key: 'bank_reconciliation', label: 'Rapprochement bancaire', permissions: ['access', 'reconcile'] },
  { key: 'reports', label: 'Rapports', permissions: ['view', 'export'] },
  { key: 'budget', label: 'Budget', permissions: ['view', 'manage'] }
];

const PERMISSION_LABELS = {
  create: 'Créer',
  read: 'Consulter',
  update: 'Modifier',
  delete: 'Supprimer',
  validate: 'Valider',
  access: 'Accéder',
  reconcile: 'Rapprocher',
  view: 'Voir',
  export: 'Exporter',
  manage: 'Gérer'
};

export default function RolesManagement() {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [deleteRole, setDeleteRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: {},
    settings: false,
    users: false
  });
  const queryClient = useQueryClient();

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', user?.active_company_id],
    queryFn: async () => { const { data, error } = await supabase.from('roles').select('*').eq('company_id', user.active_company_id).order('name'); if (error) throw error; return data; },
    enabled: !!user?.active_company_id,
  });

  const handleOpenForm = (role = null) => {
    if (role) {
      setFormData({
        name: role.name,
        description: role.description || '',
        permissions: role.permissions || {},
        settings: role.permissions?.settings || false,
        users: role.permissions?.users || false
      });
      setSelectedRole(role);
    } else {
      setFormData({
        name: '',
        description: '',
        permissions: {},
        settings: false,
        users: false
      });
      setSelectedRole(null);
    }
    setShowForm(true);
  };

  const handlePermissionChange = (module, permission, value) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [module]: {
          ...(prev.permissions[module] || {}),
          [permission]: value
        }
      }
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const dataToSave = {
        ...formData,
        company_id: user.active_company_id,
        permissions: {
          ...formData.permissions,
          settings: formData.settings,
          users: formData.users
        }
      };

      if (selectedRole) {
        const { error } = await supabase.from('roles').update(dataToSave).eq('id', selectedRole.id); if (error) throw error;
        toast.success('Rôle modifié');
      } else {
        const { error } = await supabase.from('roles').insert(dataToSave); if (error) throw error;
        toast.success('Rôle créé');
      }

      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setShowForm(false);
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async () => {
    if (deleteRole) {
      const { error } = await supabase.from('roles').delete().eq('id', deleteRole.id); if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Rôle supprimé');
      setDeleteRole(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader
          title="Gestion des rôles"
          subtitle="Créez et gérez les rôles personnalisés avec des permissions spécifiques"
          actions={
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="h-4 w-4" />
              Nouveau rôle
            </Button>
          }
        />

        <div className="grid gap-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Shield className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {role.name}
                        {role.is_system && (
                          <Badge variant="outline" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Système
                          </Badge>
                        )}
                      </CardTitle>
                      {role.description && (
                        <p className="text-sm text-slate-500 mt-1">{role.description}</p>
                      )}
                    </div>
                  </div>
                  {!role.is_system && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenForm(role)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteRole(role)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {PERMISSION_MODULES.map(module => {
                    const modulePerms = role.permissions?.[module.key] || {};
                    const activePerms = Object.entries(modulePerms).filter(([, v]) => v).length;
                    return (
                      <div key={module.key} className="text-sm">
                        <div className="font-medium text-slate-700">{module.label}</div>
                        <div className="text-slate-500">
                          {activePerms}/{module.permissions.length} permissions
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Formulaire */}
        <Sheet open={showForm} onOpenChange={setShowForm}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{selectedRole ? 'Modifier le rôle' : 'Nouveau rôle'}</SheetTitle>
            </SheetHeader>

            <form onSubmit={handleSave} className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label>Nom du rôle *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Permissions par module</h3>
                
                {PERMISSION_MODULES.map(module => (
                  <Card key={module.key}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{module.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                      {module.permissions.map(perm => (
                        <div key={perm} className="flex items-center justify-between">
                          <Label className="text-sm">{PERMISSION_LABELS[perm]}</Label>
                          <Switch
                            checked={formData.permissions[module.key]?.[perm] || false}
                            onCheckedChange={(v) => handlePermissionChange(module.key, perm, v)}
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Permissions générales</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Accès aux paramètres</Label>
                      <Switch
                        checked={formData.settings}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, settings: v }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Gestion des utilisateurs</Label>
                      <Switch
                        checked={formData.users}
                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, users: v }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                  Annuler
                </Button>
                <Button type="submit" className="flex-1 bg-[#1e3a5f] hover:bg-[#2d4a6f]">
                  {selectedRole ? 'Modifier' : 'Créer'}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>

        {/* Dialog suppression */}
        <AlertDialog open={!!deleteRole} onOpenChange={() => setDeleteRole(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le rôle</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le rôle "{deleteRole?.name}" ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}