/**
 * Permissions par fonctionnalité.
 * Miroir de `role_default_permissions` / `has_feature_permission` côté SQL :
 * l'interface masque, la base fait foi.
 */

export const ROLES = [
  { value: 'owner', label: 'Propriétaire', description: 'Tous les droits, y compris la suppression de la société' },
  { value: 'admin', label: 'Administrateur', description: 'Gestion complète des données et des utilisateurs' },
  { value: 'accountant', label: 'Comptable', description: 'Saisie et validation comptable' },
  { value: 'viewer', label: 'Lecteur', description: 'Consultation uniquement' }
];

export const FEATURES = [
  { key: 'invoices', label: 'Factures', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'entries', label: 'Écritures', actions: ['read', 'create', 'update', 'delete', 'validate'] },
  { key: 'thirdparties', label: 'Tiers', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'accounts', label: 'Plan comptable', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'bank', label: 'Banque', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'budgets', label: 'Budgets', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'closing', label: 'Clôtures', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'reports', label: 'Rapports', actions: ['read', 'export'] },
  { key: 'documents', label: 'Documents', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'settings', label: 'Paramètres', actions: ['read', 'update'] },
  { key: 'users', label: 'Utilisateurs', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'audit', label: "Journal d'audit", actions: ['read'] }
];

export const ACTION_LABELS = {
  read: 'Consulter',
  create: 'Créer',
  update: 'Modifier',
  delete: 'Supprimer',
  validate: 'Valider',
  export: 'Exporter'
};

const ALL = ['read', 'create', 'update', 'delete'];

export const ROLE_DEFAULT_PERMISSIONS = {
  owner: {
    invoices: ALL,
    entries: [...ALL, 'validate'],
    thirdparties: ALL,
    accounts: ALL,
    bank: ALL,
    budgets: ALL,
    closing: ALL,
    reports: ['read', 'export'],
    documents: ALL,
    settings: ['read', 'update'],
    users: ALL,
    audit: ['read']
  },
  admin: {
    invoices: ALL,
    entries: [...ALL, 'validate'],
    thirdparties: ALL,
    accounts: ALL,
    bank: ALL,
    budgets: ALL,
    closing: ALL,
    reports: ['read', 'export'],
    documents: ALL,
    settings: ['read', 'update'],
    users: ALL,
    audit: ['read']
  },
  accountant: {
    invoices: ['read', 'create', 'update'],
    entries: ['read', 'create', 'update', 'validate'],
    thirdparties: ['read', 'create', 'update'],
    accounts: ['read', 'create', 'update'],
    bank: ['read', 'create', 'update'],
    budgets: ['read', 'create', 'update'],
    closing: ['read', 'create'],
    reports: ['read', 'export'],
    documents: ['read', 'create', 'update'],
    settings: ['read'],
    users: ['read'],
    audit: []
  },
  viewer: {
    invoices: ['read'],
    entries: ['read'],
    thirdparties: ['read'],
    accounts: ['read'],
    bank: ['read'],
    budgets: ['read'],
    closing: ['read'],
    reports: ['read'],
    documents: ['read'],
    settings: [],
    users: [],
    audit: []
  }
};

/** Droits maximum accordés par un rôle. */
export function rolePermissions(role) {
  return ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.viewer;
}

/**
 * Droits effectifs : les surcharges ne peuvent que restreindre le rôle,
 * jamais l'étendre. Une fonctionnalité absente des surcharges garde le défaut.
 */
export function effectivePermissions(role, overrides = {}) {
  const defaults = rolePermissions(role);
  const result = {};

  FEATURES.forEach(({ key }) => {
    const allowed = defaults[key] || [];
    const override = overrides?.[key];

    if (!Array.isArray(override)) {
      result[key] = [...allowed];
      return;
    }

    result[key] = allowed.filter((action) => override.includes(action));
  });

  return result;
}

/** L'utilisateur peut-il réaliser cette action ? */
export function can(membership, feature, action) {
  if (!membership || membership.status !== 'active') return false;
  const permissions = effectivePermissions(membership.role, membership.permissions);
  return (permissions[feature] || []).includes(action);
}

/** Normalise une saisie d'interface avant enregistrement. */
export function sanitizePermissions(role, draft = {}) {
  const defaults = rolePermissions(role);
  const result = {};

  FEATURES.forEach(({ key }) => {
    const allowed = defaults[key] || [];
    const selected = Array.isArray(draft[key]) ? draft[key] : allowed;
    result[key] = allowed.filter((action) => selected.includes(action));
  });

  return result;
}

/** Une surcharge est-elle plus restrictive que le rôle ? */
export function isRestricted(role, overrides = {}) {
  const defaults = rolePermissions(role);
  const effective = effectivePermissions(role, overrides);
  return FEATURES.some(({ key }) => (defaults[key] || []).length !== effective[key].length);
}
