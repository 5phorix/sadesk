const toNumber = (value) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

/** Créances échues calculées à partir des factures non réglées. */
export function receivablesDue(invoices = [], today = new Date()) {
  const reference = today instanceof Date ? today : new Date(today);
  return invoices
    .filter((invoice) => invoice.type === 'client' && !['payee', 'annulee'].includes(invoice.status))
    .map((invoice) => {
      const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
      const daysLate = dueDate && !Number.isNaN(dueDate.getTime())
        ? Math.max(0, Math.floor((reference - dueDate) / 86_400_000))
        : 0;
      return {
        invoice,
        outstanding: round2(invoice.amount_ttc),
        daysLate,
        isOverdue: daysLate > 0,
      };
    });
}

/** Propose trois niveaux de relance sans envoyer d'email. */
export function reminderLevel(daysLate, thresholds = [7, 30, 60]) {
  const days = toNumber(daysLate);
  if (days >= thresholds[2]) return 3;
  if (days >= thresholds[1]) return 2;
  if (days >= thresholds[0]) return 1;
  return 0;
}

/** Retourne le niveau de relance applicable à une facture client échue. */
export function receivableReminder(invoice, today = new Date(), thresholds = [7, 30, 60]) {
  if (!invoice || invoice.type !== 'client' || !invoice.due_date) return null;
  if (['payee', 'payée', 'annulee', 'annulée'].includes(invoice.status)) return null;

  const dueDate = new Date(invoice.due_date);
  const reference = today instanceof Date ? today : new Date(today);
  if (Number.isNaN(dueDate.getTime()) || Number.isNaN(reference.getTime())) return null;

  const daysLate = Math.max(0, Math.floor((reference - dueDate) / 86_400_000));
  const level = reminderLevel(daysLate, thresholds);
  return level > 0 ? { daysLate, level } : null;
}

/** Barème de provision pour créances douteuses selon l'ancienneté du retard. */
export function receivableProvisionRate(daysLate) {
  const days = toNumber(daysLate);
  if (days >= 180) return 1;
  if (days >= 90) return 0.5;
  if (days >= 60) return 0.25;
  return 0;
}

/** Prépare l'écriture de provision pour dépréciation d'une créance douteuse. */
export function buildReceivableProvisionEntries(invoice, provisionAmount, companyId, today = new Date()) {
  const amount = round2(provisionAmount);
  if (amount <= 0) return [];
  const date = (today instanceof Date ? today : new Date(today)).toISOString().slice(0, 10);
  const entryNumber = `OD-PROV-CLI-${invoice.invoice_number}`;
  const label = `Provision créance douteuse ${invoice.third_party_name || invoice.invoice_number}`;
  return [
    { account_code: '681174', account_label: 'Dotations aux dépréciations des comptes clients', debit: amount, credit: 0 },
    { account_code: '491000', account_label: 'Dépréciations des comptes clients', debit: 0, credit: amount },
  ].map((entry) => ({
    ...entry,
    company_id: companyId,
    entry_number: entryNumber,
    date,
    journal: 'OD',
    label,
    reference: invoice.invoice_number,
    is_validated: false,
  }));
}

/** Dotation linéaire mensuelle, plafonnée à la valeur amortissable restante. */
export function straightLineDepreciation(asset, periodStart, periodEnd) {
  const cost = round2(asset.acquisition_cost);
  const residual = round2(asset.residual_value);
  const months = Math.max(1, Number(asset.useful_life_months) || 1);
  const monthly = round2((cost - residual) / months);
  const elapsed = Math.max(0, Number(asset.months_elapsed ?? 1));
  const alreadyDepreciated = round2(asset.accumulated_depreciation);
  const remaining = round2(Math.max(cost - residual - alreadyDepreciated, 0));
  const amount = round2(Math.min(monthly, remaining));

  return {
    periodStart,
    periodEnd,
    amount,
    monthlyAmount: monthly,
    remainingAfter: round2(remaining - amount),
  };
}

/** Construit les périodes mensuelles d'un plan linéaire sans effet de bord. */
export function buildDepreciationPlan(asset) {
  const [year, month, day] = String(asset.in_service_date || '').split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const months = Math.max(1, Number(asset.useful_life_months) || 1);
  if (!year || !month || !day || Number.isNaN(start.getTime())) return [];

  const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  return Array.from({ length: months }, (_, index) => {
    const periodStart = new Date(start.getFullYear(), start.getMonth() + index, start.getDate());
    const periodEnd = new Date(start.getFullYear(), start.getMonth() + index + 1, 0);
    const result = straightLineDepreciation({ ...asset, months_elapsed: index + 1, accumulated_depreciation: 0 }, periodStart, periodEnd);
    return {
      period_start: formatDate(periodStart),
      period_end: formatDate(periodEnd),
      amount: result.amount,
    };
  }).filter((period) => period.amount > 0);
}

/**
 * Dotation à comptabiliser pour un exercice donné, avec prorata automatique
 * à l'entrée en service et à la sortie (les mois hors service ne sont pas comptés).
 */
export function computeYearlyDepreciation(asset, year) {
  const disposalDate = asset.disposal_date ? new Date(asset.disposal_date) : null;
  const periodsInYear = buildDepreciationPlan(asset).filter((period) => {
    if (new Date(period.period_end).getFullYear() !== Number(year)) return false;
    if (disposalDate && new Date(period.period_end) > disposalDate) return false;
    return true;
  });
  if (!periodsInYear.length) return null;

  const amount = round2(periodsInYear.reduce((sum, period) => sum + period.amount, 0));
  if (amount <= 0) return null;

  return {
    period_start: periodsInYear[0].period_start,
    period_end: periodsInYear[periodsInYear.length - 1].period_end,
    amount,
    months: periodsInYear.length,
  };
}

/** Prépare les deux lignes équilibrées d'une dotation non encore comptabilisée. */
export function buildDepreciationEntries(asset, period, companyId) {
  const entryNumber = `OD-IMMO-${asset.asset_code}-${period.period_start}`;
  const label = `Dotation amortissement ${asset.name}`;
  return [
    {
      company_id: companyId,
      entry_number: entryNumber,
      date: period.period_end,
      journal: 'OD',
      account_code: asset.expense_account_code,
      account_label: 'Dotations aux amortissements',
      label,
      debit: period.amount,
      credit: 0,
      reference: asset.asset_code,
      is_validated: false,
    },
    {
      company_id: companyId,
      entry_number: entryNumber,
      date: period.period_end,
      journal: 'OD',
      account_code: asset.depreciation_account_code,
      account_label: 'Amortissements des immobilisations',
      label,
      debit: 0,
      credit: period.amount,
      reference: asset.asset_code,
      is_validated: false,
    },
  ];
}

/** Prépare l'écriture équilibrée de sortie avec plus-value ou moins-value. */
export function buildDisposalEntries(asset, accumulatedDepreciation, companyId) {
  const cost = round2(asset.acquisition_cost);
  const accumulated = round2(accumulatedDepreciation);
  const proceeds = round2(asset.disposal_proceeds);
  const netBookValue = round2(Math.max(cost - accumulated, 0));
  const gain = round2(Math.max(proceeds - netBookValue, 0));
  const loss = round2(Math.max(netBookValue - proceeds, 0));
  const entryNumber = `OD-SORTIE-${asset.asset_code}-${asset.disposal_date}`;
  const label = `Sortie immobilisation ${asset.name}`;
  const entries = [
    { account_code: '462000', account_label: 'Créances sur cessions d’immobilisations', debit: proceeds, credit: 0 },
    { account_code: asset.depreciation_account_code, account_label: 'Amortissements des immobilisations', debit: accumulated, credit: 0 },
    { account_code: '675000', account_label: 'Valeur comptable des éléments d’actif cédés', debit: loss, credit: 0 },
    { account_code: asset.acquisition_account_code, account_label: 'Immobilisations', debit: 0, credit: cost },
    { account_code: '775000', account_label: 'Produits des cessions d’éléments d’actif', debit: 0, credit: gain },
  ];

  return entries.filter((entry) => entry.debit > 0 || entry.credit > 0).map((entry) => ({
    ...entry,
    company_id: companyId,
    entry_number: entryNumber,
    date: asset.disposal_date,
    journal: 'OD',
    label,
    reference: asset.asset_code,
    is_validated: false,
  }));
}

/** Calcule la perte de valeur d'une immobilisation et prépare son écriture. */
export function assetImpairment(bookValue, recoverableValue) {
  const book = round2(bookValue);
  const recoverable = round2(Math.max(recoverableValue, 0));
  return {
    bookValue: book,
    recoverableValue: recoverable,
    impairment: round2(Math.max(book - recoverable, 0)),
  };
}

export function buildImpairmentEntries(asset, impairment, companyId) {
  if (impairment.impairment <= 0) return [];
  const entryNumber = `OD-DEPR-${asset.asset_code}-${impairment.assessment_date}`;
  const label = `Dépréciation immobilisation ${asset.name}`;
  return [
    {
      company_id: companyId,
      entry_number: entryNumber,
      date: impairment.assessment_date,
      journal: 'OD',
      account_code: asset.impairment_expense_account_code || '687000',
      account_label: 'Dotations aux dépréciations des immobilisations',
      label,
      debit: impairment.impairment,
      credit: 0,
      reference: asset.asset_code,
      is_validated: false,
    },
    {
      company_id: companyId,
      entry_number: entryNumber,
      date: impairment.assessment_date,
      journal: 'OD',
      account_code: asset.impairment_account_code || '291500',
      account_label: 'Dépréciations des immobilisations',
      label,
      debit: 0,
      credit: impairment.impairment,
      reference: asset.asset_code,
      is_validated: false,
    },
  ];
}

/** Valeur de stock et dépréciation selon la valeur recouvrable. */
export function stockValuation(stockItem, recoverableUnitValue = null) {
  const quantity = toNumber(stockItem.quantity);
  const unitPrice = toNumber(stockItem.unit_price);
  const bookValue = round2(quantity * unitPrice);
  const recoverableValue = recoverableUnitValue === null
    ? bookValue
    : round2(quantity * Math.max(0, toNumber(recoverableUnitValue)));

  return {
    quantity,
    bookValue,
    recoverableValue,
    impairment: round2(Math.max(bookValue - recoverableValue, 0)),
  };
}

/** Taux de dépréciation suggéré pour un stock dormant selon l'ancienneté du dernier mouvement. */
export function stockDormancyRate(daysSinceLastMovement) {
  const days = toNumber(daysSinceLastMovement);
  if (days >= 730) return 1;
  if (days >= 365) return 0.5;
  if (days >= 180) return 0.3;
  return 0;
}

/** Prépare l'écriture de variation de stock d'un mouvement valorisé. */
export function buildStockMovementEntries(movement, companyId, accounts = {}) {
  const quantity = Number(movement.quantity || 0);
  const amount = round2(Math.abs(quantity) * Number(movement.unit_cost || 0));
  if (!amount || movement.movement_type === 'write_down') return [];

  const increasesStock = movement.movement_type === 'receipt' || (movement.movement_type === 'adjustment' && quantity > 0);
  const stockAccount = accounts.stock || '31';
  const variationAccount = accounts.variation || '603';
  const entryNumber = `OD-STOCK-${movement.stock_item_id}-${movement.movement_date}`;
  const lines = increasesStock
    ? [
      { account_code: stockAccount, account_label: 'Stocks', debit: amount, credit: 0 },
      { account_code: variationAccount, account_label: 'Variation de stocks', debit: 0, credit: amount },
    ]
    : [
      { account_code: variationAccount, account_label: 'Variation de stocks', debit: amount, credit: 0 },
      { account_code: stockAccount, account_label: 'Stocks', debit: 0, credit: amount },
    ];

  return lines.map((line) => ({
    ...line,
    company_id: companyId,
    entry_number: entryNumber,
    date: movement.movement_date,
    journal: 'OD',
    label: `Variation de stock ${movement.reference || movement.stock_item_id}`,
    reference: movement.reference || null,
    is_validated: false,
  }));
}

/** Prépare l'écriture de dépréciation d'un stock à la clôture. */
export function buildStockImpairmentEntries(stockItem, impairment, companyId) {
  if (impairment.impairment <= 0) return [];
  const entryNumber = `OD-STOCK-DEPR-${stockItem.product_code || stockItem.id}-${impairment.assessment_date}`;
  const label = `Dépréciation stock ${stockItem.product_name}`;
  return [
    {
      company_id: companyId,
      entry_number: entryNumber,
      date: impairment.assessment_date,
      journal: 'OD',
      account_code: '681700',
      account_label: 'Dotations aux dépréciations des stocks',
      label,
      debit: impairment.impairment,
      credit: 0,
      reference: stockItem.product_code || null,
      is_validated: false,
    },
    {
      company_id: companyId,
      entry_number: entryNumber,
      date: impairment.assessment_date,
      journal: 'OD',
      account_code: '391000',
      account_label: 'Dépréciations des stocks',
      label,
      debit: 0,
      credit: impairment.impairment,
      reference: stockItem.product_code || null,
      is_validated: false,
    },
  ];
}

/** Construit les à-nouveaux des comptes de bilan validés d'un exercice. */
export function buildOpeningEntries(entries, targetDate, companyId) {
  const balances = new Map();
  entries.filter((entry) => /^[1-5]/.test(String(entry.account_code || '')) && entry.is_validated !== false).forEach((entry) => {
    const current = balances.get(entry.account_code) || { accountLabel: entry.account_label, debit: 0, credit: 0 };
    current.debit += Number(entry.debit || 0);
    current.credit += Number(entry.credit || 0);
    balances.set(entry.account_code, current);
  });

  const entryNumber = `AN-${String(targetDate).slice(0, 4)}`;
  return [...balances.entries()].flatMap(([accountCode, balance]) => {
    const net = round2(balance.debit - balance.credit);
    if (!net) return [];
    return {
      company_id: companyId,
      entry_number: entryNumber,
      date: targetDate,
      journal: 'AN',
      account_code: accountCode,
      account_label: balance.accountLabel,
      label: `À-nouveaux ${String(targetDate).slice(0, 4)}`,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? Math.abs(net) : 0,
      reference: entryNumber,
      is_validated: false,
    };
  });
}

export function vatAccounts(accountingPlan = 'PCG', invoiceType = 'client') {
  const plan = String(accountingPlan).toUpperCase();
  if (plan === 'OHADA' || plan === 'SYSCOHADA') {
    return { output: '4431', input: '4452', code: invoiceType === 'client' ? '4431' : '4452' };
  }
  return { output: '44571', input: '44566', code: invoiceType === 'client' ? '44571' : '44566' };
}

export function applyVatRegime({ amountHt, amountTva = 0, amountTtc = 0, tvaRate = 0, vatRegime = '' }) {
  const ht = round2(amountHt);
  if (vatRegime === 'franchise') return { amountHt: ht, amountTva: 0, amountTtc: ht, hasVat: false };
  const tva = amountTva > 0 ? round2(amountTva) : round2(ht * (Number(tvaRate) || 0) / 100);
  return { amountHt: ht, amountTva: tva, amountTtc: round2(amountTtc || ht + tva), hasVat: tva > 0 };
}
