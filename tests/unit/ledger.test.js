import { describe, expect, it } from 'vitest';
import {
  accountsInLedgerRange,
  buildLedgerAccounts,
  generalLedgerByAccounts,
  trialBalance,
  trialBalanceTotals,
} from '@/lib/ledger';

const entries = [
  { id: '1', date: '2025-12-20', entry_number: 'A1', account_code: '512', debit: '100', credit: '0' },
  { id: '2', date: '2026-01-10', entry_number: 'A2', account_code: '512', debit: '50.5', credit: '0' },
  { id: '3', date: '2026-01-10', entry_number: 'A2', account_code: '706', debit: '0', credit: '50.5' },
  { id: '4', date: '2026-02-01', entry_number: 'A3', account_code: '512', debit: '0', credit: '20' },
  { id: '6', date: '2026-02-01', entry_number: 'A3', account_code: '606', debit: '20', credit: '0' },
  { id: '5', date: '2025-12-20', entry_number: 'A1', account_code: '101', debit: '0', credit: '100' },
];
const accounts = buildLedgerAccounts([
  { code: '101', label: 'Capital', is_active: true },
  { code: '512', label: 'Banque', is_active: true },
  { code: '999', label: 'Inactif', is_active: false },
], entries);

describe('ledger', () => {
  it('builds accounts from the plan and unknown entry accounts', () => {
    expect(accounts.map((account) => account.code)).toEqual(['101', '512', '606', '706']);
  });

  it('filters accounts by root and by prefix range', () => {
    expect(accountsInLedgerRange(accounts, { mode: 'root', from: '5', to: '7' }).map((a) => a.code)).toEqual(['512', '606', '706']);
    expect(accountsInLedgerRange(accounts, { mode: 'account', from: '101', to: '512' }).map((a) => a.code)).toEqual(['101', '512']);
    expect(accountsInLedgerRange(accounts, { mode: 'root', from: '7', to: '5' })).toEqual([]);
  });

  it('computes opening balance, movements and running balance', () => {
    const [ledger] = generalLedgerByAccounts(entries, ['512'], '2026-01-01', '2026-12-31');
    expect(ledger.openingBalance).toBe(100);
    expect(ledger.rows.map((row) => row.balance)).toEqual([150.5, 130.5]);
    expect(ledger.closingBalance).toBe(130.5);
  });

  it('computes a trial balance with opening, movements and closing', () => {
    const rows = trialBalance(entries, accounts, '2026-01-01', '2026-12-31');
    const bank = rows.find((row) => row.code === '512');
    expect(bank).toMatchObject({ openingBalance: 100, debit: 50.5, credit: 20, closingBalance: 130.5 });
    const totals = trialBalanceTotals(rows);
    expect(totals.openingDebit).toBe(totals.openingCredit);
    expect(totals.closingDebit).toBe(totals.closingCredit);
  });
});
