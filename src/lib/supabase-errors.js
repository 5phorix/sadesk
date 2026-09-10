import { toast } from 'sonner';

const POSTGRES_MESSAGES = {
  '23502': "Une information obligatoire est manquante.",
  '23503': "Cet élément est lié à d'autres données : supprimez d'abord les éléments rattachés.",
  '23505': "Cet enregistrement existe déjà (doublon détecté).",
  '23514': "Les valeurs saisies ne respectent pas les règles comptables.",
  '22003': "Un montant dépasse la valeur maximale autorisée.",
  '22P02': "Le format d'une des valeurs saisies est invalide.",
  '42501': "Vous n'avez pas les droits nécessaires pour cette action.",
  '42P01': "Ressource introuvable côté serveur. Contactez votre administrateur.",
  '57014': "L'opération a pris trop de temps et a été interrompue. Réessayez.",
  'PGRST116': "Aucun enregistrement correspondant n'a été trouvé.",
  'PGRST301': "Votre session a expiré, veuillez vous reconnecter."
};

const AUTH_MESSAGES = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: "Votre adresse email n'a pas encore été confirmée.",
  user_already_exists: 'Un compte existe déjà avec cette adresse email.',
  over_email_send_rate_limit: "Trop de tentatives. Réessayez dans quelques minutes.",
  weak_password: 'Le mot de passe est trop faible (8 caractères minimum).',
  session_not_found: 'Votre session a expiré, veuillez vous reconnecter.'
};

const STORAGE_MESSAGES = {
  'Payload too large': 'Le fichier est trop volumineux.',
  'The resource already exists': 'Un fichier portant ce nom existe déjà.',
  'Object not found': 'Le fichier demandé est introuvable.'
};

/**
 * Traduit une erreur Supabase (Postgres, Auth, Storage ou réseau) en message utilisateur.
 */
export function getSupabaseErrorMessage(error, fallback = "Une erreur est survenue. Veuillez réessayer.") {
  if (!error) return fallback;

  if (typeof error === 'string') return error;

  if (error.code && POSTGRES_MESSAGES[error.code]) {
    // La violation de contrainte comptable porte un message métier explicite côté SQL.
    if (error.code === '23514' && error.message?.includes('balanced')) {
      return "L'écriture n'est pas équilibrée : le total des débits doit égaler le total des crédits.";
    }
    return POSTGRES_MESSAGES[error.code];
  }

  if (error.code && AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code];

  const rawMessage = error.message || error.error_description || '';

  for (const [needle, message] of Object.entries(STORAGE_MESSAGES)) {
    if (rawMessage.includes(needle)) return message;
  }

  if (error.status === 401 || rawMessage.includes('JWT')) {
    return 'Votre session a expiré, veuillez vous reconnecter.';
  }
  if (error.status === 403 || rawMessage.includes('row-level security')) {
    return "Vous n'avez pas les droits nécessaires pour cette action.";
  }
  if (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
    return 'Connexion au serveur impossible. Vérifiez votre connexion internet.';
  }

  return rawMessage || fallback;
}

/**
 * Affiche un toast d'erreur lisible et journalise le détail technique.
 */
export function toastSupabaseError(error, fallback) {
  console.error(fallback || 'Supabase error:', error);
  toast.error(getSupabaseErrorMessage(error, fallback));
}
