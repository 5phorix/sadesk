/**
 * Référentiel comptable et moteurs de rapprochement / lettrage.
 * Fonctions pures : aucune dépendance à React, Supabase ou au DOM.
 */

export const JOURNALS = [
  { code: 'AC', label: 'Achats' },
  { code: 'VE', label: 'Ventes' },
  { code: 'BQ', label: 'Banque' },
  { code: 'CA', label: 'Caisse' },
  { code: 'OD', label: 'Opérations diverses' },
  { code: 'AN', label: 'À nouveau' }
];

export const JOURNAL_LABELS = Object.fromEntries(
  JOURNALS.map((journal) => [journal.code, journal.label])
);

export const journalLabel = (code) => JOURNAL_LABELS[code] || 'Autres';

const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysBetween = (left, right) => {
  const a = toDate(left);
  const b = toDate(right);
  if (!a || !b) return null;
  return Math.abs((a - b) / 86_400_000);
};

/** Montant signé d'une écriture : positif au débit, négatif au crédit. */
export const signedAmount = (entry) => round2(toNumber(entry.debit) - toNumber(entry.credit));

/* -------------------------------------------------------------------------- */
/* Journaux                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Regroupe les écritures par journal, avec totaux et détection de déséquilibre.
 */
export function groupByJournal(entries = []) {
  const groups = new Map();

  entries.forEach((entry) => {
    const code = entry.journal || 'OD';
    if (!groups.has(code)) {
      groups.set(code, { code, label: journalLabel(code), entries: [], debit: 0, credit: 0 });
    }
    const group = groups.get(code);
    group.entries.push(entry);
    group.debit += toNumber(entry.debit);
    group.credit += toNumber(entry.credit);
  });

  return Array.from(groups.values())
    .map((group) => {
      const debit = round2(group.debit);
      const credit = round2(group.credit);
      return {
        ...group,
        debit,
        credit,
        balance: round2(debit - credit),
        isBalanced: Math.abs(debit - credit) < 0.01,
        count: group.entries.length
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Regroupe les lignes d'un journal par pièce (entry_number), triées par date.
 */
export function groupByVoucher(entries = []) {
  const groups = new Map();

  entries.forEach((entry) => {
    const key = entry.entry_number || `__sans_piece__${entry.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        entryNumber: entry.entry_number || null,
        date: entry.date,
        lines: [],
        debit: 0,
        credit: 0
      });
    }
    const group = groups.get(key);
    group.lines.push(entry);
    group.debit += toNumber(entry.debit);
    group.credit += toNumber(entry.credit);
    if (entry.date < group.date) group.date = entry.date;
  });

  return Array.from(groups.values())
    .map((group) => {
      const debit = round2(group.debit);
      const credit = round2(group.credit);
      return {
        ...group,
        debit,
        credit,
        isBalanced: Math.abs(debit - credit) < 0.01
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/* -------------------------------------------------------------------------- */
/* Lettrage                                                                    */
/* -------------------------------------------------------------------------- */

/** Un lettrage n'a de sens que sur les comptes de tiers (401, 411) et assimilés. */
export const isLetterableAccount = (accountCode = '') =>
  accountCode.startsWith('40') || accountCode.startsWith('41') || accountCode.startsWith('42');

/**
 * Regroupe les écritures lettrées par code et vérifie l'équilibre de chaque groupe.
 * Un groupe déséquilibré signale un lettrage incohérent.
 */
export function letteringGroups(entries = []) {
  const groups = new Map();

  entries.forEach((entry) => {
    if (!entry.lettering) return;
    if (!groups.has(entry.lettering)) {
      groups.set(entry.lettering, {
        code: entry.lettering,
        accountCode: entry.account_code,
        lines: [],
        debit: 0,
        credit: 0
      });
    }
    const group = groups.get(entry.lettering);
    group.lines.push(entry);
    group.debit += toNumber(entry.debit);
    group.credit += toNumber(entry.credit);
  });

  return Array.from(groups.values()).map((group) => {
    const debit = round2(group.debit);
    const credit = round2(group.credit);
    return {
      ...group,
      debit,
      credit,
      balance: round2(debit - credit),
      isBalanced: Math.abs(debit - credit) < 0.01
    };
  });
}

/**
 * Propose des groupes de lettrage sur un compte : une écriture au débit
 * compensée exactement par une écriture au crédit.
 */
export function suggestLettering(entries = [], options = {}) {
  const { maxDayGap = 90 } = options;

  const open = entries.filter((entry) => !entry.lettering);
  const debits = open.filter((entry) => toNumber(entry.debit) > 0);
  const credits = open.filter((entry) => toNumber(entry.credit) > 0);

  const used = new Set();
  const suggestions = [];

  debits.forEach((debit) => {
    const target = round2(debit.debit);

    const candidate = credits
      .filter((credit) => !used.has(credit.id))
      .filter((credit) => credit.account_code === debit.account_code)
      .filter((credit) => Math.abs(round2(credit.credit) - target) < 0.01)
      .filter((credit) => {
        const gap = daysBetween(credit.date, debit.date);
        return gap === null || gap <= maxDayGap;
      })
      .sort((a, b) => {
        const gapA = daysBetween(a.date, debit.date) ?? Number.MAX_SAFE_INTEGER;
        const gapB = daysBetween(b.date, debit.date) ?? Number.MAX_SAFE_INTEGER;
        return gapA - gapB;
      })[0];

    if (!candidate) return;

    used.add(candidate.id);
    suggestions.push({
      accountCode: debit.account_code,
      amount: target,
      entries: [debit, candidate]
    });
  });

  return suggestions;
}

/* -------------------------------------------------------------------------- */
/* Rapprochement bancaire                                                      */
/* -------------------------------------------------------------------------- */

/** Normalise un libellé pour la comparaison : minuscules, sans accents ni ponctuation. */
export function normalizeLabel(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similarité de libellés : proportion de mots significatifs communs (0 à 1). */
export function labelSimilarity(left = '', right = '') {
  const leftWords = new Set(normalizeLabel(left).split(' ').filter((word) => word.length > 2));
  const rightWords = new Set(normalizeLabel(right).split(' ').filter((word) => word.length > 2));

  if (leftWords.size === 0 || rightWords.size === 0) return 0;

  let common = 0;
  leftWords.forEach((word) => {
    if (rightWords.has(word)) common += 1;
  });

  return round2(common / Math.min(leftWords.size, rightWords.size));
}

export const RECONCILIATION_WEIGHTS = {
  amount: 60,
  date: 20,
  label: 15,
  reference: 5
};

/**
 * Score de correspondance entre une transaction bancaire et une écriture (0 à 100).
 * Un montant discordant est éliminatoire : le rapprochement comptable est exact.
 */
export function reconciliationScore(transaction, entry, options = {}) {
  const { maxDayGap = 10 } = options;

  const transactionAmount = round2(Math.abs(toNumber(transaction.amount)));
  const entryAmount = round2(Math.abs(signedAmount(entry)));
  if (Math.abs(transactionAmount - entryAmount) > 0.01) return 0;

  // Un encaissement doit correspondre à un débit de trésorerie, et inversement.
  const transactionIsInflow = toNumber(transaction.amount) >= 0;
  const entryIsInflow = signedAmount(entry) >= 0;
  if (transactionIsInflow !== entryIsInflow) return 0;

  let score = RECONCILIATION_WEIGHTS.amount;

  const gap = daysBetween(transaction.transaction_date, entry.date);
  if (gap !== null && gap <= maxDayGap) {
    score += RECONCILIATION_WEIGHTS.date * (1 - gap / maxDayGap);
  }

  score += RECONCILIATION_WEIGHTS.label * labelSimilarity(transaction.description, entry.label);

  const reference = (transaction.reference || '').trim();
  if (reference && (entry.reference || '').trim() === reference) {
    score += RECONCILIATION_WEIGHTS.reference;
  }

  return round2(score);
}

export const RECONCILIATION_MIN_SCORE = 70;
export const RECONCILIATION_AMBIGUITY_MARGIN = 5;

/**
 * Meilleur candidat pour une transaction.
 * Retourne `ambiguous` si deux candidats sont trop proches pour trancher :
 * mieux vaut un rapprochement manuel qu'un faux positif.
 */
export function bestMatch(transaction, entries = [], options = {}) {
  const {
    minScore = RECONCILIATION_MIN_SCORE,
    ambiguityMargin = RECONCILIATION_AMBIGUITY_MARGIN
  } = options;

  const scored = entries
    .map((entry) => ({ entry, score: reconciliationScore(transaction, entry, options) }))
    .filter((candidate) => candidate.score >= minScore)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { match: null, score: 0, ambiguous: false, candidates: [] };

  const [best, runnerUp] = scored;
  const ambiguous = Boolean(runnerUp && best.score - runnerUp.score < ambiguityMargin);

  return {
    match: ambiguous ? null : best.entry,
    score: best.score,
    ambiguous,
    candidates: scored.slice(0, 5)
  };
}

/**
 * Rapprochement automatique : n'apparie que les correspondances non ambiguës,
 * chaque écriture ne pouvant être utilisée qu'une fois.
 */
export function autoReconcile(transactions = [], entries = [], options = {}) {
  const available = new Map(entries.map((entry) => [entry.id, entry]));
  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  transactions.forEach((transaction) => {
    const result = bestMatch(transaction, Array.from(available.values()), options);

    if (result.match) {
      available.delete(result.match.id);
      matched.push({ transaction, entry: result.match, score: result.score });
    } else if (result.ambiguous) {
      ambiguous.push({ transaction, candidates: result.candidates });
    } else {
      unmatched.push({ transaction });
    }
  });

  return { matched, ambiguous, unmatched };
}
