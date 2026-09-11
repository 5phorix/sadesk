import { describe, expect, it } from 'vitest';
import {
  receivablesDue,
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
});
