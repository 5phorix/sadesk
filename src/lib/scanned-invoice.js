const round2 = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100) / 100
    : 0;
};

export function updateScannedInvoice(invoice, field, value) {
  const next = { ...invoice, [field]: value };

  if (field === 'supplier_name' && value !== invoice.supplier_name) {
    next.third_party_id = null;
    next.account_code = '';
  }

  if (field === 'amount_ht' || field === 'tva_rate') {
    const amountHt = round2(next.amount_ht);
    const tvaRate = Number(next.tva_rate);
    const amountTva = round2(amountHt * (Number.isFinite(tvaRate) ? tvaRate : 0) / 100);
    next.amount_ht = amountHt;
    next.amount_tva = amountTva;
    next.amount_ttc = round2(amountHt + amountTva);
  }

  return next;
}

const isIsoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function validateScannedInvoice(invoice) {
  if (!invoice.invoice_number?.trim()) return 'Le numéro de facture est obligatoire.';
  if (!invoice.supplier_name?.trim()) return 'Le nom du tiers est obligatoire.';
  if (!isIsoDate(invoice.date)) return 'La date de facture est invalide.';
  if (invoice.due_date && !isIsoDate(invoice.due_date)) return "La date d'échéance est invalide.";
  if (invoice.due_date && invoice.due_date < invoice.date) return "L'échéance ne peut pas précéder la date de facture.";

  const amountHt = Number(invoice.amount_ht);
  const amountTva = Number(invoice.amount_tva);
  const amountTtc = Number(invoice.amount_ttc);
  const tvaRate = Number(invoice.tva_rate);
  if (![amountHt, amountTva, amountTtc, tvaRate].every(Number.isFinite)
    || amountHt < 0 || amountTva < 0 || amountTtc <= 0 || tvaRate < 0 || tvaRate > 100) {
    return 'Les montants ou le taux de TVA sont invalides.';
  }
  if (Math.abs(round2(amountTtc) - round2(amountHt + amountTva)) > 0.01) {
    return 'Le TTC doit être égal au HT + TVA.';
  }

  return null;
}

export function buildScannedInvoiceEntries(invoice, category) {
  const isSale = category === 'ventes';
  if (!isSale && category !== 'achats') return [];

  const amountHt = round2(invoice.amount_ht);
  const amountTva = round2(invoice.amount_tva);
  const amountTtc = round2(invoice.amount_ttc);
  const reference = invoice.invoice_number;
  const date = invoice.date;
  const thirdPartyAccount = invoice.account_code || (isSale ? '411000' : '401000');
  const thirdPartyLabel = `${isSale ? 'Client' : 'Fournisseur'} - ${invoice.supplier_name}`;
  const description = invoice.description ? ` - ${invoice.description.substring(0, 50)}` : '';
  const lines = isSale
    ? [
      {
        account_code: thirdPartyAccount,
        account_label: thirdPartyLabel,
        label: `Fact. ${reference} à encaisser`,
        debit: amountTtc,
        credit: 0,
        third_party_name: invoice.supplier_name,
        third_party_id: invoice.third_party_id,
      },
      {
        account_code: '707000',
        account_label: 'Ventes de marchandises',
        label: `Fact. ${reference} - ${invoice.supplier_name}${description}`,
        debit: 0,
        credit: amountHt,
      },
      ...(amountTva > 0 ? [{
        account_code: '445710',
        account_label: `TVA collectée ${invoice.tva_rate}%`,
        label: `TVA fact. ${reference}`,
        debit: 0,
        credit: amountTva,
      }] : []),
    ]
    : [
      {
        account_code: '607000',
        account_label: 'Achats de marchandises',
        label: `Fact. ${reference} - ${invoice.supplier_name}${description}`,
        debit: amountHt,
        credit: 0,
      },
      ...(amountTva > 0 ? [{
        account_code: '445660',
        account_label: `TVA déductible ${invoice.tva_rate}%`,
        label: `TVA fact. ${reference}`,
        debit: amountTva,
        credit: 0,
      }] : []),
      {
        account_code: thirdPartyAccount,
        account_label: thirdPartyLabel,
        label: `Fact. ${reference} à payer`,
        debit: 0,
        credit: amountTtc,
        third_party_name: invoice.supplier_name,
        third_party_id: invoice.third_party_id,
      },
    ];

  return lines
    .filter((line) => line.debit > 0 || line.credit > 0)
    .map((line) => ({ ...line, date, journal: isSale ? 'VE' : 'AC', reference }));
}