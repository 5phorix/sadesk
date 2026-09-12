import { describe, expect, it } from 'vitest';
import { duplicateIndexes, duplicateKey } from '@/lib/import-validation';

describe('détection des doublons d import', () => {
  it('normalise la casse et les espaces dans les clés', () => {
    expect(duplicateKey(' F001 ', 'ACHATS')).toBe('f001|achats');
  });

  it('retourne toutes les lignes répétées dans un lot', () => {
    const indexes = duplicateIndexes([
      { code: '401000' },
      { code: ' 401000' },
      { code: '411000' },
      { code: '401000' },
    ], (item) => duplicateKey(item.code));

    expect([...indexes].sort()).toEqual([0, 1, 3]);
  });

  it('ignore les lignes sans clé exploitable', () => {
    expect(duplicateIndexes([{ code: '' }, { code: null }], (item) => duplicateKey(item.code))).toEqual(new Set());
  });
});