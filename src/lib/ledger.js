import { round2 } from '@/lib/accounting';

const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const compareText = (left = '', right = '') => String(left).localeCompare(String(right), 'fr');

export const LEDGER_ROOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function isValidLedgerRange({ mode, from, to }) {
  if (mode === 'root') {
    return /^[1-9]$/.test(from) && /^[1-9]$/.test(to) && from <= to;
  }
  return /^\d{3,10}$/.test(from) && /^\d{3,10}$/.test(to) && from.padEnd(10, '0') <= to.padEnd(10, '9');
}

/** Filtre les comptes par racine (classe) ou par intervalle de préfixes de compte. */
export function accountsInLedgerRange(accounts = [], range) {
  if (!isValidLedgerRange(range)) return [];
  if (range.mode === 'root') {
    return accounts.filter((account) => account.code[0] >= range.from && account.code[0] <= range.to);
  }
  const from = range.from.padEnd(10, '0');
  const to = range.to.padEnd(10, '9');
  return accounts.filter((account) => {
    const code = account.code.padEnd(10, '0');
    return code >= from && code <= to;
  });
}

/** Plan de comptes : table des comptes complétée par les comptes présents dans les écritures. */
export function buildLedgerAccounts(accounts = [], entries = []) {
  const byCode = new Map();
  for (const account of accounts) {
    if (!account?.code || account.is_active === false) continue;
    byCode.set(String(account.code), { code: String(account.code), label: account.label || '' });
  }
  for (const entry of entries) {
    const code = String(entry.account_code || '').trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, { code, label: entry.account_label || 'Compte inconnu' });
  }
  return [...byCode.values()].sort((left, right) => compareText(left.code, right.code));
}

const sortEntries = (entries) => [...entries].sort((left, right) => (
  compareText(left.date, right.date)
  || compareText(left.entry_number, right.entry_number)
  || compareText(left.created_at, right.created_at)
));

/** Grand livre : solde antérieur, mouvements et solde progressif par compte (débit - crédit). */
export function generalLedgerByAccounts(entries = [], accountCodes = [], from, to) {
  const selected = new Set(accountCodes);
  const state = new Map(accountCodes.map((code) => [code, { rows: [], balance: 0, openingBalance: 0 }]));

  for (const entry of sortEntries(entries)) {
    if (!selected.has(entry.account_code) || (to && entry.date > to)) continue;
    const account = state.get(entry.account_code);
    account.balance = round2(account.balance + toNumber(entry.debit) - toNumber(entry.credit));
    if (from && entry.date < from) {
      account.openingBalance = account.balance;
      continue;
    }
    account.rows.push({
      id: entry.id,
      date: entry.date,
      journal: entry.journal,
      number: entry.entry_number || entry.reference || '',
      label: entry.label || '',
      thirdParty: entry.third_party_name || '',
      lettering: entry.lettering || '',
      debit: round2(toNumber(entry.debit)),
      credit: round2(toNumber(entry.credit)),
      balance: account.balance,
    });
  }

  return accountCodes.map((accountCode) => {
    const account = state.get(accountCode);
    return {
      accountCode,
      rows: account.rows,
      openingBalance: account.openingBalance,
      closingBalance: account.balance,
    };
  });
}

/** Balance générale : solde initial, mouvements de la période et solde final par compte. */
export function trialBalance(entries = [], accounts = [], from, to) {
  const labels = new Map(accounts.map((account) => [account.code, account.label]));
  const totals = new Map();

  for (const entry of entries) {
    if (to && entry.date > to) continue;
    const code = entry.account_code;
    const current = totals.get(code) || { openingBalance: 0, debit: 0, credit: 0 };
    const debit = toNumber(entry.debit);
    const credit = toNumber(entry.credit);
    if (from && entry.date < from) {
      current.openingBalance += debit - credit;
    } else {
      current.debit += debit;
      current.credit += credit;
    }
    totals.set(code, current);
  }

  const rows = [...totals.entries()]
    .map(([code, value]) => {
      const openingBalance = round2(value.openingBalance);
      const debit = round2(value.debit);
      const credit = round2(value.credit);
      return {
        code,
        label: labels.get(code) || 'Compte inconnu',
        openingBalance,
        debit,
        credit,
        closingBalance: round2(openingBalance + debit - credit),
      };
    })
    .sort((left, right) => compareText(left.code, right.code));

  return rows;
}

export function trialBalanceTotals(rows = []) {
  const sum = (pick) => round2(rows.reduce((total, row) => total + pick(row), 0));
  return {
    openingDebit: sum((row) => Math.max(row.openingBalance, 0)),
    openingCredit: sum((row) => Math.max(-row.openingBalance, 0)),
    debit: sum((row) => row.debit),
    credit: sum((row) => row.credit),
    closingDebit: sum((row) => Math.max(row.closingBalance, 0)),
    closingCredit: sum((row) => Math.max(-row.closingBalance, 0)),
  };
}
