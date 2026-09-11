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
