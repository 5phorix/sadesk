import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  ROLE_DEFAULT_PERMISSIONS,
  can,
  effectivePermissions,
  isRestricted,
  rolePermissions,
  sanitizePermissions,
} from '@/lib/permissions';

const membership = (role, permissions = {}, status = 'active') => ({ role, permissions, status });

describe('rolePermissions', () => {
  it('accorde tout au proprietaire', () => {
    expect(rolePermissions('owner').entries).toContain('delete');
    expect(rolePermissions('owner').users).toContain('delete');
  });

  it('limite le comptable a la saisie', () => {
    const permissions = rolePermissions('accountant');
    expect(permissions.entries).toContain('validate');
    expect(permissions.entries).not.toContain('delete');
    expect(permissions.users).toEqual(['read']);
  });

  it('limite le lecteur a la consultation', () => {
    const permissions = rolePermissions('viewer');
    expect(permissions.invoices).toEqual(['read']);
    expect(permissions.settings).toEqual([]);
  });

  it('retombe sur le lecteur pour un role inconnu', () => {
    expect(rolePermissions('inexistant')).toEqual(ROLE_DEFAULT_PERMISSIONS.viewer);
  });
});

describe('effectivePermissions', () => {
  it('conserve les droits du role sans surcharge', () => {
    expect(effectivePermissions('accountant')).toEqual(rolePermissions('accountant'));
  });

  it('restreint via une surcharge', () => {
    const result = effectivePermissions('accountant', { invoices: ['read'] });
    expect(result.invoices).toEqual(['read']);
    expect(result.entries).toEqual(rolePermissions('accountant').entries);
  });

  it('ne permet jamais d etendre au dela du role', () => {
    const result = effectivePermissions('viewer', { entries: ['read', 'create', 'delete'] });
    expect(result.entries).toEqual(['read']);
  });

  it('supporte une surcharge vide', () => {
    expect(effectivePermissions('admin', { audit: [] }).audit).toEqual([]);
  });

  it('couvre toutes les fonctionnalites declarees', () => {
    const result = effectivePermissions('owner');
    FEATURES.forEach(({ key }) => expect(result).toHaveProperty(key));
  });
});

describe('can', () => {
  it('autorise une action couverte par le role', () => {
    expect(can(membership('accountant'), 'entries', 'validate')).toBe(true);
  });

  it('refuse une action hors du role', () => {
    expect(can(membership('accountant'), 'entries', 'delete')).toBe(false);
    expect(can(membership('viewer'), 'invoices', 'create')).toBe(false);
  });

  it('applique la surcharge restrictive', () => {
    expect(can(membership('admin', { invoices: ['read'] }), 'invoices', 'delete')).toBe(false);
    expect(can(membership('admin', { invoices: ['read'] }), 'invoices', 'read')).toBe(true);
  });

  it('refuse tout a un membre inactif', () => {
    expect(can(membership('owner', {}, 'inactive'), 'invoices', 'read')).toBe(false);
  });

  it('refuse tout sans adhesion', () => {
    expect(can(null, 'invoices', 'read')).toBe(false);
  });

  it('refuse une fonctionnalite inconnue', () => {
    expect(can(membership('owner'), 'inexistant', 'read')).toBe(false);
  });
});

describe('sanitizePermissions', () => {
  it('elague les actions hors du plafond du role', () => {
    const result = sanitizePermissions('viewer', { entries: ['read', 'delete'] });
    expect(result.entries).toEqual(['read']);
  });

  it('conserve les defauts pour une fonctionnalite non fournie', () => {
    const result = sanitizePermissions('accountant', {});
    expect(result.invoices).toEqual(rolePermissions('accountant').invoices);
  });

  it('produit toutes les cles attendues', () => {
    const result = sanitizePermissions('admin', {});
    expect(Object.keys(result).sort()).toEqual(FEATURES.map((f) => f.key).sort());
  });
});

describe('isRestricted', () => {
  it('detecte une restriction', () => {
    expect(isRestricted('admin', { invoices: ['read'] })).toBe(true);
  });

  it('ne signale rien sans surcharge', () => {
    expect(isRestricted('admin', {})).toBe(false);
  });

  it('ne signale rien pour une surcharge equivalente au role', () => {
    expect(isRestricted('viewer', { invoices: ['read'] })).toBe(false);
  });
});
