import { describe, expect, it } from 'vitest';
import {
  receivablesDue,
  receivableReminder,
  buildDepreciationPlan,
  buildDepreciationEntries,
  buildDisposalEntries,
  assetImpairment,
  buildImpairmentEntries,
  buildStockMovementEntries,
  buildStockImpairmentEntries,
  buildOpeningEntries,
  applyVatRegime,
  vatAccounts,
  reminderLevel,
  straightLineDepreciation,
  stockValuation,
} from '@/lib/auxiliaryAccounting';

describe('créances et relances', () => {
  it('calcule les créances clients échues sans inclure les factures payées', () => {
    const result = receivablesDue([
      { id: 'i1', type: 'client', status: 'validee', due_date: '2026-09-01', amount_ttc: 1200 },
      { id: 'i2', type: 'client', status: 'payee', due_date: '2026-09-01', amount_ttc: 500 },
    ], new Date('2026-09-11T00:00:00Z'));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ outstanding: 1200, daysLate: 10, isOverdue: true });
  });

  it('détermine le niveau de relance', () => {
    expect(reminderLevel(6)).toBe(0);
    expect(reminderLevel(7)).toBe(1);
    expect(reminderLevel(30)).toBe(2);
    expect(reminderLevel(60)).toBe(3);
  });

  it('calcule une relance uniquement pour une facture client suffisamment échue', () => {
    expect(receivableReminder({ type: 'client', status: 'validee', due_date: '2026-09-01' }, '2026-09-08'))
      .toEqual({ daysLate: 7, level: 1 });
    expect(receivableReminder({ type: 'client', status: 'validee', due_date: '2026-09-01' }, '2026-09-05'))
      .toBeNull();
    expect(receivableReminder({ type: 'client', status: 'payee', due_date: '2026-08-01' }, '2026-09-08'))
      .toBeNull();
  });
});

describe('immobilisations', () => {
  it('calcule une dotation linéaire plafonnée', () => {
    const depreciation = straightLineDepreciation({
      acquisition_cost: 12000,
      residual_value: 0,
      useful_life_months: 36,
      accumulated_depreciation: 0,
      months_elapsed: 1,
    }, '2026-09-01', '2026-09-30');

    expect(depreciation.amount).toBe(333.33);
    expect(depreciation.remainingAfter).toBe(11666.67);
  });

  it('genere un plan mensuel plafonne au montant amortissable', () => {
    const plan = buildDepreciationPlan({
      in_service_date: '2026-01-15',
      acquisition_cost: 1200,
      residual_value: 0,
      useful_life_months: 12,
    });

    expect(plan).toHaveLength(12);
    expect(plan[0]).toMatchObject({ period_start: '2026-01-15', amount: 100 });
    expect(plan.at(-1).period_end).toBe('2026-12-31');
  });

  it('prepare une dotation comptable equilibree', () => {
    const entries = buildDepreciationEntries({
      asset_code: 'MAT-01',
      name: 'Matériel',
      expense_account_code: '681100',
      depreciation_account_code: '281500',
    }, { period_start: '2026-01-15', period_end: '2026-01-31', amount: 100 }, 'company-1');

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_code: '681100', debit: 100, credit: 0, is_validated: false });
    expect(entries[1]).toMatchObject({ account_code: '281500', debit: 0, credit: 100 });
    expect(entries[0].entry_number).toBe(entries[1].entry_number);
  });

  it('calcule une plus-value de cession dans une ecriture equilibree', () => {
    const entries = buildDisposalEntries({
      asset_code: 'MAT-01',
      name: 'Matériel',
      acquisition_cost: 1200,
      depreciation_account_code: '281500',
      acquisition_account_code: '215000',
      disposal_date: '2026-12-31',
      disposal_proceeds: 900,
    }, 400, 'company-1');

    expect(entries.reduce((sum, entry) => sum + entry.debit, 0)).toBe(1300);
    expect(entries.reduce((sum, entry) => sum + entry.credit, 0)).toBe(1300);
    expect(entries.find((entry) => entry.account_code === '775000').credit).toBe(100);
  });

  it('calcule et comptabilise une depreciation', () => {
    const impairment = assetImpairment(1000, 750);
    expect(impairment).toEqual({ bookValue: 1000, recoverableValue: 750, impairment: 250 });
    const entries = buildImpairmentEntries({ asset_code: 'MAT-01', name: 'Matériel' }, { ...impairment, assessment_date: '2026-12-31' }, 'company-1');
    expect(entries.map((entry) => [entry.debit, entry.credit])).toEqual([[250, 0], [0, 250]]);
  });
});

describe('stocks', () => {
  it('calcule la dépréciation sur la valeur recouvrable', () => {
    expect(stockValuation({ quantity: 10, unit_price: 100 }, 75)).toEqual({
      quantity: 10,
      bookValue: 1000,
      recoverableValue: 750,
      impairment: 250,
    });
  });

  it('prepare une variation de stock equilibree', () => {
    const entries = buildStockMovementEntries({
      stock_item_id: 'stock-1', movement_type: 'receipt', quantity: 5,
      unit_cost: 20, movement_date: '2026-09-13', reference: 'BL-1'
    }, 'company-1');

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ account_code: '31', debit: 100, credit: 0 });
    expect(entries[1]).toMatchObject({ account_code: '603', debit: 0, credit: 100 });
  });

  it('prepare une provision de stock equilibree', () => {
    const entries = buildStockImpairmentEntries({ id: 'stock-1', product_code: 'P-1', product_name: 'Produit' }, {
      impairment: 250,
      assessment_date: '2026-12-31',
    }, 'company-1');

    expect(entries.map((entry) => [entry.account_code, entry.debit, entry.credit])).toEqual([
      ['681700', 250, 0],
      ['391000', 0, 250],
    ]);
  });

  it('genere les a-nouveaux uniquement pour les comptes de bilan', () => {
    const entries = buildOpeningEntries([
      { account_code: '512000', account_label: 'Banque', debit: 100, credit: 0, is_validated: true },
      { account_code: '401000', account_label: 'Fournisseurs', debit: 0, credit: 100, is_validated: true },
      { account_code: '607000', debit: 999, credit: 0, is_validated: true },
    ], '2027-01-01', 'company-1');

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.account_code)).toEqual(['512000', '401000']);
    expect(entries.reduce((sum, entry) => sum + entry.debit, 0)).toBe(100);
    expect(entries.reduce((sum, entry) => sum + entry.credit, 0)).toBe(100);
  });

  it('adapte la TVA au regime et au plan comptable', () => {
    expect(applyVatRegime({ amountHt: 100, tvaRate: 20, vatRegime: 'franchise' })).toMatchObject({ amountTva: 0, amountTtc: 100, hasVat: false });
    expect(vatAccounts('SYSCOHADA', 'client').code).toBe('4431');
    expect(vatAccounts('PCG', 'fournisseur').code).toBe('44566');
  });
});
