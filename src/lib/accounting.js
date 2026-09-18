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

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const duplicateKey = (entry) => [
  entry.date,
  entry.journal,
  entry.entry_number,
  entry.account_code,
  entry.label,
  round2(entry.debit),
  round2(entry.credit),
  entry.reference
].map((value) => String(value ?? '')).join('|');

/** Détecte les lignes strictement identiques, hors identifiant technique. */
export function duplicateEntryAnomalies(entries = []) {
  const groups = new Map();
  entries.forEach((entry) => {
    const key = duplicateKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      type: 'duplicate',
      severity: 'high',
      message: `${group.length} lignes identiques détectées pour ${group[0].label || 'une écriture'}.`,
      entryIds: group.map((entry) => entry.id).filter(Boolean),
      entries: group
    }));
}

/** Signale un montant très supérieur à l'habitude de son compte. */
export function unusualAmountAnomalies(entries = [], options = {}) {
  const { minSamples = 3, multipleOfMedian = 10, minimumAmount = 10000 } = options;
  const byAccount = new Map();

  entries.forEach((entry) => {
    const amount = Math.abs(signedAmount(entry));
    if (!entry.account_code || amount <= 0) return;
    if (!byAccount.has(entry.account_code)) byAccount.set(entry.account_code, []);
    byAccount.get(entry.account_code).push({ entry, amount });
  });

  return Array.from(byAccount.entries()).flatMap(([accountCode, values]) => {
    if (values.length < minSamples) return [];
    const reference = median(values.map(({ amount }) => amount));
    if (reference <= 0) return [];

    return values
      .filter(({ amount }) => amount >= minimumAmount && amount >= reference * multipleOfMedian)
      .map(({ entry, amount }) => ({
        type: 'unusual_amount',
        severity: 'medium',
        message: `Montant de ${amount.toFixed(2)} € inhabituel sur le compte ${accountCode} (médiane: ${reference.toFixed(2)} €).`,
        entryIds: entry.id ? [entry.id] : [],
        entries: [entry]
      }));
  });
}

/** Signale les comptes absents du plan comptable fourni par la société. */
export function unknownAccountAnomalies(entries = [], knownAccountCodes = []) {
  const known = new Set(knownAccountCodes.map((code) => String(code).trim()).filter(Boolean));
  if (known.size === 0) return [];

  return entries
    .filter((entry) => entry.account_code && !known.has(String(entry.account_code).trim()))
    .map((entry) => ({
      type: 'unknown_account',
      severity: 'medium',
      message: `Le compte ${entry.account_code} n'est pas présent dans le plan comptable chargé.`,
      entryIds: entry.id ? [entry.id] : [],
      entries: [entry]
    }));
}

/** Agrège les contrôles proactifs sans modifier les écritures comptables. */
export function detectAccountingAnomalies(entries = [], options = {}) {
  return [
    ...duplicateEntryAnomalies(entries),
    ...unusualAmountAnomalies(entries, options),
    ...unknownAccountAnomalies(entries, options.knownAccountCodes)
  ];
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

/* -------------------------------------------------------------------------- */
/* Référentiels des plans comptables (PCG & SYSCOHADA)                        */
/* -------------------------------------------------------------------------- */

export const ACCOUNTING_PLAN_CLASSES = {
  PCG: [
    { code: '1', label: 'Comptes de capitaux', shortLabel: 'Capitaux', scope: 'bilan', type: 'passif', color: 'bg-purple-100 text-purple-800 border-purple-200', iconColor: 'text-purple-600 bg-purple-50', description: 'Capitaux propres, emprunts et dettes assimilées' },
    { code: '2', label: 'Comptes d’immobilisations', shortLabel: 'Immobilisations', scope: 'bilan', type: 'actif', color: 'bg-blue-100 text-blue-800 border-blue-200', iconColor: 'text-blue-600 bg-blue-50', description: 'Immobilisations incorporelles, corporelles et financières' },
    { code: '3', label: 'Comptes de stocks et en-cours', shortLabel: 'Stocks', scope: 'bilan', type: 'actif', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', iconColor: 'text-cyan-600 bg-cyan-50', description: 'Matières premières, approvisionnements, en-cours, produits et marchandises' },
    { code: '4', label: 'Comptes de tiers', shortLabel: 'Tiers', scope: 'bilan', type: 'mixte', color: 'bg-amber-100 text-amber-800 border-amber-200', iconColor: 'text-amber-600 bg-amber-50', description: 'Fournisseurs, clients, personnel, organismes sociaux, État et associés' },
    { code: '5', label: 'Comptes financiers', shortLabel: 'Financiers', scope: 'bilan', type: 'mixte', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', iconColor: 'text-emerald-600 bg-emerald-50', description: 'Valeurs mobilières, banques, caisse et virements internes' },
    { code: '6', label: 'Comptes de charges', shortLabel: 'Charges', scope: 'resultat', type: 'charge', color: 'bg-rose-100 text-rose-800 border-rose-200', iconColor: 'text-rose-600 bg-rose-50', description: 'Achats, services extérieurs, impôts, personnel, charges financières et exceptionnelles' },
    { code: '7', label: 'Comptes de produits', shortLabel: 'Produits', scope: 'resultat', type: 'produit', color: 'bg-teal-100 text-teal-800 border-teal-200', iconColor: 'text-teal-600 bg-teal-50', description: 'Ventes, production stockée, subventions, produits financiers et exceptionnels' },
    { code: '8', label: 'Comptes spéciaux', shortLabel: 'Spéciaux', scope: 'special', type: 'special', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', iconColor: 'text-indigo-600 bg-indigo-50', description: 'Engagements hors bilan et comptes de clôture/réouverture' }
  ],
  SYSCOHADA: [
    { code: '1', label: 'Comptes de ressources durables', shortLabel: 'Ressources durables', scope: 'bilan', type: 'passif', color: 'bg-purple-100 text-purple-800 border-purple-200', iconColor: 'text-purple-600 bg-purple-50', description: 'Capitaux propres, dettes financières et provisions pour risques' },
    { code: '2', label: 'Comptes de l’actif immobilisé', shortLabel: 'Actif immobilisé', scope: 'bilan', type: 'actif', color: 'bg-blue-100 text-blue-800 border-blue-200', iconColor: 'text-blue-600 bg-blue-50', description: 'Charges immobilisées, immos corporelles, incorporelles et financières' },
    { code: '3', label: 'Comptes de stocks et en-cours', shortLabel: 'Stocks', scope: 'bilan', type: 'actif', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', iconColor: 'text-cyan-600 bg-cyan-50', description: 'Stocks de matières, approvisionnements, encours et marchandises' },
    { code: '4', label: 'Comptes de tiers', shortLabel: 'Tiers', scope: 'bilan', type: 'mixte', color: 'bg-amber-100 text-amber-800 border-amber-200', iconColor: 'text-amber-600 bg-amber-50', description: 'Fournisseurs, clients, personnel, organismes sociaux, État et associés' },
    { code: '5', label: 'Comptes de trésorerie', shortLabel: 'Trésorerie', scope: 'bilan', type: 'mixte', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', iconColor: 'text-emerald-600 bg-emerald-50', description: 'Titres de placement, banques, caisse, régies d’avances et virements' },
    { code: '6', label: 'Charges des activités ordinaires', shortLabel: 'Charges AO', scope: 'resultat', type: 'charge', color: 'bg-rose-100 text-rose-800 border-rose-200', iconColor: 'text-rose-600 bg-rose-50', description: 'Achats, transports, services extérieurs, impôts, personnel, frais financiers' },
    { code: '7', label: 'Produits des activités ordinaires', shortLabel: 'Produits AO', scope: 'resultat', type: 'produit', color: 'bg-teal-100 text-teal-800 border-teal-200', iconColor: 'text-teal-600 bg-teal-50', description: 'Ventes, production stockée, subventions et produits financiers' },
    { code: '8', label: 'Autres charges et autres produits (HAO)', shortLabel: 'Comptes HAO', scope: 'resultat', type: 'hao', color: 'bg-orange-100 text-orange-800 border-orange-200', iconColor: 'text-orange-600 bg-orange-50', description: 'Charges et produits hors activités ordinaires, participation des travailleurs' },
    { code: '9', label: 'Comptabilité analytique & Engagements', shortLabel: 'Analytique & Engagements', scope: 'analytique', type: 'analytique', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', iconColor: 'text-indigo-600 bg-indigo-50', description: 'Comptes analytiques d’exploitation et engagements hors bilan' }
  ]
};

export function getPlanClasses(planCode = 'PCG') {
  const normalized = String(planCode || '').toUpperCase().trim();
  if (normalized === 'SYSCOHADA' || normalized === 'OHADA') {
    return ACCOUNTING_PLAN_CLASSES.SYSCOHADA;
  }
  return ACCOUNTING_PLAN_CLASSES.PCG;
}

export function getClassMeta(classCode, planCode = 'PCG') {
  const classes = getPlanClasses(planCode);
  const found = classes.find((item) => item.code === String(classCode));
  if (found) return found;

  return {
    code: String(classCode || '?'),
    label: `Classe ${classCode}`,
    shortLabel: `Classe ${classCode}`,
    scope: 'autre',
    type: 'general',
    color: 'bg-slate-100 text-slate-800 border-slate-200',
    iconColor: 'text-slate-600 bg-slate-50',
    description: 'Compte général'
  };
}

export function inferAccountMeta(code = '', planCode = 'PCG') {
  const cleanCode = String(code || '').trim();
  const classCode = cleanCode.charAt(0);
  const classMeta = getClassMeta(classCode, planCode);

  let type = 'general';
  let category = 'actif';

  if (classCode === '1') {
    type = 'bilan';
    category = 'passif';
  } else if (classCode === '2' || classCode === '3') {
    type = 'bilan';
    category = 'actif';
  } else if (classCode === '4') {
    type = cleanCode.startsWith('40') ? 'tiers' : cleanCode.startsWith('41') ? 'tiers' : cleanCode.startsWith('445') ? 'tva' : 'tiers';
    category = cleanCode.startsWith('40') || cleanCode.startsWith('4457') ? 'passif' : 'actif';
  } else if (classCode === '5') {
    type = cleanCode.startsWith('512') || cleanCode.startsWith('52') ? 'banque' : cleanCode.startsWith('53') ? 'caisse' : 'financier';
    category = 'actif';
  } else if (classCode === '6') {
    type = 'charge';
    category = 'charge';
  } else if (classCode === '7') {
    type = 'produit';
    category = 'produit';
  } else if (classCode === '8') {
    type = planCode === 'SYSCOHADA' ? 'hao' : 'special';
    category = 'special';
  } else if (classCode === '9') {
    type = 'analytique';
    category = 'analytique';
  }

  return {
    classCode,
    classMeta,
    type,
    category
  };
}

/**
 * Détermine si un compte est un compte principal / normatif officiel ou un sous-compte personnalisable.
 * Un compte principal est typiquement à 2 chiffres (ou 1 chiffre de classe) structurant le plan.
 * Les sous-comptes (3 chiffres et plus, ex: 411000, 606300, 512100) sont entièrement personnalisables.
 */
export function isPrincipalAccount(account = {}) {
  const code = String(typeof account === 'string' ? account : account.code || '').trim();
  if (!code) return false;
  // Les comptes à 1 ou 2 chiffres sont les racines structurelles de la norme
  return code.length <= 2;
}

/* -------------------------------------------------------------------------- */
/* Moteur d'états financiers (Bilan, SIG, Bilan Fonctionnel avec Drill-down) */
/* -------------------------------------------------------------------------- */

/**
 * Calcule les soldes cumulés pour chaque compte à partir des écritures.
 */
export function computeAccountBalances(entries = [], accounts = []) {
  const balances = new Map();

  // Indexation des comptes connus
  accounts.forEach((acc) => {
    const code = String(acc.code || '').trim();
    if (!code) return;
    balances.set(code, {
      code,
      label: acc.label || `Compte ${code}`,
      class: String(acc.class || code.charAt(0)),
      type: acc.type || 'general',
      category: acc.category || null,
      parent_code: acc.parent_code || null,
      is_auxiliary: Boolean(acc.is_auxiliary),
      is_active: acc.is_active !== false,
      debit: 0,
      credit: 0,
      balance: 0,
      entriesCount: 0
    });
  });

  // Agrégation des écritures validées
  entries.forEach((entry) => {
    const code = String(entry.account_code || '').trim();
    if (!code) return;

    if (!balances.has(code)) {
      balances.set(code, {
        code,
        label: entry.account_label || `Compte ${code}`,
        class: String(code.charAt(0)),
        type: 'general',
        category: null,
        parent_code: code.length > 2 ? code.slice(0, 2) : null,
        is_auxiliary: false,
        is_active: true,
        debit: 0,
        credit: 0,
        balance: 0,
        entriesCount: 0
      });
    }

    const item = balances.get(code);
    const d = toNumber(entry.debit);
    const c = toNumber(entry.credit);
    item.debit += d;
    item.credit += c;
    item.entriesCount += 1;
  });

  // Calcul du solde net signé pour chaque compte
  Array.from(balances.values()).forEach((item) => {
    item.debit = round2(item.debit);
    item.credit = round2(item.credit);
    item.balance = round2(item.debit - item.credit); // Positif = débiteur, Négatif = créditeur
    item.soldeDebiteur = item.balance > 0 ? item.balance : 0;
    item.soldeCrediteur = item.balance < 0 ? Math.abs(item.balance) : 0;
  });

  return Array.from(balances.values());
}

/**
 * Filtre les comptes correspondant à un ensemble de préfixes ou prédicats
 * et construit le poste agrégé avec détail traçable.
 */
function aggregateItem({ id, label, ruleDescription, prefixes = [], excludePrefixes = [], filterFn, balances = [], mode = 'debit_minus_credit' }) {
  const matchedAccounts = balances.filter((acc) => {
    if (prefixes.length > 0) {
      const matchPrefix = prefixes.some((p) => acc.code.startsWith(p));
      if (!matchPrefix) return false;
    }
    if (excludePrefixes.length > 0) {
      const matchExcluded = excludePrefixes.some((p) => acc.code.startsWith(p));
      if (matchExcluded) return false;
    }
    if (typeof filterFn === 'function') {
      return filterFn(acc);
    }
    return true;
  });

  let total = 0;
  const accountsBreakdown = matchedAccounts
    .map((acc) => {
      let contribution = 0;
      if (mode === 'debit_minus_credit') contribution = acc.balance; // Débit - Crédit
      else if (mode === 'credit_minus_debit') contribution = -acc.balance; // Crédit - Débit
      else if (mode === 'debit_only') contribution = acc.debit;
      else if (mode === 'credit_only') contribution = acc.credit;
      else if (mode === 'solde_debiteur') contribution = acc.soldeDebiteur;
      else if (mode === 'solde_crediteur') contribution = acc.soldeCrediteur;

      contribution = round2(contribution);
      return {
        ...acc,
        contribution
      };
    })
    .filter((acc) => Math.abs(acc.contribution) > 0.001 || acc.debit > 0 || acc.credit > 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  total = round2(accountsBreakdown.reduce((sum, item) => sum + item.contribution, 0));

  return {
    id,
    label,
    ruleDescription,
    amount: total,
    accountsCount: accountsBreakdown.length,
    accounts: accountsBreakdown
  };
}

function netWithReduction(item, reduction) {
  return {
    ...item,
    amount: round2(item.amount - reduction.amount),
    accountsCount: item.accounts.length + reduction.accounts.length,
    accounts: [
      ...item.accounts,
      ...reduction.accounts.map((account) => ({
        ...account,
        contribution: round2(-account.contribution)
      }))
    ].sort((left, right) => left.code.localeCompare(right.code))
  };
}

/**
 * Calcule l'intégralité des états financiers (Bilan, SIG, Bilan fonctionnel)
 * avec traçabilité et explication comptable stricte de chaque ligne.
 */
export function buildFinancialStatements({ entries = [], accounts = [], planCode = 'PCG' }) {
  const balances = computeAccountBalances(entries, accounts);
  const isSyscohada = String(planCode || '').toUpperCase().includes('OHADA') || String(planCode || '').toUpperCase() === 'SYSCOHADA';

  /* ------------------------------------------------------------------------ */
  /* 1. Soldes Intermédiaires de Gestion (SIG)                                */
  /* ------------------------------------------------------------------------ */

  // A. Ventes nettes de marchandises (707 - 7097)
  const ventesMarchandisesBrutes = aggregateItem({
    id: 'ventes_marchandises',
    label: 'Ventes de marchandises',
    ruleDescription: 'Produits issus des ventes de marchandises achetées pour être revendues sans transformation (Comptes 707)',
    prefixes: isSyscohada ? ['701'] : ['707'],
    balances,
    mode: 'credit_minus_debit'
  });

  const reductionsVentesMarchandises = aggregateItem({
    id: 'reductions_ventes_marchandises',
    label: 'Réductions sur ventes de marchandises',
    ruleDescription: 'Rabais, remises, ristournes et retours sur ventes de marchandises (Compte 7097)',
    prefixes: isSyscohada ? [] : ['7097'],
    balances,
    mode: 'debit_minus_credit'
  });

  const ventesMarchandises = netWithReduction(ventesMarchandisesBrutes, reductionsVentesMarchandises);

  // B. Achats nets de marchandises & variations (607 + 6037 - 6097)
  const achatsMarchandisesBruts = aggregateItem({
    id: 'achats_marchandises',
    label: 'Achats de marchandises & variations de stock',
    ruleDescription: 'Achats de marchandises revendues en l’état (607) corrigés de la variation de stock (6037)',
    prefixes: isSyscohada ? ['601', '6031'] : ['607', '6037'],
    balances,
    mode: 'debit_minus_credit'
  });

  const reductionsAchatsMarchandises = aggregateItem({
    id: 'reductions_achats_marchandises',
    label: 'Réductions sur achats de marchandises',
    ruleDescription: 'Rabais, remises, ristournes et retours sur achats de marchandises (Compte 6097)',
    prefixes: isSyscohada ? [] : ['6097'],
    balances,
    mode: 'credit_minus_debit'
  });

  const achatsMarchandises = netWithReduction(achatsMarchandisesBruts, reductionsAchatsMarchandises);

  const margeCommercialeAmount = round2(ventesMarchandises.amount - achatsMarchandises.amount);

  // C. Production vendue nette (701 à 706, 708 - 7091 à 7096/7098)
  const productionVendueBrute = aggregateItem({
    id: 'production_vendue',
    label: 'Production vendue (Biens & Services)',
    ruleDescription: 'Ventes de produits finis, travaux et prestations de services (Comptes 701 à 706, 708)',
    prefixes: isSyscohada ? ['702', '703', '704', '705', '706'] : ['701', '702', '703', '704', '705', '706', '708'],
    balances,
    mode: 'credit_minus_debit'
  });

  const reductionsProductionVendue = aggregateItem({
    id: 'reductions_production_vendue',
    label: 'Réductions sur production vendue',
    ruleDescription: 'Rabais, remises, ristournes et retours sur production vendue (Comptes 7091 à 7096 et 7098)',
    prefixes: isSyscohada ? [] : ['7091', '7092', '7093', '7094', '7095', '7096', '7098'],
    balances,
    mode: 'debit_minus_credit'
  });

  const productionVendue = netWithReduction(productionVendueBrute, reductionsProductionVendue);

  // D. Production stockée & immobilisée (71, 72)
  const productionStockeeImmobilisee = aggregateItem({
    id: 'production_stockee_immob',
    label: 'Production stockée & immobilisée',
    ruleDescription: 'Variation de la production stockée (713) et travaux faits par l’entreprise pour elle-même (72)',
    prefixes: ['71', '72'],
    balances,
    mode: 'credit_minus_debit'
  });

  const productionExerciceAmount = round2(productionVendue.amount + productionStockeeImmobilisee.amount);
  const chiffreAffairesTotal = round2(ventesMarchandises.amount + productionVendue.amount);

  // E. Consommation en provenance des tiers (601-606, 61, 62)
  const consommationsTiers = aggregateItem({
    id: 'consommations_tiers',
    label: 'Consommations de l’exercice en provenance des tiers',
    ruleDescription: 'Achats stockés de matières (601, 602), autres achats et charges externes (604, 605, 606, 61, 62)',
    prefixes: ['601', '602', '604', '605', '606', '61', '62'],
    excludePrefixes: isSyscohada ? ['601'] : [],
    balances,
    mode: 'debit_minus_credit'
  });

  // Valeur Ajoutée (VA)
  const valeurAjouteeAmount = round2((margeCommercialeAmount + productionExerciceAmount) - consommationsTiers.amount);

  // F. Subventions d'exploitation (74)
  const subventionsExploitation = aggregateItem({
    id: 'subventions_exploitation',
    label: 'Subventions d’exploitation',
    ruleDescription: 'Aides et subventions d’exploitation accordées à l’entreprise (Compte 74)',
    prefixes: isSyscohada ? ['71'] : ['74'],
    balances,
    mode: 'credit_minus_debit'
  });

  // G. Impôts, taxes et versements assimilés (63)
  const impotsTaxes = aggregateItem({
    id: 'impots_taxes',
    label: 'Impôts, taxes et versements assimilés',
    ruleDescription: 'Impôts et taxes d’exploitation (Compte 63 - CFE, CVAE, taxes diverses)',
    prefixes: isSyscohada ? ['64'] : ['63'],
    balances,
    mode: 'debit_minus_credit'
  });

  // H. Charges de personnel (64)
  const chargesPersonnel = aggregateItem({
    id: 'charges_personnel',
    label: 'Charges de personnel (Salaires & Cotisations)',
    ruleDescription: 'Rémunérations du personnel et charges sociales patronales (Comptes 64 ou 66 en SYSCOHADA)',
    prefixes: isSyscohada ? ['66'] : ['64'],
    balances,
    mode: 'debit_minus_credit'
  });

  // Excédent Brut d'Exploitation (EBE)
  const ebeAmount = round2(valeurAjouteeAmount + subventionsExploitation.amount - impotsTaxes.amount - chargesPersonnel.amount);

  // I. Autres produits & charges d'exploitation, reprises et dotations (65, 75, 681, 781, 791)
  const autresProduitsExploitation = aggregateItem({
    id: 'autres_produits_expl',
    label: 'Autres produits d’exploitation, reprises & transferts',
    ruleDescription: 'Redevances, gains de gestion courante (75), reprises sur provisions (781) et transferts de charges (791)',
    prefixes: ['75', '781', '791'],
    balances,
    mode: 'credit_minus_debit'
  });

  const autresChargesExploitation = aggregateItem({
    id: 'autres_charges_expl',
    label: 'Autres charges de gestion courante',
    ruleDescription: 'Pertes sur créances, redevances, quotes-parts (Compte 65)',
    prefixes: ['65'],
    balances,
    mode: 'debit_minus_credit'
  });

  const dotationsAmortissements = aggregateItem({
    id: 'dotations_amortissements',
    label: 'Dotations aux amortissements et provisions d’exploitation',
    ruleDescription: 'Dépréciations et amortissements de l’actif d’exploitation (Comptes 681)',
    prefixes: isSyscohada ? ['681', '687'] : ['681'],
    balances,
    mode: 'debit_minus_credit'
  });

  // Résultat d'Exploitation (REX)
  const rexAmount = round2(
    ebeAmount + autresProduitsExploitation.amount - autresChargesExploitation.amount - dotationsAmortissements.amount
  );

  // J. Volet Financier (76, 786, 796 vs 66, 686)
  const produitsFinanciers = aggregateItem({
    id: 'produits_financiers',
    label: 'Produits financiers',
    ruleDescription: 'Intérêts, dividendes reçus, gains de change et reprises financières (Comptes 76, 786, 796)',
    prefixes: isSyscohada ? ['77'] : ['76', '786', '796'],
    balances,
    mode: 'credit_minus_debit'
  });

  const chargesFinancieres = aggregateItem({
    id: 'charges_financieres',
    label: 'Charges financières & intérêts',
    ruleDescription: 'Intérêts des emprunts, pertes de change et dotations financières (Comptes 66, 686)',
    prefixes: isSyscohada ? ['67'] : ['66', '686'],
    balances,
    mode: 'debit_minus_credit'
  });

  const resultatFinancierAmount = round2(produitsFinanciers.amount - chargesFinancieres.amount);

  // Résultat Courant Avant Impôt (RCAI)
  const rcaiAmount = round2(rexAmount + resultatFinancierAmount);

  // K. Volet Exceptionnel / HAO (67, 77 ou 81-88)
  const produitsExceptionnels = aggregateItem({
    id: 'produits_exceptionnels',
    label: isSyscohada ? 'Produits Hors Activités Ordinaires (HAO)' : 'Produits exceptionnels',
    ruleDescription: isSyscohada ? 'Produits HAO et cessions d’actifs (Comptes 84, 86, 88)' : 'Produits sur opérations de gestion/capital et reprises exceptionnelles (77, 787, 797)',
    prefixes: isSyscohada ? ['84', '86', '88'] : ['77', '787', '797'],
    balances,
    mode: 'credit_minus_debit'
  });

  const chargesExceptionnelles = aggregateItem({
    id: 'charges_exceptionnelles',
    label: isSyscohada ? 'Charges Hors Activités Ordinaires (HAO)' : 'Charges exceptionnelles',
    ruleDescription: isSyscohada ? 'Charges HAO, valeurs comptables d’actifs cédés (Comptes 81, 83, 85)' : 'Pénalités, rappels d’impôts, VNC des actifs cédés (67, 687)',
    prefixes: isSyscohada ? ['81', '83', '85'] : ['67', '687'],
    balances,
    mode: 'debit_minus_credit'
  });

  const resultatExceptionnelAmount = round2(produitsExceptionnels.amount - chargesExceptionnelles.amount);

  // L. Impôts sur les bénéfices & Participation (69)
  const impotsBenefices = aggregateItem({
    id: 'impots_benefices',
    label: 'Impôt sur les sociétés & Participation',
    ruleDescription: 'Impôt sur les bénéfices (695) et participation des salariés (691)',
    prefixes: isSyscohada ? ['89'] : ['69'],
    balances,
    mode: 'debit_minus_credit'
  });

  // Résultat Net
  const resultatNetAmount = round2(rcaiAmount + resultatExceptionnelAmount - impotsBenefices.amount);

  const sigReport = {
    chiffreAffairesTotal,
    margeCommerciale: {
      amount: margeCommercialeAmount,
      taux: ventesMarchandises.amount > 0 ? round2((margeCommercialeAmount / ventesMarchandises.amount) * 100) : 0,
      ventes: ventesMarchandises,
      achats: achatsMarchandises
    },
    productionExercice: {
      amount: productionExerciceAmount,
      productionVendue,
      productionStockeeImmobilisee
    },
    valeurAjoutee: {
      amount: valeurAjouteeAmount,
      tauxVA: chiffreAffairesTotal > 0 ? round2((valeurAjouteeAmount / chiffreAffairesTotal) * 100) : 0,
      consommationsTiers
    },
    ebe: {
      amount: ebeAmount,
      tauxEBE: chiffreAffairesTotal > 0 ? round2((ebeAmount / chiffreAffairesTotal) * 100) : 0,
      subventionsExploitation,
      impotsTaxes,
      chargesPersonnel
    },
    rex: {
      amount: rexAmount,
      tauxREX: chiffreAffairesTotal > 0 ? round2((rexAmount / chiffreAffairesTotal) * 100) : 0,
      autresProduitsExploitation,
      autresChargesExploitation,
      dotationsAmortissements
    },
    rcai: {
      amount: rcaiAmount,
      produitsFinanciers,
      chargesFinancieres,
      resultatFinancierAmount
    },
    resultatExceptionnel: {
      amount: resultatExceptionnelAmount,
      produitsExceptionnels,
      chargesExceptionnelles
    },
    resultatNet: {
      amount: resultatNetAmount,
      tauxMargeNette: chiffreAffairesTotal > 0 ? round2((resultatNetAmount / chiffreAffairesTotal) * 100) : 0,
      impotsBenefices
    }
  };

  /* ------------------------------------------------------------------------ */
  /* 2. Bilan Comptable Normalisé                                             */
  /* ------------------------------------------------------------------------ */

  // Actif Immobilisé
  const immosIncorporelles = aggregateItem({
    id: 'immos_incorporelles',
    label: 'Immobilisations incorporelles',
    ruleDescription: 'Frais d’établissement, logiciels, brevets, fonds commercial (Comptes 20)',
    prefixes: ['20'],
    balances,
    mode: 'solde_debiteur'
  });

  const immosCorporelles = aggregateItem({
    id: 'immos_corporelles',
    label: 'Immobilisations corporelles',
    ruleDescription: 'Terrains, constructions, matériel industriel, matériel de transport et mobilier (Comptes 21, 22, 23)',
    prefixes: ['21', '22', '23'],
    balances,
    mode: 'solde_debiteur'
  });

  const immosFinancieres = aggregateItem({
    id: 'immos_financieres',
    label: 'Immobilisations financières',
    ruleDescription: 'Titres de participation, dépôts et cautionnements, prêts (Comptes 26, 27)',
    prefixes: ['26', '27'],
    balances,
    mode: 'solde_debiteur'
  });

  const amortissementsImmos = aggregateItem({
    id: 'amortissements_immos',
    label: 'Amortissements & Dépréciations de l’actif immobilisé',
    ruleDescription: 'Amortissements cumulés (28) et dépréciations d’immobilisations (29)',
    prefixes: ['28', '29'],
    balances,
    mode: 'solde_crediteur'
  });

  const actifImmobiliseBrut = round2(immosIncorporelles.amount + immosCorporelles.amount + immosFinancieres.amount);
  const actifImmobiliseNet = round2(actifImmobiliseBrut - amortissementsImmos.amount);

  // Actif Circulant
  const stocks = aggregateItem({
    id: 'stocks',
    label: 'Stocks & En-cours',
    ruleDescription: 'Matières premières, encours de production, produits finis et marchandises (Classe 3)',
    prefixes: ['3'],
    excludePrefixes: ['39'],
    balances,
    mode: 'solde_debiteur'
  });

  const depreciationsStocks = aggregateItem({
    id: 'depreciations_stocks',
    label: 'Dépréciations des stocks',
    ruleDescription: 'Provisions et dépréciations constatées sur les stocks (Compte 39)',
    prefixes: ['39'],
    balances,
    mode: 'solde_crediteur'
  });
  const stocksNet = round2(stocks.amount - depreciationsStocks.amount);

  const creancesClients = aggregateItem({
    id: 'creances_clients',
    label: 'Créances clients & comptes rattachés',
    ruleDescription: 'Clients ordinaires, créances douteuses, factures à établir (Comptes 411, 413, 416, 418)',
    prefixes: ['411', '413', '416', '418'],
    balances,
    mode: 'solde_debiteur'
  });

  const depreciationsClients = aggregateItem({
    id: 'depreciations_clients',
    label: 'Dépréciations des créances clients',
    ruleDescription: 'Provisions pour dépréciation des comptes clients (Compte 491)',
    prefixes: ['491'],
    balances,
    mode: 'solde_crediteur'
  });
  const creancesClientsNet = round2(creancesClients.amount - depreciationsClients.amount);

  const autresCreances = aggregateItem({
    id: 'autres_creances',
    label: 'Autres créances & acomptes versés',
    ruleDescription: 'Fournisseurs débiteurs (409), TVA déductible et crédits d’impôt (4456, 444), créances diverses (467), charges constatées d’avance (486)',
    prefixes: ['409', '425', '4387', '4456', '4458', '444', '467', '486'],
    balances,
    mode: 'solde_debiteur'
  });

  const tresorerieActive = aggregateItem({
    id: 'tresorerie_active',
    label: 'Disponibilités & Valeurs mobilières de placement',
    ruleDescription: 'Comptes bancaires positifs (512), caisse (53), VMP (50)',
    prefixes: ['50', '512', '514', '53', '58'],
    balances,
    mode: 'solde_debiteur'
  });

  const totalActifNet = round2(actifImmobiliseNet + stocksNet + creancesClientsNet + autresCreances.amount + tresorerieActive.amount);

  // Passif
  const capitalSocial = aggregateItem({
    id: 'capital_social',
    label: 'Capital social ou individuel',
    ruleDescription: 'Capital social souscrit, appelé ou versé (Compte 101/103)',
    prefixes: ['101', '102', '103'],
    balances,
    mode: 'solde_crediteur'
  });

  const primesReserves = aggregateItem({
    id: 'primes_reserves',
    label: 'Primes d’émission, réserves et écarts',
    ruleDescription: 'Primes d’apport/fusion (104), réserves légales, statutaires et réglementées (106), écarts de réévaluation (105)',
    prefixes: ['104', '105', '106', '108'],
    balances,
    mode: 'solde_crediteur'
  });

  const reportANouveau = aggregateItem({
    id: 'report_a_nouveau',
    label: 'Report à nouveau (créditeur ou débiteur)',
    ruleDescription: 'Bénéfices ou pertes des exercices antérieurs non distribués (Comptes 110, 119)',
    prefixes: ['110', '119', '11'],
    balances,
    mode: 'credit_minus_debit'
  });

  const provisionsReglementeesSubventions = aggregateItem({
    id: 'provisions_subventions',
    label: 'Subventions d’investissement & Provisions réglementées',
    ruleDescription: 'Subventions d’investissement (13), provisions réglementées et fonds bloqués (14, 15)',
    prefixes: ['13', '14', '15', '18'],
    balances,
    mode: 'solde_crediteur'
  });

  const totalCapitauxPropresHorsResultat = round2(
    capitalSocial.amount + primesReserves.amount + reportANouveau.amount + provisionsReglementeesSubventions.amount
  );

  const totalCapitauxPropres = round2(totalCapitauxPropresHorsResultat + resultatNetAmount);

  const capitauxPropres = {
    id: 'capitaux_propres',
    label: 'Capitaux Propres',
    amount: totalCapitauxPropres,
    total: totalCapitauxPropres,
    capitalSocial,
    primesReserves,
    reportANouveau,
    provisionsReglementeesSubventions,
    resultatNetExercice: resultatNetAmount
  };

  const dettesFinancieresStables = aggregateItem({
    id: 'dettes_financieres_stables',
    label: 'Emprunts & Dettes financières à long/moyen terme',
    ruleDescription: 'Emprunts bancaires, obligations et dettes assimilées (Comptes 16, 17)',
    prefixes: ['16', '17'],
    balances,
    mode: 'solde_crediteur'
  });

  const dettesFournisseurs = aggregateItem({
    id: 'dettes_fournisseurs',
    label: 'Dettes fournisseurs & comptes rattachés',
    ruleDescription: 'Fournisseurs ordinaires, effets à payer, factures non parvenues (Comptes 401, 403, 408)',
    prefixes: ['401', '403', '408'],
    balances,
    mode: 'solde_crediteur'
  });

  const dettesFiscalesSociales = aggregateItem({
    id: 'dettes_fiscales_sociales',
    label: 'Dettes fiscales & sociales',
    ruleDescription: 'Rémunérations dues (421, 428), cotisations sociales (43), TVA due (4455, 4457), impôt sur les sociétés (444)',
    prefixes: ['421', '428', '431', '437', '438', '444', '4455', '4457', '447', '448'],
    balances,
    mode: 'solde_crediteur'
  });

  const chargesConstateesAvance = aggregateItem({
    id: 'charges_constatees_avance',
    label: 'Charges constatées d’avance',
    ruleDescription: 'Charges enregistrées durant l’exercice mais concernant l’exercice suivant (Compte 486)',
    prefixes: ['486'],
    balances,
    mode: 'solde_debiteur'
  });

  const produitsConstatesAvance = aggregateItem({
    id: 'produits_constates_avance',
    label: 'Produits constatés d’avance',
    ruleDescription: 'Produits comptabilisés durant l’exercice mais concernant l’exercice suivant (Compte 487)',
    prefixes: ['487'],
    balances,
    mode: 'solde_crediteur'
  });

  const autresDettesPassif = aggregateItem({
    id: 'autres_dettes_passif',
    label: 'Autres dettes (Clients créditeurs, Associés, Divers)',
    ruleDescription: 'Clients créditeurs / acomptes reçus (419), comptes courants associés (455), créditeurs divers (467)',
    prefixes: ['419', '455', '467'],
    balances,
    mode: 'solde_crediteur'
  });

  const tresoreriePassive = aggregateItem({
    id: 'tresorerie_passive',
    label: 'Concours bancaires courants & Découverts',
    ruleDescription: 'Découverts bancaires autorisés et soldes créditeurs des comptes financiers (Comptes 512, 514, 519, 5186)',
    prefixes: ['512', '514', '519', '5186'],
    balances,
    mode: 'solde_crediteur'
  });

  const totalDettes = round2(
    dettesFinancieresStables.amount + dettesFournisseurs.amount + dettesFiscalesSociales.amount + autresDettesPassif.amount + produitsConstatesAvance.amount + tresoreriePassive.amount
  );

  const totalPassif = round2(totalCapitauxPropres + totalDettes);

  const equilibreBilanEcart = round2(totalActifNet - totalPassif);

  const bilanReport = {
    actif: {
      totalNet: totalActifNet,
      totalBrut: round2(actifImmobiliseBrut + stocks.amount + creancesClients.amount + autresCreances.amount + tresorerieActive.amount),
      totalAmortissements: round2(amortissementsImmos.amount + depreciationsStocks.amount + depreciationsClients.amount),
      actifImmobilise: {
        totalNet: actifImmobiliseNet,
        brut: actifImmobiliseBrut,
        amortissements: amortissementsImmos,
        incorporelles: immosIncorporelles,
        corporelles: immosCorporelles,
        financieres: immosFinancieres
      },
      actifCirculant: {
        totalNet: round2(stocksNet + creancesClientsNet + autresCreances.amount + tresorerieActive.amount),
        totalBrut: round2(stocks.amount + creancesClients.amount + autresCreances.amount + tresorerieActive.amount),
        totalDepreciations: round2(depreciationsStocks.amount + depreciationsClients.amount),
        stocks: { totalNet: stocksNet, brut: stocks, depreciations: depreciationsStocks },
        creancesClients: { totalNet: creancesClientsNet, brut: creancesClients, depreciations: depreciationsClients },
        autresCreances,
        chargesConstateesAvance,
        tresorerieActive
      }
    },
    passif: {
      total: totalPassif,
      capitauxPropres,
      dettes: {
        total: totalDettes,
        financieres: dettesFinancieresStables,
        fournisseurs: dettesFournisseurs,
        fiscalesSociales: dettesFiscalesSociales,
        autresDettes: autresDettesPassif,
        produitsConstatesAvance,
        tresoreriePassive
      },
      dettesFinancieresStables,
      dettesExploitation: {
        total: round2(dettesFournisseurs.amount + dettesFiscalesSociales.amount),
        fournisseurs: dettesFournisseurs,
        fiscalesSociales: dettesFiscalesSociales
      },
      autresDettesPassif,
      produitsConstatesAvance,
      tresoreriePassive
    },
    isBalanced: Math.abs(equilibreBilanEcart) < 0.05,
    ecart: equilibreBilanEcart
  };

  /* ------------------------------------------------------------------------ */
  /* 2.bis Compte de Résultat Officiel (Charges vs Produits)                 */
  /* ------------------------------------------------------------------------ */

  const chargesExploitationTotal = round2(
    achatsMarchandises.amount +
    consommationsTiers.amount +
    impotsTaxes.amount +
    chargesPersonnel.amount +
    autresChargesExploitation.amount +
    dotationsAmortissements.amount
  );

  const produitsExploitationTotal = round2(
    ventesMarchandises.amount +
    productionVendue.amount +
    productionStockeeImmobilisee.amount +
    subventionsExploitation.amount +
    autresProduitsExploitation.amount
  );

  const totalCharges = round2(
    chargesExploitationTotal +
    chargesFinancieres.amount +
    chargesExceptionnelles.amount +
    impotsBenefices.amount
  );

  const totalProduits = round2(
    produitsExploitationTotal +
    produitsFinanciers.amount +
    produitsExceptionnels.amount
  );

  const compteResultatReport = {
    charges: {
      exploitation: {
        total: chargesExploitationTotal,
        achatsMarchandises,
        consommationsTiers,
        impotsTaxes,
        chargesPersonnel,
        autresChargesExploitation,
        dotationsAmortissements
      },
      financieres: {
        total: chargesFinancieres.amount,
        chargesFinancieres
      },
      exceptionnelles: {
        total: chargesExceptionnelles.amount,
        chargesExceptionnelles
      },
      impots: {
        total: impotsBenefices.amount,
        impotsBenefices
      },
      total: totalCharges
    },
    produits: {
      exploitation: {
        total: produitsExploitationTotal,
        ventesMarchandises,
        productionVendue,
        productionStockeeImmobilisee,
        subventionsExploitation,
        autresProduitsExploitation
      },
      financiers: {
        total: produitsFinanciers.amount,
        produitsFinanciers
      },
      exceptionnels: {
        total: produitsExceptionnels.amount,
        produitsExceptionnels
      },
      total: totalProduits
    },
    totalCharges,
    totalProduits,
    resultatNet: resultatNetAmount,
    isBenefice: resultatNetAmount >= 0,
    solde: Math.abs(resultatNetAmount)
  };

  /* ------------------------------------------------------------------------ */
  /* 3. Bilan Fonctionnel & Ratios Financiers (FRNG, BFR, TN)                 */
  /* ------------------------------------------------------------------------ */

  // Emplois Stables = Actif Brut Immobilisé
  const emploisStablesAmount = actifImmobiliseBrut;

  // Ressources Stables = Capitaux Propres + Amortissements d'actif + Dettes Financières
  const ressourcesStablesAmount = round2(totalCapitauxPropres + amortissementsImmos.amount + depreciationsStocks.amount + depreciationsClients.amount + dettesFinancieresStables.amount);

  // FRNG (Fonds de Roulement Net Global)
  const frngAmount = round2(ressourcesStablesAmount - emploisStablesAmount);

  // Actif Circulant d'Exploitation (ACE)
  const aceAmount = round2(stocks.amount + creancesClients.amount);

  // Passif Circulant d'Exploitation (PCE)
  const pceAmount = round2(dettesFournisseurs.amount + dettesFiscalesSociales.amount);

  // BFR Exploitation (BFRE)
  const bfreAmount = round2(aceAmount - pceAmount);

  // Actif Circulant Hors Exploitation (ACHE)
  const acheAmount = autresCreances.amount;

  // Passif Circulant Hors Exploitation (PCHE)
  const pcheAmount = autresDettesPassif.amount;

  // BFR Hors Exploitation (BFRHE)
  const bfrheAmount = round2(acheAmount - pcheAmount);

  // BFR Global
  const bfrTotalAmount = round2(bfreAmount + bfrheAmount);

  // Trésorerie Nette (TN)
  const tresorerieActiveAmount = tresorerieActive.amount;
  const tresoreriePassiveAmount = tresoreriePassive.amount;
  const tnDirecte = round2(tresorerieActiveAmount - tresoreriePassiveAmount);
  const tnParFrng = round2(frngAmount - bfrTotalAmount);

  const bilanFonctionnel = {
    emploisStables: {
      amount: emploisStablesAmount,
      ruleDescription: 'Valeur brute des immobilisations incorporelles, corporelles et financières',
      items: [immosIncorporelles, immosCorporelles, immosFinancieres]
    },
    ressourcesStables: {
      amount: ressourcesStablesAmount,
      ruleDescription: 'Capitaux propres + Amortissements & provisions cumulés + Dettes financières à moyen/long terme',
      items: [capitauxPropres, amortissementsImmos, dettesFinancieresStables]
    },
    frng: {
      amount: frngAmount,
      formula: 'Ressources Stables - Emplois Stables',
      interpretation: frngAmount >= 0 
        ? 'Fonds de roulement positif : les capitaux stables financent intégralement les investissements durables et dégagent un excédent.' 
        : 'Fonds de roulement négatif : les investissements durables ne sont pas entièrement couverts par les ressources stables.'
    },
    bfrExploitation: {
      amount: bfreAmount,
      ace: { amount: aceAmount, items: [stocks, creancesClients] },
      pce: { amount: pceAmount, items: [dettesFournisseurs, dettesFiscalesSociales] },
      formula: 'Actif Circulant d’Exploitation (Stocks + Créances clients) - Passif Circulant d’Exploitation (Fournisseurs + Fiscal/Social)'
    },
    bfrHorsExploitation: {
      amount: bfrheAmount,
      ache: { amount: acheAmount, items: [autresCreances] },
      pche: { amount: pcheAmount, items: [autresDettesPassif] },
      formula: 'Actif Circulant Hors Exploitation - Passif Circulant Hors Exploitation'
    },
    bfrTotal: {
      amount: bfrTotalAmount,
      formula: 'BFR Exploitation + BFR Hors Exploitation',
      interpretation: bfrTotalAmount >= 0
        ? 'Le cycle d’exploitation nécessite un financement net en fonds de roulement.'
        : 'Ressource en fonds de roulement : le crédit accordé par les fournisseurs dépasse les stocks et crédits clients.'
    },
    tresorerieNette: {
      amount: tnDirecte,
      tnParFrng,
      tresorerieActive: tresorerieActiveAmount,
      tresoreriePassive: tresoreriePassiveAmount,
      isCoherent: Math.abs(tnDirecte - tnParFrng) < 0.1,
      formula: 'FRNG - BFR = Trésorerie Active - Trésorerie Passive',
      interpretation: tnDirecte >= 0
        ? 'Trésorerie nette excédentaire : la société dispose de liquidités immédiates sans recourir aux découverts.'
        : 'Trésorerie nette négative : le fonds de roulement est insuffisant pour financer le BFR, comblé par des découverts bancaires.'
    }
  };

  return {
    planCode,
    isSyscohada,
    balances,
    sig: sigReport,
    compteResultat: compteResultatReport,
    bilan: bilanReport,
    bilanFonctionnel
  };
}
