/**
 * Moteur de calcul du contrôle de gestion.
 * Fonctions pures : aucune dépendance à React, Supabase ou au DOM.
 */

export const MONTH_LABELS = [
  'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'
];

export const SCENARIOS = [
  { key: 'prudent', label: 'Prudent', settingKey: 'scenario_prudent' },
  { key: 'realiste', label: 'Réaliste', settingKey: 'scenario_realiste' },
  { key: 'optimiste', label: 'Optimiste', settingKey: 'scenario_optimiste' }
];

export const DEFAULT_MANAGEMENT_SETTINGS = {
  warning_threshold: 80,
  alert_threshold: 100,
  scenario_prudent: 0.85,
  scenario_realiste: 1,
  scenario_optimiste: 1.15,
  forecast_months: 12,
  forecast_history_months: 6
};

const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Arrondi comptable au centime. */
export const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const monthOf = (date) => {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getMonth() + 1;
};

const yearOf = (date) => {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
};

/**
 * Un budget de catégorie `revenue` se réalise au crédit, les autres au débit.
 */
export const realizedAmount = (entry, category) =>
  category === 'revenue' ? toNumber(entry.credit) : toNumber(entry.debit);

/** Une écriture est rattachée au budget si compte ET centre de coûts correspondent. */
export function matchesBudget(entry, budget) {
  const accountFilter = (budget.account_code || '').trim();
  if (accountFilter && !(entry.account_code || '').startsWith(accountFilter)) return false;

  const centerFilter = (budget.cost_center_code || '').trim();
  if (centerFilter && (entry.cost_center_code || '') !== centerFilter) return false;

  return true;
}

/**
 * Répartit le montant annuel d'un budget sur 12 mois.
 * Les lignes saisies priment ; à défaut la répartition est linéaire.
 */
export function monthlyBudgetAmounts(budget, budgetLines = []) {
  const lines = budgetLines.filter((line) => line.budget_id === budget.id);

  if (lines.length > 0) {
    const amounts = Array(12).fill(0);
    lines.forEach((line) => {
      const index = Number(line.month) - 1;
      if (index >= 0 && index < 12) amounts[index] = round2(line.amount);
    });
    return amounts;
  }

  const total = toNumber(budget.total_amount);
  if (budget.period_type === 'annual' && total === 0) return Array(12).fill(0);

  const monthly = round2(total / 12);
  const amounts = Array(12).fill(monthly);
  // Le dernier mois absorbe l'écart d'arrondi pour retomber sur le total exact.
  amounts[11] = round2(total - monthly * 11);
  return amounts;
}

/** Réalisé mensuel d'un budget sur un exercice. */
export function monthlyActuals(budget, entries = [], year) {
  const amounts = Array(12).fill(0);

  entries.forEach((entry) => {
    if (yearOf(entry.date) !== year) return;
    if (!matchesBudget(entry, budget)) return;

    const month = monthOf(entry.date);
    if (!month) return;
    amounts[month - 1] += realizedAmount(entry, budget.category);
  });

  return amounts.map(round2);
}

/**
 * Écart budget/réalisé. Un écart positif est toujours défavorable :
 * dépassement pour une dépense, manque à gagner pour un revenu.
 */
export function computeVariance(budgeted, actual, category = 'expense') {
  const budget = round2(budgeted);
  const realized = round2(actual);
  const rawGap = category === 'revenue' ? budget - realized : realized - budget;
  const gap = round2(rawGap);

  return {
    budgeted: budget,
    actual: realized,
    variance: gap,
    // Sans budget de référence, un pourcentage n'a pas de sens.
    variancePercent: budget === 0 ? null : round2((gap / Math.abs(budget)) * 100),
    consumptionPercent: budget === 0 ? null : round2((realized / Math.abs(budget)) * 100),
    isFavorable: gap <= 0
  };
}

/** Compare une valeur réalisée à un budget et un objectif. */
export function explainVariance({ budgeted = 0, actual = 0, objective = null, category = 'expense', entries = [] }) {
  const budget = computeVariance(budgeted, actual, category);
  const target = objective === null ? null : computeVariance(objective, actual, category);
  const drivers = entries
    .map((entry) => ({ ...entry, amount: realizedAmount(entry, category) }))
    .filter((entry) => entry.amount !== 0)
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
    .slice(0, 10);

  return { budget, objective: target, drivers };
}

export const COSTING_METHODS = ['FULL_COST', 'VARIABLE_COST', 'DIRECT_COST', 'STANDARD_COST', 'ABC', 'MARGINAL_COST'];

/** Calcule le coût d'un objet selon une méthode explicite et traçable. */
export function calculateCost({ method, directCosts = 0, indirectCosts = 0, variableCosts = 0, fixedCosts = 0, standardCost = null, driverValue = 0, driverRate = 0, marginalUnitCost = 0, quantity = 1 }) {
  const direct = round2(directCosts);
  const indirect = round2(indirectCosts);
  const variable = round2(variableCosts);
  const fixed = round2(fixedCosts);
  const allocated = round2(Number(driverValue) * Number(driverRate));
  const total = method === 'FULL_COST' ? direct + indirect : method === 'VARIABLE_COST' ? variable : method === 'DIRECT_COST' ? direct : method === 'STANDARD_COST' ? (direct + indirect || round2(standardCost || 0)) : method === 'ABC' ? direct + allocated : round2(Number(marginalUnitCost) * Number(quantity));
  return { method, directCosts: direct, indirectCosts: indirect, variableCosts: variable, fixedCosts: fixed, allocatedIndirectCosts: allocated, total: round2(total), unitCost: quantity ? round2(total / Number(quantity)) : 0, variance: standardCost === null ? null : round2(total - Number(standardCost)) };
}

/** Projette un atterrissage selon un scénario de chiffre d'affaires et de charges. */
export function forecastScenario({ actualRevenue = 0, actualExpenses = 0, remainingRevenue = 0, remainingExpenses = 0, coefficient = 1, currentCash = 0, remainingCashFlow = 0 }) {
  const projectedRevenue = round2(Number(actualRevenue) + Number(remainingRevenue) * Number(coefficient));
  const projectedExpenses = round2(Number(actualExpenses) + Number(remainingExpenses) * Number(coefficient));
  const projectedResult = round2(projectedRevenue - projectedExpenses);
  return { projectedRevenue, projectedExpenses, projectedResult, projectedMarginRate: projectedRevenue ? round2((projectedResult / projectedRevenue) * 100) : null, projectedCash: round2(Number(currentCash) + Number(remainingCashFlow) * Number(coefficient)) };
}

/** Détermine le niveau d'alerte d'un KPI et explique le déclenchement. */
export function evaluateKpiAlert(kpi, value) {
  const numericValue = round2(value);
  const alertThreshold = kpi.alert_threshold === null || kpi.alert_threshold === undefined ? null : Number(kpi.alert_threshold);
  const warningThreshold = kpi.warning_threshold === null || kpi.warning_threshold === undefined ? null : Number(kpi.warning_threshold);
  if (alertThreshold !== null && numericValue >= alertThreshold) return { level: 'critical', threshold: alertThreshold, message: `${kpi.name} atteint ${numericValue}, au-dessus du seuil critique de ${alertThreshold}.` };
  if (warningThreshold !== null && numericValue >= warningThreshold) return { level: 'warning', threshold: warningThreshold, message: `${kpi.name} atteint ${numericValue}, au-dessus du seuil de vigilance de ${warningThreshold}.` };
  return null;
}

export function measureActionEffect(beforeValue, afterValue, targetValue = null) {
  const before = round2(beforeValue);
  const after = round2(afterValue);
  const improvement = round2(before - after);
  const targetGap = targetValue === null ? null : round2(after - Number(targetValue));
  return { before, after, improvement, targetGap, improved: improvement > 0 };
}

/**
 * Statut d'un budget au regard des seuils configurés.
 * Retourne 'ok', 'warning' ou 'alert'.
 */
export function budgetStatus(consumptionPercent, budget = {}, settings = DEFAULT_MANAGEMENT_SETTINGS) {
  if (consumptionPercent === null || consumptionPercent === undefined) return 'ok';

  const alert = toNumber(budget.alert_threshold ?? settings.alert_threshold);
  const warning = toNumber(budget.warning_threshold ?? settings.warning_threshold);

  if (consumptionPercent >= alert) return 'alert';
  if (consumptionPercent >= warning) return 'warning';
  return 'ok';
}

/**
 * Comparaison budget/réalisé mois par mois, avec cumuls et écarts.
 */
export function buildMonthlyComparison({
  budget,
  budgetLines = [],
  entries = [],
  year,
  scenarioCoefficient = 1
}) {
  const budgeted = monthlyBudgetAmounts(budget, budgetLines).map((amount) =>
    round2(amount * scenarioCoefficient)
  );
  const actuals = monthlyActuals(budget, entries, year);

  let cumulativeBudget = 0;
  let cumulativeActual = 0;

  return budgeted.map((amount, index) => {
    cumulativeBudget = round2(cumulativeBudget + amount);
    cumulativeActual = round2(cumulativeActual + actuals[index]);

    return {
      month: index + 1,
      label: MONTH_LABELS[index],
      ...computeVariance(amount, actuals[index], budget.category),
      cumulativeBudget,
      cumulativeActual,
      cumulativeVariance: round2(
        budget.category === 'revenue'
          ? cumulativeBudget - cumulativeActual
          : cumulativeActual - cumulativeBudget
      )
    };
  });
}

/**
 * Synthèse annuelle d'un budget : consommation, écart, statut et projection.
 */
export function summarizeBudget({
  budget,
  budgetLines = [],
  entries = [],
  year,
  settings = DEFAULT_MANAGEMENT_SETTINGS,
  scenarioCoefficient = 1,
  currentMonth
}) {
  const months = buildMonthlyComparison({ budget, budgetLines, entries, year, scenarioCoefficient });
  const budgeted = round2(months.reduce((total, month) => total + month.budgeted, 0));
  const actual = round2(months.reduce((total, month) => total + month.actual, 0));
  const variance = computeVariance(budgeted, actual, budget.category);

  const elapsed = clampMonth(currentMonth ?? new Date().getMonth() + 1);
  const projected = projectYearEnd(months, elapsed);

  return {
    budget,
    months,
    ...variance,
    projected,
    projectedVariance: computeVariance(budgeted, projected, budget.category),
    status: budgetStatus(variance.consumptionPercent, budget, settings),
    remaining: round2(budgeted - actual)
  };
}

/** Construit une notification idempotente pour chaque seuil atteint. */
export function buildBudgetNotifications(summaries, { companyId, userId, year }) {
  return summaries
    .filter((summary) => summary.status === 'warning' || summary.status === 'alert')
    .map((summary) => {
      const percentage = summary.consumptionPercent ?? 0;
      const isAlert = summary.status === 'alert';
      const budget = summary.budget;

      return {
        company_id: companyId,
        user_id: userId,
        type: 'budget_alert',
        priority: isAlert ? 'high' : 'medium',
        title: isAlert ? 'Budget dépassé' : 'Seuil budgétaire atteint',
        message: `${budget.name} atteint ${round2(percentage)} % de consommation (${summary.actual.toFixed(2)} € / ${summary.budgeted.toFixed(2)} €).`,
        related_entity_type: 'budget',
        related_entity_id: budget.id,
        related_entity_name: budget.name,
        action_url: 'BudgetTracking',
        trigger_date: new Date().toISOString().slice(0, 10),
        dedupe_key: `${year}:${budget.id}:${summary.status}`,
      };
    });
}

const clampMonth = (month) => Math.min(12, Math.max(1, Math.round(toNumber(month) || 1)));

/**
 * Projection de fin d'exercice : réalisé à date + budget restant réestimé
 * au rythme moyen constaté sur les mois écoulés.
 */
export function projectYearEnd(months, elapsedMonths) {
  const elapsed = clampMonth(elapsedMonths);
  const consumed = round2(
    months.slice(0, elapsed).reduce((total, month) => total + month.actual, 0)
  );

  if (elapsed >= 12) return consumed;

  const monthlyRate = consumed / elapsed;
  return round2(consumed + monthlyRate * (12 - elapsed));
}

/**
 * Forecast automatique par régression linéaire sur l'historique mensuel.
 * Retourne `horizon` mois projetés, jamais négatifs.
 */
export function buildForecast(history = [], horizon = 6, scenarioCoefficient = 1) {
  const points = history.map(toNumber);
  if (points.length === 0 || horizon <= 0) return [];

  if (points.length === 1) {
    return Array.from({ length: horizon }, () => round2(points[0] * scenarioCoefficient));
  }

  const n = points.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = points.reduce((total, value) => total + value, 0);
  const sumXY = points.reduce((total, value, index) => total + index * value, 0);
  const sumXX = points.reduce((total, _, index) => total + index * index, 0);

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: horizon }, (_, step) => {
    const value = intercept + slope * (n + step);
    return round2(Math.max(0, value) * scenarioCoefficient);
  });
}

/** Coefficient du scénario retenu, avec repli sur les valeurs par défaut. */
export function scenarioCoefficient(scenarioKey, settings = DEFAULT_MANAGEMENT_SETTINGS) {
  const scenario = SCENARIOS.find((item) => item.key === scenarioKey);
  if (!scenario) return 1;
  const value = toNumber(settings?.[scenario.settingKey]);
  return value > 0 ? value : toNumber(DEFAULT_MANAGEMENT_SETTINGS[scenario.settingKey]);
}

/**
 * Rentabilité agrégée par dimension : 'third_party', 'cost_center' ou 'account'.
 * Produits = classe 7 au crédit, charges = classe 6 au débit.
 */
export function profitabilityBy(dimension, entries = [], options = {}) {
  const { year, unassignedLabel = 'Non affecté' } = options;
  const buckets = new Map();

  const keyOf = (entry) => {
    if (dimension === 'third_party') {
      return {
        key: entry.third_party_id || entry.third_party_name || '__none__',
        label: entry.third_party_name || unassignedLabel
      };
    }
    if (dimension === 'cost_center') {
      return {
        key: entry.cost_center_code || '__none__',
        label: entry.cost_center_name || entry.cost_center_code || unassignedLabel
      };
    }
    return {
      key: (entry.account_code || '').slice(0, 3) || '__none__',
      label: entry.account_label || entry.account_code || unassignedLabel
    };
  };

  entries.forEach((entry) => {
    if (year && yearOf(entry.date) !== year) return;

    const accountCode = entry.account_code || '';
    const isRevenue = accountCode.startsWith('7');
    const isExpense = accountCode.startsWith('6');
    if (!isRevenue && !isExpense) return;

    const { key, label } = keyOf(entry);
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, revenue: 0, expenses: 0 });
    }

    const bucket = buckets.get(key);
    if (isRevenue) bucket.revenue += toNumber(entry.credit) - toNumber(entry.debit);
    else bucket.expenses += toNumber(entry.debit) - toNumber(entry.credit);
  });

  return Array.from(buckets.values())
    .map((bucket) => {
      const revenue = round2(bucket.revenue);
      const expenses = round2(bucket.expenses);
      const margin = round2(revenue - expenses);
      return {
        ...bucket,
        revenue,
        expenses,
        margin,
        marginRate: revenue === 0 ? null : round2((margin / revenue) * 100)
      };
    })
    .sort((a, b) => b.margin - a.margin);
}

/**
 * Indicateurs de gestion à partir des soldes du plan comptable français.
 * BFR = (stocks + créances) - dettes d'exploitation.
 */
export function computeIndicators(entries = [], options = {}) {
  const { year } = options;
  const balances = { stock: 0, receivables: 0, payables: 0, cash: 0, revenue: 0, expenses: 0 };

  entries.forEach((entry) => {
    if (year && yearOf(entry.date) !== year) return;

    const account = entry.account_code || '';
    const debit = toNumber(entry.debit);
    const credit = toNumber(entry.credit);
    const balance = debit - credit;

    if (account.startsWith('3')) balances.stock += balance;
    else if (account.startsWith('41')) balances.receivables += balance;
    else if (account.startsWith('40')) balances.payables += credit - debit;
    else if (account.startsWith('5')) balances.cash += balance;
    else if (account.startsWith('7')) balances.revenue += credit - debit;
    else if (account.startsWith('6')) balances.expenses += balance;
  });

  const revenue = round2(balances.revenue);
  const expenses = round2(balances.expenses);
  const result = round2(revenue - expenses);
  const stock = round2(balances.stock);
  const receivables = round2(balances.receivables);
  const payables = round2(balances.payables);

  return {
    revenue,
    expenses,
    result,
    marginRate: revenue === 0 ? null : round2((result / revenue) * 100),
    cash: round2(balances.cash),
    stock,
    receivables,
    payables,
    bfr: round2(stock + receivables - payables),
    // Nombre de jours de chiffre d'affaires immobilisés dans le BFR.
    bfrDays: revenue === 0 ? null : round2(((stock + receivables - payables) / revenue) * 365)
  };
}

/** Séries mensuelles produits / charges / résultat pour un exercice. */
export function monthlyIndicatorSeries(entries = [], year) {
  const series = MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    label,
    revenue: 0,
    expenses: 0
  }));

  entries.forEach((entry) => {
    if (yearOf(entry.date) !== year) return;
    const month = monthOf(entry.date);
    if (!month) return;

    const account = entry.account_code || '';
    if (account.startsWith('7')) {
      series[month - 1].revenue += toNumber(entry.credit) - toNumber(entry.debit);
    } else if (account.startsWith('6')) {
      series[month - 1].expenses += toNumber(entry.debit) - toNumber(entry.credit);
    }
  });

  return series.map((month) => {
    const revenue = round2(month.revenue);
    const expenses = round2(month.expenses);
    return { ...month, revenue, expenses, result: round2(revenue - expenses) };
  });
}

/** Mois déjà clôturés d'un exercice. */
export function closedMonths(closings = [], year) {
  return closings
    .filter((closing) => Number(closing.year) === year && closing.status === 'closed')
    .map((closing) => Number(closing.month))
    .sort((a, b) => a - b);
}

/** Prochain mois clôturable : le premier mois écoulé non encore clôturé. */
export function nextClosableMonth(closings = [], year, reference = new Date()) {
  const closed = new Set(closedMonths(closings, year));
  const lastElapsed = yearOf(reference) > year ? 12 : monthOf(reference) - 1;

  for (let month = 1; month <= lastElapsed; month += 1) {
    if (!closed.has(month)) return month;
  }
  return null;
}
