/**
 * Fichier des Écritures Comptables (FEC) — article A47 A-1 du LPF.
 * Génération et contrôles de cohérence. Fonctions pures.
 */

import { journalLabel, round2 } from './accounting';

export const FEC_COLUMNS = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise'
];

const SEPARATOR = '\t';

/** Date au format AAAAMMJJ exigé par la norme. */
export function fecDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}${month}${day}`;
}

/** Montant à deux décimales, séparateur virgule. */
export function fecAmount(value) {
  return round2(value).toFixed(2).replace('.', ',');
}

/** Les séparateurs et retours à la ligne casseraient la structure du fichier. */
export function sanitize(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n|]+/g, ' ').trim();
}

/**
 * Construit les lignes FEC à partir des écritures.
 * `thirdParties` sert à résoudre le compte auxiliaire (code métier, pas UUID).
 */
export function buildFecRows(entries = [], options = {}) {
  const { thirdParties = [] } = options;
  const thirdPartyById = new Map(thirdParties.map((party) => [party.id, party]));

  return [...entries]
    .sort((a, b) => {
      const byDate = String(a.date).localeCompare(String(b.date));
      if (byDate !== 0) return byDate;
      return String(a.entry_number || '').localeCompare(String(b.entry_number || ''));
    })
    .map((entry) => {
      const party = entry.third_party_id ? thirdPartyById.get(entry.third_party_id) : null;
      const auxNum = party?.code || (party ? party.account_code : '') || '';
      const auxLabel = party?.name || entry.third_party_name || '';

      return {
        JournalCode: sanitize(entry.journal || 'OD'),
        JournalLib: sanitize(journalLabel(entry.journal)),
        EcritureNum: sanitize(entry.entry_number || ''),
        EcritureDate: fecDate(entry.date),
        CompteNum: sanitize(entry.account_code || ''),
        CompteLib: sanitize(entry.account_label || ''),
        // Le compte auxiliaire n'est renseigné que s'il existe réellement.
        CompAuxNum: sanitize(auxNum),
        CompAuxLib: sanitize(auxNum ? auxLabel : ''),
        PieceRef: sanitize(entry.reference || entry.entry_number || ''),
        PieceDate: fecDate(entry.piece_date || entry.date),
        EcritureLib: sanitize(entry.label || ''),
        Debit: fecAmount(entry.debit),
        Credit: fecAmount(entry.credit),
        EcritureLet: sanitize(entry.lettering || ''),
        DateLet: entry.lettering ? fecDate(entry.lettered_at || entry.updated_at) : '',
        ValidDate: entry.is_validated ? fecDate(entry.validated_at || entry.updated_at || entry.date) : '',
        Montantdevise: '',
        Idevise: ''
      };
    });
}

/** Sérialise les lignes au format texte tabulé attendu par l'administration. */
export function serializeFec(rows = []) {
  const header = FEC_COLUMNS.join(SEPARATOR);
  const body = rows.map((row) => FEC_COLUMNS.map((column) => row[column] ?? '').join(SEPARATOR));
  return [header, ...body].join('\r\n');
}

/** Nom de fichier normalisé : SIRENFECAAAAMMJJ.txt (clôture de l'exercice). */
export function fecFileName(siren, closingDate) {
  const cleanSiren = (siren || '').replace(/\D/g, '').padEnd(9, '0').slice(0, 9);
  return `${cleanSiren}FEC${fecDate(closingDate)}.txt`;
}

const issue = (severity, code, message, count = 1, sample = null) => ({
  severity,
  code,
  message,
  count,
  sample
});

/**
 * Contrôles de cohérence avant export.
 * `error` bloque l'export, `warning` signale un risque de rejet.
 */
export function validateFec(entries = [], options = {}) {
  const { year, requireValidated = true } = options;
  const issues = [];

  if (entries.length === 0) {
    return {
      isValid: false,
      issues: [issue('error', 'EMPTY', 'Aucune écriture sur la période sélectionnée.', 0)],
      totals: { debit: 0, credit: 0, balance: 0, count: 0 }
    };
  }

  const totalDebit = round2(entries.reduce((total, entry) => total + Number(entry.debit || 0), 0));
  const totalCredit = round2(entries.reduce((total, entry) => total + Number(entry.credit || 0), 0));

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    issues.push(
      issue(
        'error',
        'UNBALANCED_TOTAL',
        `Le fichier est déséquilibré : ${totalDebit.toFixed(2)} € au débit contre ${totalCredit.toFixed(2)} € au crédit.`
      )
    );
  }

  const vouchers = new Map();
  const missingNumber = [];
  const missingAccount = [];
  const missingLabel = [];
  const invalidDate = [];
  const outOfYear = [];
  const bothSides = [];
  const zeroAmount = [];
  const notValidated = [];

  entries.forEach((entry) => {
    const number = entry.entry_number;
    if (!number) missingNumber.push(entry);
    else {
      if (!vouchers.has(number)) vouchers.set(number, { debit: 0, credit: 0 });
      const voucher = vouchers.get(number);
      voucher.debit += Number(entry.debit || 0);
      voucher.credit += Number(entry.credit || 0);
    }

    if (!entry.account_code) missingAccount.push(entry);
    if (!entry.label) missingLabel.push(entry);

    const date = entry.date ? new Date(entry.date) : null;
    if (!date || Number.isNaN(date.getTime())) invalidDate.push(entry);
    else if (year && date.getFullYear() !== Number(year)) outOfYear.push(entry);

    const debit = Number(entry.debit || 0);
    const credit = Number(entry.credit || 0);
    if (debit > 0 && credit > 0) bothSides.push(entry);
    if (debit === 0 && credit === 0) zeroAmount.push(entry);

    if (requireValidated && !entry.is_validated) notValidated.push(entry);
  });

  const unbalancedVouchers = Array.from(vouchers.entries()).filter(
    ([, voucher]) => Math.abs(round2(voucher.debit) - round2(voucher.credit)) > 0.01
  );

  const push = (list, severity, code, message) => {
    if (list.length > 0) {
      issues.push(issue(severity, code, message(list.length), list.length, list[0]));
    }
  };

  push(missingNumber, 'error', 'MISSING_ENTRY_NUMBER', (n) => `${n} écriture(s) sans numéro de pièce.`);
  push(missingAccount, 'error', 'MISSING_ACCOUNT', (n) => `${n} écriture(s) sans compte comptable.`);
  push(invalidDate, 'error', 'INVALID_DATE', (n) => `${n} écriture(s) avec une date invalide.`);
  push(bothSides, 'error', 'BOTH_SIDES', (n) => `${n} écriture(s) avec un débit et un crédit simultanés.`);
  push(zeroAmount, 'error', 'ZERO_AMOUNT', (n) => `${n} écriture(s) à montant nul.`);
  push(missingLabel, 'warning', 'MISSING_LABEL', (n) => `${n} écriture(s) sans libellé.`);
  push(outOfYear, 'warning', 'OUT_OF_YEAR', (n) => `${n} écriture(s) hors de l'exercice ${year}.`);
  push(notValidated, 'warning', 'NOT_VALIDATED', (n) => `${n} écriture(s) non validées seront exportées.`);

  if (unbalancedVouchers.length > 0) {
    issues.push(
      issue(
        'error',
        'UNBALANCED_VOUCHER',
        `${unbalancedVouchers.length} pièce(s) déséquilibrée(s) : ${unbalancedVouchers
          .slice(0, 3)
          .map(([number]) => number)
          .join(', ')}${unbalancedVouchers.length > 3 ? '…' : ''}.`,
        unbalancedVouchers.length
      )
    );
  }

  const letteringBalances = new Map();
  entries.forEach((entry) => {
    if (!entry.lettering) return;
    if (!letteringBalances.has(entry.lettering)) {
      letteringBalances.set(entry.lettering, { debit: 0, credit: 0 });
    }
    const group = letteringBalances.get(entry.lettering);
    group.debit += Number(entry.debit || 0);
    group.credit += Number(entry.credit || 0);
  });

  const unbalancedLettering = Array.from(letteringBalances.entries()).filter(
    ([, group]) => Math.abs(round2(group.debit) - round2(group.credit)) > 0.01
  );

  if (unbalancedLettering.length > 0) {
    issues.push(
      issue(
        'warning',
        'UNBALANCED_LETTERING',
        `${unbalancedLettering.length} code(s) de lettrage déséquilibré(s) : ${unbalancedLettering
          .slice(0, 3)
          .map(([code]) => code)
          .join(', ')}.`,
        unbalancedLettering.length
      )
    );
  }

  return {
    isValid: issues.every((item) => item.severity !== 'error'),
    issues,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      balance: round2(totalDebit - totalCredit),
      count: entries.length,
      vouchers: vouchers.size
    }
  };
}
