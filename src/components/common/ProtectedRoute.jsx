import React from 'react';
import { useUser } from '@/components/hooks/useUser';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

/**
 * Composant de protection des routes nécessitant une société active
 * Gère les états de chargement et redirige si nécessaire
 */
export function ProtectedRoute({ children, requireCompany = true }) {
  const { user, loading, error } = useUser();

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

  // Vérifier que company_ids est initialisé
  if (requireCompany && user && (!user.company_ids || !Array.isArray(user.company_ids) || user.company_ids.length === 0)) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-slate-700 mb-4 font-medium">Initialisation en cours...</p>
          <p className="text-sm text-slate-500 mb-4">Veuillez patienter quelques secondes</p>
          <Button 
            onClick={() => window.location.reload()}
            variant="outline"
          >
            Actualiser
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
  return <>{children}</>;
}