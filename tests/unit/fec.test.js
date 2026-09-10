import { describe, expect, it } from 'vitest';
import {
  FEC_COLUMNS,
  buildFecRows,
  fecAmount,
  fecDate,
  fecFileName,
  sanitize,
  serializeFec,
  validateFec,
} from '@/lib/fec';

const entry = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  entry_number: 'AC-1',
  date: '2024-03-05',
  journal: 'AC',
  account_code: '607000',
  account_label: 'Achats de marchandises',
  label: 'Facture F001',
  debit: 100,
  credit: 0,
  reference: 'F001',
  is_validated: true,
  ...overrides,
});

const balancedPair = (number, date = '2024-03-05') => [
  entry({ entry_number: number, date, debit: 100, credit: 0, account_code: '607000' }),
  entry({ entry_number: number, date, debit: 0, credit: 100, account_code: '401000' }),
];

describe('formatage FEC', () => {
  it('formate la date en AAAAMMJJ', () => {
    expect(fecDate('2024-03-05')).toBe('20240305');
    expect(fecDate('2024-12-31')).toBe('20241231');
  });

  it('retourne une chaine vide pour une date absente ou invalide', () => {
    expect(fecDate(null)).toBe('');
    expect(fecDate('pas une date')).toBe('');
  });

  it('formate les montants avec une virgule decimale', () => {
    expect(fecAmount(1234.5)).toBe('1234,50');
    expect(fecAmount(0)).toBe('0,00');
    expect(fecAmount('12.345')).toBe('12,35');
  });

  it('neutralise les separateurs dans les libelles', () => {
    expect(sanitize('Libellé\tavec\ttabulation')).toBe('Libellé avec tabulation');
    expect(sanitize('Ligne1\nLigne2')).toBe('Ligne1 Ligne2');
    expect(sanitize(null)).toBe('');
  });

  it('normalise le nom de fichier', () => {
    expect(fecFileName('123456789', '2024-12-31')).toBe('123456789FEC20241231.txt');
    expect(fecFileName('123 456 789', '2024-12-31')).toBe('123456789FEC20241231.txt');
  });

  it('complete un SIREN incomplet', () => {
    expect(fecFileName('', '2024-12-31')).toBe('000000000FEC20241231.txt');
  });
});

describe('buildFecRows', () => {
  it('produit les 18 colonnes normalisees', () => {
    const [row] = buildFecRows([entry()]);
    expect(Object.keys(row)).toEqual(FEC_COLUMNS);
  });

  it('resout le compte auxiliaire par le code tiers, pas par l UUID', () => {
    const [row] = buildFecRows([entry({ third_party_id: 'uuid-1', third_party_name: 'Dupont' })], {
      thirdParties: [{ id: 'uuid-1', code: 'C001', name: 'Dupont SARL' }],
    });

    expect(row.CompAuxNum).toBe('C001');
    expect(row.CompAuxLib).toBe('Dupont SARL');
  });

  it('laisse le compte auxiliaire vide sans tiers rattache', () => {
    const [row] = buildFecRows([entry()]);
    expect(row.CompAuxNum).toBe('');
    expect(row.CompAuxLib).toBe('');
  });

  it('renseigne DateLet uniquement si l ecriture est lettree', () => {
    const [lettre] = buildFecRows([entry({ lettering: 'AAA', lettered_at: '2024-04-01' })]);
    expect(lettre.EcritureLet).toBe('AAA');
    expect(lettre.DateLet).toBe('20240401');

    const [nonLettre] = buildFecRows([entry()]);
    expect(nonLettre.DateLet).toBe('');
  });

  it('renseigne ValidDate seulement pour les ecritures validees', () => {
    const [valide] = buildFecRows([entry({ is_validated: true, validated_at: '2024-03-31' })]);
    expect(valide.ValidDate).toBe('20240331');

    const [brouillon] = buildFecRows([entry({ is_validated: false })]);
    expect(brouillon.ValidDate).toBe('');
  });

  it('trie les ecritures par date puis par numero de piece', () => {
    const rows = buildFecRows([
      entry({ entry_number: 'B', date: '2024-05-01' }),
      entry({ entry_number: 'A', date: '2024-01-01' }),
      entry({ entry_number: 'A2', date: '2024-01-01' }),
    ]);

    expect(rows.map((row) => row.EcritureNum)).toEqual(['A', 'A2', 'B']);
  });

  it('utilise le numero de piece comme reference par defaut', () => {
    const [row] = buildFecRows([entry({ reference: null, entry_number: 'AC-9' })]);
    expect(row.PieceRef).toBe('AC-9');
  });
});

describe('serializeFec', () => {
  it('produit un en-tete tabule et des lignes CRLF', () => {
    const content = serializeFec(buildFecRows([entry()]));
    const lines = content.split('\r\n');

    expect(lines[0]).toBe(FEC_COLUMNS.join('\t'));
    expect(lines).toHaveLength(2);
    expect(lines[1].split('\t')).toHaveLength(18);
  });
});

describe('validateFec', () => {
  const codesOf = (result) => result.issues.map((item) => item.code);

  it('accepte un fichier equilibre', () => {
    const result = validateFec(balancedPair('AC-1'), { year: 2024 });
    expect(result.isValid).toBe(true);
    expect(result.totals.debit).toBe(100);
    expect(result.totals.credit).toBe(100);
    expect(result.totals.vouchers).toBe(1);
  });

  it('rejette un fichier vide', () => {
    const result = validateFec([], { year: 2024 });
    expect(result.isValid).toBe(false);
    expect(codesOf(result)).toContain('EMPTY');
  });

  it('detecte un desequilibre global', () => {
    const result = validateFec([entry({ debit: 100 })], { year: 2024 });
    expect(result.isValid).toBe(false);
    expect(codesOf(result)).toContain('UNBALANCED_TOTAL');
  });

  it('detecte une piece desequilibree', () => {
    const result = validateFec(
      [
        ...balancedPair('AC-1'),
        entry({ entry_number: 'AC-2', debit: 50 }),
        entry({ entry_number: 'AC-3', credit: 50 }),
      ],
      { year: 2024 }
    );

    expect(codesOf(result)).toContain('UNBALANCED_VOUCHER');
    expect(result.isValid).toBe(false);
  });

  it('detecte les numeros de piece manquants', () => {
    const result = validateFec(
      [entry({ entry_number: null, debit: 100 }), entry({ entry_number: null, credit: 100 })],
      { year: 2024 }
    );
    expect(codesOf(result)).toContain('MISSING_ENTRY_NUMBER');
  });

  it('detecte un compte manquant', () => {
    const lines = balancedPair('AC-1');
    lines[0].account_code = null;
    expect(codesOf(validateFec(lines, { year: 2024 }))).toContain('MISSING_ACCOUNT');
  });

  it('detecte debit et credit simultanes', () => {
    const result = validateFec([entry({ debit: 100, credit: 100 })], { year: 2024 });
    expect(codesOf(result)).toContain('BOTH_SIDES');
  });

  it('detecte les montants nuls', () => {
    const result = validateFec([entry({ debit: 0, credit: 0 })], { year: 2024 });
    expect(codesOf(result)).toContain('ZERO_AMOUNT');
  });

  it('signale les ecritures hors exercice sans bloquer', () => {
    const lines = balancedPair('AC-1', '2023-06-01');
    const result = validateFec(lines, { year: 2024 });

    expect(codesOf(result)).toContain('OUT_OF_YEAR');
    expect(result.isValid).toBe(true);
  });

  it('signale les ecritures non validees sans bloquer', () => {
    const lines = balancedPair('AC-1').map((line) => ({ ...line, is_validated: false }));
    const result = validateFec(lines, { year: 2024 });

    expect(codesOf(result)).toContain('NOT_VALIDATED');
    expect(result.isValid).toBe(true);
  });

  it('n exige pas la validation quand l option est levee', () => {
    const lines = balancedPair('AC-1').map((line) => ({ ...line, is_validated: false }));
    const result = validateFec(lines, { year: 2024, requireValidated: false });
    expect(codesOf(result)).not.toContain('NOT_VALIDATED');
  });

  it('signale un lettrage desequilibre', () => {
    const lines = [
      entry({ entry_number: 'AC-1', account_code: '411000', debit: 100, lettering: 'AAA' }),
      entry({ entry_number: 'AC-1', account_code: '707000', credit: 100 }),
      entry({ entry_number: 'AC-2', account_code: '411000', credit: 60, lettering: 'AAA' }),
      entry({ entry_number: 'AC-2', account_code: '707000', debit: 60 }),
    ];

    expect(codesOf(validateFec(lines, { year: 2024 }))).toContain('UNBALANCED_LETTERING');
  });
});
