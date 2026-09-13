import { describe, expect, it } from 'vitest';
import { createBackup, validateBackup } from '@/lib/backup';

describe('sauvegardes', () => {
  it('cree et valide une sauvegarde de la societe active', () => {
    const backup = createBackup('company-1', { accounts: [{ id: 'a1' }] }, '2026-09-13T00:00:00.000Z');

    expect(validateBackup(backup, 'company-1')).toEqual({ valid: true, error: null });
    expect(backup.version).toBe(1);
  });

  it('refuse une sauvegarde d une autre societe ou d un format inconnu', () => {
    const backup = createBackup('company-1', {});

    expect(validateBackup(backup, 'company-2').valid).toBe(false);
    expect(validateBackup({ ...backup, version: 99 }, 'company-1').valid).toBe(false);
  });
});
