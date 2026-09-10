import { describe, expect, it } from 'vitest';
import {
  autoReconcile,
  bestMatch,
  groupByJournal,
  groupByVoucher,
  isLetterableAccount,
  journalLabel,
  labelSimilarity,
  letteringGroups,
  normalizeLabel,
  reconciliationScore,
  signedAmount,
  suggestLettering,
} from '@/lib/accounting';

const entry = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  date: '2024-03-10',
  journal: 'BQ',
  account_code: '512000',
  label: 'Virement client',
  debit: 0,
  credit: 0,
  ...overrides,
});

const transaction = (overrides = {}) => ({
  id: 't1',
  transaction_date: '2024-03-10',
  description: 'VIREMENT CLIENT DUPONT',
  reference: 'VIR123',
  amount: 1000,
  ...overrides,
});

describe('référentiel journaux', () => {
  it('resout les libelles connus', () => {
    expect(journalLabel('AC')).toBe('Achats');
    expect(journalLabel('VE')).toBe('Ventes');
  });

  it('retombe sur un libelle generique', () => {
    expect(journalLabel('ZZ')).toBe('Autres');
    expect(journalLabel(undefined)).toBe('Autres');
  });
});

describe('groupByJournal', () => {
  it('totalise et detecte le desequilibre', () => {
    const groups = groupByJournal([
      entry({ journal: 'AC', debit: 100 }),
      entry({ journal: 'AC', credit: 100 }),
      entry({ journal: 'VE', debit: 50 }),
    ]);

    const achats = groups.find((group) => group.code === 'AC');
    expect(achats.debit).toBe(100);
    expect(achats.credit).toBe(100);
    expect(achats.isBalanced).toBe(true);
    expect(achats.count).toBe(2);

    const ventes = groups.find((group) => group.code === 'VE');
    expect(ventes.isBalanced).toBe(false);
    expect(ventes.balance).toBe(50);
  });

  it('rattache les ecritures sans journal aux operations diverses', () => {
    const groups = groupByJournal([entry({ journal: null, debit: 10 })]);
    expect(groups[0].code).toBe('OD');
  });
});

describe('groupByVoucher', () => {
  it('regroupe par numero de piece et verifie l equilibre', () => {
    const vouchers = groupByVoucher([
      entry({ entry_number: 'AC-1', debit: 120 }),
      entry({ entry_number: 'AC-1', credit: 120 }),
      entry({ entry_number: 'AC-2', debit: 80 }),
    ]);

    expect(vouchers).toHaveLength(2);
    expect(vouchers.find((v) => v.entryNumber === 'AC-1').isBalanced).toBe(true);
    expect(vouchers.find((v) => v.entryNumber === 'AC-2').isBalanced).toBe(false);
  });

  it('isole les lignes sans numero de piece', () => {
    const vouchers = groupByVoucher([
      entry({ id: 'a', entry_number: null, debit: 10 }),
      entry({ id: 'b', entry_number: null, credit: 10 }),
    ]);
    expect(vouchers).toHaveLength(2);
  });
});

describe('signedAmount', () => {
  it('rend le debit positif et le credit negatif', () => {
    expect(signedAmount({ debit: 100, credit: 0 })).toBe(100);
    expect(signedAmount({ debit: 0, credit: 100 })).toBe(-100);
  });
});

describe('lettrage', () => {
  it('identifie les comptes lettrables', () => {
    expect(isLetterableAccount('401000')).toBe(true);
    expect(isLetterableAccount('411000')).toBe(true);
    expect(isLetterableAccount('512000')).toBe(false);
    expect(isLetterableAccount('607000')).toBe(false);
  });

  it('signale un groupe de lettrage desequilibre', () => {
    const groups = letteringGroups([
      entry({ account_code: '411000', debit: 100, lettering: 'AAA' }),
      entry({ account_code: '411000', credit: 80, lettering: 'AAA' }),
      entry({ account_code: '411000', debit: 50, lettering: 'AAB' }),
      entry({ account_code: '411000', credit: 50, lettering: 'AAB' }),
    ]);

    expect(groups.find((g) => g.code === 'AAA').isBalanced).toBe(false);
    expect(groups.find((g) => g.code === 'AAA').balance).toBe(20);
    expect(groups.find((g) => g.code === 'AAB').isBalanced).toBe(true);
  });

  it('ignore les ecritures non lettrees', () => {
    expect(letteringGroups([entry({ debit: 10 })])).toEqual([]);
  });

  it('propose un appariement debit/credit de meme montant', () => {
    const facture = entry({ id: 'f', account_code: '411000', debit: 1200, date: '2024-01-10' });
    const reglement = entry({ id: 'r', account_code: '411000', credit: 1200, date: '2024-02-05' });

    const suggestions = suggestLettering([facture, reglement]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].amount).toBe(1200);
    expect(suggestions[0].entries.map((e) => e.id).sort()).toEqual(['f', 'r']);
  });

  it('ne propose pas d appariement entre comptes differents', () => {
    const suggestions = suggestLettering([
      entry({ id: 'f', account_code: '411000', debit: 500 }),
      entry({ id: 'r', account_code: '401000', credit: 500 }),
    ]);
    expect(suggestions).toEqual([]);
  });

  it('n utilise pas deux fois la meme contrepartie', () => {
    const suggestions = suggestLettering([
      entry({ id: 'f1', account_code: '411000', debit: 100 }),
      entry({ id: 'f2', account_code: '411000', debit: 100 }),
      entry({ id: 'r1', account_code: '411000', credit: 100 }),
    ]);
    expect(suggestions).toHaveLength(1);
  });

  it('ecarte les appariements trop eloignes dans le temps', () => {
    const suggestions = suggestLettering([
      entry({ id: 'f', account_code: '411000', debit: 100, date: '2024-01-01' }),
      entry({ id: 'r', account_code: '411000', credit: 100, date: '2024-12-01' }),
    ]);
    expect(suggestions).toEqual([]);
  });

  it('ignore les ecritures deja lettrees', () => {
    const suggestions = suggestLettering([
      entry({ id: 'f', account_code: '411000', debit: 100, lettering: 'AAA' }),
      entry({ id: 'r', account_code: '411000', credit: 100 }),
    ]);
    expect(suggestions).toEqual([]);
  });
});

describe('normalizeLabel / labelSimilarity', () => {
  it('supprime accents et ponctuation', () => {
    expect(normalizeLabel('Réglé  FACTURE-n°12 !')).toBe('regle facture n 12');
  });

  it('mesure la proportion de mots communs', () => {
    expect(labelSimilarity('VIREMENT CLIENT DUPONT', 'Virement Dupont')).toBe(1);
    expect(labelSimilarity('ACHAT FOURNITURES', 'VENTE MARCHANDISES')).toBe(0);
  });

  it('retourne zero si un libelle est vide', () => {
    expect(labelSimilarity('', 'quelque chose')).toBe(0);
  });
});

describe('reconciliationScore', () => {
  it('elimine un montant discordant', () => {
    expect(reconciliationScore(transaction({ amount: 1000 }), entry({ debit: 999 }))).toBe(0);
  });

  it('elimine un sens de flux oppose', () => {
    // Encaissement bancaire face a un credit de tresorerie : incoherent.
    expect(reconciliationScore(transaction({ amount: 1000 }), entry({ credit: 1000 }))).toBe(0);
  });

  it('donne un score maximal sur une correspondance parfaite', () => {
    const score = reconciliationScore(
      transaction(),
      entry({ debit: 1000, label: 'Virement client Dupont', reference: 'VIR123' })
    );
    expect(score).toBe(100);
  });

  it('decroit avec l ecart de date', () => {
    const proche = reconciliationScore(transaction(), entry({ debit: 1000, date: '2024-03-10' }));
    const lointain = reconciliationScore(transaction(), entry({ debit: 1000, date: '2024-03-18' }));
    expect(proche).toBeGreaterThan(lointain);
  });

  it('ignore la date au dela de la fenetre', () => {
    const score = reconciliationScore(transaction(), entry({ debit: 1000, date: '2024-06-01', label: '' }));
    expect(score).toBe(60);
  });
});

describe('bestMatch', () => {
  it('retient le meilleur candidat', () => {
    const bon = entry({ id: 'bon', debit: 1000, label: 'Virement client Dupont' });
    const moyen = entry({ id: 'moyen', debit: 1000, label: 'Autre chose', date: '2024-03-14' });

    const result = bestMatch(transaction(), [bon, moyen]);
    expect(result.match.id).toBe('bon');
    expect(result.ambiguous).toBe(false);
  });

  it('refuse de trancher entre deux candidats equivalents', () => {
    const a = entry({ id: 'a', debit: 1000, label: 'Virement client Dupont' });
    const b = entry({ id: 'b', debit: 1000, label: 'Virement client Dupont' });

    const result = bestMatch(transaction(), [a, b]);
    expect(result.ambiguous).toBe(true);
    expect(result.match).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it('ne retourne rien sous le score minimal', () => {
    const result = bestMatch(transaction(), [entry({ debit: 500 })]);
    expect(result.match).toBeNull();
    expect(result.score).toBe(0);
  });
});

describe('autoReconcile', () => {
  it('apparie sans reutiliser une ecriture', () => {
    const t1 = transaction({ id: 't1', amount: 1000, description: 'VIREMENT DUPONT' });
    const t2 = transaction({ id: 't2', amount: 1000, description: 'VIREMENT DUPONT' });
    const e1 = entry({ id: 'e1', debit: 1000, label: 'Virement Dupont' });

    const result = autoReconcile([t1, t2], [e1]);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].entry.id).toBe('e1');
    expect(result.unmatched).toHaveLength(1);
  });

  it('classe les cas ambigus a part plutot que de deviner', () => {
    const result = autoReconcile(
      [transaction()],
      [
        entry({ id: 'a', debit: 1000, label: 'Virement client Dupont' }),
        entry({ id: 'b', debit: 1000, label: 'Virement client Dupont' }),
      ]
    );

    expect(result.matched).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
  });

  it('laisse les transactions sans correspondance', () => {
    const result = autoReconcile([transaction({ amount: 42 })], [entry({ debit: 1000 })]);
    expect(result.unmatched).toHaveLength(1);
  });
});
