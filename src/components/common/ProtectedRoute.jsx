import React from 'react';
import { useUser } from '@/components/hooks/useUser';
import { usePermissions } from '@/components/hooks/usePermissions';
import { Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

/**
 * Composant de protection des routes nécessitant une société active.
 * `permission` accepte "fonctionnalité:action", ex. "users:read".
 */
export function ProtectedRoute({ children, requireCompany = true, permission = null }) {
  const { user, loading, error } = useUser();
  const { can, membership, loading: loadingPermissions } = usePermissions();

  // État de chargement
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  // Erreur de chargement utilisateur
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-700 mb-4 font-medium">Erreur de chargement</p>
          <Button 
            onClick={() => window.location.reload()}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white"
          >
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // Un nouvel utilisateur peut être authentifié sans société : il doit d'abord
  // créer sa société ou accepter une invitation.
  if (requireCompany && user && (!user.company_ids || !Array.isArray(user.company_ids) || user.company_ids.length === 0)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-slate-700 mb-2 font-medium">Aucune société associée à ce compte</p>
          <p className="text-sm text-slate-500 mb-4">Créez votre société ou rejoignez-la avec une invitation.</p>
          <Button 
            onClick={() => { window.location.href = createPageUrl('CompanySelector'); }}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f] text-white"
          >
            Créer ou rejoindre une société
          </Button>
        </div>
      </div>
    );
  }

  // Pas de société sélectionnée
  if (requireCompany && user && !user.active_company_id) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-slate-700 mb-4 font-medium">Veuillez sélectionner une société</p>
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

  // Tout est OK, afficher le contenu
  if (permission) {
    const [feature, action] = permission.split(':');

    if (loadingPermissions || (user?.active_company_id && !membership)) {
      return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
        </div>
      );
    }

    if (!can(feature, action)) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <p className="text-slate-700 mb-2 font-medium">Accès non autorisé</p>
            <p className="text-sm text-slate-500">
              Votre rôle ne vous permet pas d&apos;accéder à cette page. Contactez un
              administrateur de la société.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}