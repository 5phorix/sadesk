import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANAGEMENT_SETTINGS,
  budgetStatus,
  buildBudgetNotifications,
  buildForecast,
  buildMonthlyComparison,
  closedMonths,
  computeIndicators,
  computeVariance,
  matchesBudget,
  monthlyBudgetAmounts,
  monthlyActuals,
  monthlyIndicatorSeries,
  nextClosableMonth,
  profitabilityBy,
  projectYearEnd,
  scenarioCoefficient,
  summarizeBudget,
} from '@/lib/management';

const expenseBudget = {
  id: 'b1',
  category: 'expense',
  account_code: '60',
  cost_center_code: 'PROD',
  total_amount: 12000,
  period_type: 'annual',
};

const entry = (date, overrides = {}) => ({
  date,
  account_code: '607000',
  cost_center_code: 'PROD',
  debit: 0,
  credit: 0,
  ...overrides,
});

describe('monthlyBudgetAmounts', () => {
  it('repartit lineairement en l absence de lignes', () => {
    const amounts = monthlyBudgetAmounts(expenseBudget, []);
    expect(amounts).toHaveLength(12);
    expect(amounts[0]).toBe(1000);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(12000);
  });

  it('absorbe l arrondi sur le dernier mois', () => {
    const amounts = monthlyBudgetAmounts({ ...expenseBudget, total_amount: 100 }, []);
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(amounts[11]).not.toBe(amounts[0]);
  });

  it('utilise les lignes saisies quand elles existent', () => {
    const lines = [
      { budget_id: 'b1', month: 1, amount: 500 },
      { budget_id: 'b1', month: 6, amount: 2500 },
      { budget_id: 'autre', month: 1, amount: 9999 },
    ];
    const amounts = monthlyBudgetAmounts(expenseBudget, lines);
    expect(amounts[0]).toBe(500);
    expect(amounts[5]).toBe(2500);
    expect(amounts[1]).toBe(0);
  });
});

describe('matchesBudget', () => {
  it('filtre par prefixe de compte', () => {
    expect(matchesBudget(entry('2024-01-10'), expenseBudget)).toBe(true);
    expect(matchesBudget(entry('2024-01-10', { account_code: '707000' }), expenseBudget)).toBe(false);
  });

  it('filtre par centre de couts exact', () => {
    expect(matchesBudget(entry('2024-01-10', { cost_center_code: 'ADM' }), expenseBudget)).toBe(false);
  });

  it('accepte tout quand aucun filtre n est defini', () => {
    const open = { id: 'b2', category: 'expense' };
    expect(matchesBudget(entry('2024-01-10', { account_code: '999' }), open)).toBe(true);
  });
});

describe('monthlyActuals', () => {
  it('agrege les debits par mois pour une depense', () => {
    const entries = [
      entry('2024-01-10', { debit: 400 }),
      entry('2024-01-20', { debit: 350 }),
      entry('2024-03-05', { debit: 200 }),
      entry('2023-01-05', { debit: 999 }),
    ];
    const actuals = monthlyActuals(expenseBudget, entries, 2024);
    expect(actuals[0]).toBe(750);
    expect(actuals[2]).toBe(200);
    expect(actuals[1]).toBe(0);
  });

  it('agrege les credits pour un budget de revenus', () => {
    const revenueBudget = { ...expenseBudget, category: 'revenue', account_code: '70' };
    const entries = [entry('2024-02-10', { account_code: '707000', credit: 1200 })];
    expect(monthlyActuals(revenueBudget, entries, 2024)[1]).toBe(1200);
  });
});

describe('computeVariance', () => {
  it('marque un depassement de depense comme defavorable', () => {
    const variance = computeVariance(1000, 1200, 'expense');
    expect(variance.variance).toBe(200);
    expect(variance.variancePercent).toBe(20);
    expect(variance.consumptionPercent).toBe(120);
    expect(variance.isFavorable).toBe(false);
  });

  it('marque une depense contenue comme favorable', () => {
    expect(computeVariance(1000, 800, 'expense').isFavorable).toBe(true);
  });

  it('inverse la logique pour les revenus', () => {
    const variance = computeVariance(1000, 800, 'revenue');
    expect(variance.variance).toBe(200);
    expect(variance.isFavorable).toBe(false);
    expect(computeVariance(1000, 1200, 'revenue').isFavorable).toBe(true);
  });

  it('ne calcule pas de pourcentage sans budget de reference', () => {
    const variance = computeVariance(0, 500, 'expense');
    expect(variance.variancePercent).toBeNull();
    expect(variance.consumptionPercent).toBeNull();
  });
});

describe('budgetStatus', () => {
  it('applique les seuils par defaut', () => {
    expect(budgetStatus(50, {}, DEFAULT_MANAGEMENT_SETTINGS)).toBe('ok');
    expect(budgetStatus(85, {}, DEFAULT_MANAGEMENT_SETTINGS)).toBe('warning');
    expect(budgetStatus(105, {}, DEFAULT_MANAGEMENT_SETTINGS)).toBe('alert');
  });

  it('privilegie les seuils du budget', () => {
    const budget = { warning_threshold: 40, alert_threshold: 60 };
    expect(budgetStatus(50, budget, DEFAULT_MANAGEMENT_SETTINGS)).toBe('warning');
    expect(budgetStatus(70, budget, DEFAULT_MANAGEMENT_SETTINGS)).toBe('alert');
  });

  it('reste neutre sans pourcentage', () => {
    expect(budgetStatus(null, {}, DEFAULT_MANAGEMENT_SETTINGS)).toBe('ok');
  });
});

describe('buildMonthlyComparison', () => {
  it('produit 12 mois avec cumuls croissants', () => {
    const entries = [entry('2024-01-10', { debit: 1500 })];
    const months = buildMonthlyComparison({ budget: expenseBudget, entries, year: 2024 });

    expect(months).toHaveLength(12);
    expect(months[0].budgeted).toBe(1000);
    expect(months[0].actual).toBe(1500);
    expect(months[0].variance).toBe(500);
    expect(months[0].cumulativeActual).toBe(1500);
    expect(months[1].cumulativeBudget).toBe(2000);
  });

  it('applique le coefficient de scenario au budget', () => {
    const months = buildMonthlyComparison({
      budget: expenseBudget,
      entries: [],
      year: 2024,
      scenarioCoefficient: 0.85,
    });
    expect(months[0].budgeted).toBe(850);
  });
});

describe('projectYearEnd', () => {
  it('extrapole le rythme des mois ecoules', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({ actual: i < 3 ? 1000 : 0 }));
    expect(projectYearEnd(months, 3)).toBe(12000);
  });

  it('retourne le realise quand l exercice est complet', () => {
    const months = Array.from({ length: 12 }, () => ({ actual: 100 }));
    expect(projectYearEnd(months, 12)).toBe(1200);
  });
});

describe('summarizeBudget', () => {
  it('agrege ecart, statut et projection', () => {
    const entries = [
      entry('2024-01-10', { debit: 1300 }),
      entry('2024-02-10', { debit: 1300 }),
    ];
    const summary = summarizeBudget({ budget: expenseBudget, entries, year: 2024, currentMonth: 2 });

    expect(summary.budgeted).toBe(12000);
    expect(summary.actual).toBe(2600);
    expect(summary.projected).toBe(15600);
    expect(summary.projectedVariance.variance).toBe(3600);
    expect(summary.remaining).toBe(9400);
    expect(summary.status).toBe('ok');
  });
});

describe('buildBudgetNotifications', () => {
  it('construit une alerte dedupliquee pour les seuils atteints', () => {
    const notifications = buildBudgetNotifications([
      {
        budget: { id: 'b1', name: 'Fournitures' },
        status: 'alert',
        consumptionPercent: 105.5,
        actual: 1055,
        budgeted: 1000,
      },
      {
        budget: { id: 'b2', name: 'Conseil' },
        status: 'ok',
        consumptionPercent: 40,
        actual: 400,
        budgeted: 1000,
      },
    ], { companyId: 'c1', userId: 'u1', year: 2026 });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      company_id: 'c1',
      user_id: 'u1',
      type: 'budget_alert',
      priority: 'high',
      related_entity_id: 'b1',
      dedupe_key: '2026:b1:alert',
    });
    expect(notifications[0].message).toContain('105.5 %');
  });
});

describe('buildForecast', () => {
  it('prolonge une tendance lineaire croissante', () => {
    expect(buildForecast([100, 200, 300], 2)).toEqual([400, 500]);
  });

  it('reste stable sur un historique plat', () => {
    expect(buildForecast([500, 500, 500], 3)).toEqual([500, 500, 500]);
  });

  it('ne projette jamais de valeur negative', () => {
    expect(buildForecast([300, 200, 100], 4).every((value) => value >= 0)).toBe(true);
  });

  it('duplique la valeur unique disponible', () => {
    expect(buildForecast([250], 2)).toEqual([250, 250]);
  });

  it('retourne un tableau vide sans historique', () => {
    expect(buildForecast([], 6)).toEqual([]);
  });

  it('applique le coefficient de scenario', () => {
    expect(buildForecast([100, 100], 1, 1.15)).toEqual([115]);
  });
});

describe('scenarioCoefficient', () => {
  it('lit les coefficients configures', () => {
    const settings = { ...DEFAULT_MANAGEMENT_SETTINGS, scenario_prudent: 0.7 };
    expect(scenarioCoefficient('prudent', settings)).toBe(0.7);
    expect(scenarioCoefficient('realiste', settings)).toBe(1);
  });

  it('retombe sur 1 pour un scenario inconnu', () => {
    expect(scenarioCoefficient('inexistant')).toBe(1);
  });

  it('ignore un coefficient invalide', () => {
    expect(scenarioCoefficient('optimiste', { scenario_optimiste: 0 })).toBe(1.15);
  });
});

describe('profitabilityBy', () => {
  const entries = [
    entry('2024-01-10', { account_code: '707000', credit: 10000, third_party_name: 'Client A', cost_center_code: 'PROD' }),
    entry('2024-01-11', { account_code: '607000', debit: 6000, third_party_name: 'Client A', cost_center_code: 'PROD' }),
    entry('2024-01-12', { account_code: '707000', credit: 4000, third_party_name: 'Client B', cost_center_code: 'ADM' }),
    entry('2024-01-13', { account_code: '512000', debit: 999, third_party_name: 'Client B' }),
  ];

  it('calcule la marge par client', () => {
    const rows = profitabilityBy('third_party', entries, { year: 2024 });
    const clientA = rows.find((row) => row.label === 'Client A');

    expect(clientA.revenue).toBe(10000);
    expect(clientA.expenses).toBe(6000);
    expect(clientA.margin).toBe(4000);
    expect(clientA.marginRate).toBe(40);
  });

  it('ignore les comptes hors classes 6 et 7', () => {
    const rows = profitabilityBy('third_party', entries, { year: 2024 });
    expect(rows.reduce((total, row) => total + row.expenses, 0)).toBe(6000);
  });

  it('agrege par centre de couts', () => {
    const rows = profitabilityBy('cost_center', entries, { year: 2024 });
    expect(rows.map((row) => row.label)).toContain('PROD');
    expect(rows.find((row) => row.label === 'ADM').margin).toBe(4000);
  });

  it('trie par marge decroissante', () => {
    const rows = profitabilityBy('third_party', entries, { year: 2024 });
    expect(rows[0].margin).toBeGreaterThanOrEqual(rows[1].margin);
  });

  it('regroupe les ecritures non affectees', () => {
    const rows = profitabilityBy('cost_center', [
      entry('2024-01-10', { account_code: '707000', credit: 100, cost_center_code: null }),
    ], { year: 2024 });
    expect(rows[0].label).toBe('Non affecté');
  });
});

describe('computeIndicators', () => {
  const entries = [
    entry('2024-01-10', { account_code: '707000', credit: 20000 }),
    entry('2024-01-11', { account_code: '607000', debit: 12000 }),
    entry('2024-01-12', { account_code: '411000', debit: 5000 }),
    entry('2024-01-13', { account_code: '401000', credit: 3000 }),
    entry('2024-01-14', { account_code: '370000', debit: 2000 }),
    entry('2024-01-15', { account_code: '512000', debit: 8000 }),
  ];

  it('calcule resultat et taux de marge', () => {
    const kpi = computeIndicators(entries, { year: 2024 });
    expect(kpi.revenue).toBe(20000);
    expect(kpi.expenses).toBe(12000);
    expect(kpi.result).toBe(8000);
    expect(kpi.marginRate).toBe(40);
  });

  it('calcule le BFR', () => {
    const kpi = computeIndicators(entries, { year: 2024 });
    expect(kpi.receivables).toBe(5000);
    expect(kpi.payables).toBe(3000);
    expect(kpi.stock).toBe(2000);
    expect(kpi.bfr).toBe(4000);
  });

  it('calcule la tresorerie', () => {
    expect(computeIndicators(entries, { year: 2024 }).cash).toBe(8000);
  });

  it('n expose pas de ratio sans chiffre d affaires', () => {
    const kpi = computeIndicators([entry('2024-01-11', { account_code: '607000', debit: 100 })], { year: 2024 });
    expect(kpi.marginRate).toBeNull();
    expect(kpi.bfrDays).toBeNull();
  });
});

describe('monthlyIndicatorSeries', () => {
  it('ventile produits et charges sur 12 mois', () => {
    const series = monthlyIndicatorSeries([
      entry('2024-01-10', { account_code: '707000', credit: 1000 }),
      entry('2024-01-11', { account_code: '607000', debit: 600 }),
      entry('2024-05-11', { account_code: '607000', debit: 200 }),
    ], 2024);

    expect(series).toHaveLength(12);
    expect(series[0]).toMatchObject({ revenue: 1000, expenses: 600, result: 400 });
    expect(series[4].result).toBe(-200);
  });
});

describe('clotures mensuelles', () => {
  const closings = [
    { year: 2024, month: 1, status: 'closed' },
    { year: 2024, month: 2, status: 'closed' },
    { year: 2024, month: 3, status: 'reopened' },
    { year: 2023, month: 12, status: 'closed' },
  ];

  it('liste les mois clotures de l exercice', () => {
    expect(closedMonths(closings, 2024)).toEqual([1, 2]);
  });

  it('propose le premier mois ecoule non cloture', () => {
    expect(nextClosableMonth(closings, 2024, new Date('2024-06-15'))).toBe(3);
  });

  it('ne propose rien quand tout est cloture', () => {
    const full = Array.from({ length: 5 }, (_, i) => ({ year: 2024, month: i + 1, status: 'closed' }));
    expect(nextClosableMonth(full, 2024, new Date('2024-06-15'))).toBeNull();
  });

  it('couvre l annee entiere une fois l exercice passe', () => {
    expect(nextClosableMonth([], 2024, new Date('2025-02-01'))).toBe(1);
  });
});
