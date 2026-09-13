export const BACKUP_VERSION = 1;

export const BACKUP_TABLES = [
  'fiscal_years',
  'accounts',
  'third_parties',
  'invoices',
  'accounting_entries',
  'bank_statements',
  'bank_transactions',
  'stock_items',
  'stock_movements',
  'stock_impairments',
  'fixed_assets',
  'fixed_asset_depreciations',
  'fixed_asset_impairments',
  'receivable_followups',
  'budgets',
  'cost_centers',
  'documents',
];

export function createBackup(companyId, tables, createdAt = new Date().toISOString()) {
  return {
    format: 'sadesk-compta-backup',
    version: BACKUP_VERSION,
    company_id: companyId,
    created_at: createdAt,
    tables,
  };
}

export function validateBackup(backup, companyId) {
  if (!backup || backup.format !== 'sadesk-compta-backup' || backup.version !== BACKUP_VERSION) {
    return { valid: false, error: 'Format de sauvegarde Sadesk Compta inconnu.' };
  }
  if (backup.company_id !== companyId) {
    return { valid: false, error: 'Cette sauvegarde appartient à une autre société.' };
  }
  if (!backup.tables || typeof backup.tables !== 'object') {
    return { valid: false, error: 'La sauvegarde ne contient aucune table.' };
  }
  return { valid: true, error: null };
}
