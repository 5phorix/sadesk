const DATA_KEYS = {
  invoices: 'invoices',
  thirdparties: 'thirdparties',
  entries: 'entries',
  accounts: 'accounts'
};

export function parseCsv(text, separator = ';') {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === separator && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(
    headers.map((header, index) => [header, cells[index]?.trim() || ''])
  ));
}

export function parseStructuredData(text, importType, format) {
  if (format === 'json') {
    const parsed = JSON.parse(text);
    const data = Array.isArray(parsed) ? parsed : parsed?.[DATA_KEYS[importType]];
    if (!Array.isArray(data)) throw new Error('Le JSON doit contenir un tableau de données.');
    return data;
  }

  return parseCsv(text).map((row) => normalizeCsvRow(row, importType));
}

export function normalizeCsvRow(row, importType) {
  const maps = {
    invoices: {
      'Numéro': 'invoice_number', Type: 'type', Date: 'date', 'Échéance': 'due_date',
      Tiers: 'third_party_name', Description: 'description', 'Montant HT': 'amount_ht',
      'TVA %': 'tva_rate', 'Montant TVA': 'amount_tva', 'Montant TTC': 'amount_ttc', Statut: 'status'
    },
    thirdparties: {
      Code: 'code', Type: 'type', Nom: 'name', Contact: 'contact_name', Email: 'email',
      'Téléphone': 'phone', Adresse: 'address', CP: 'postal_code', Ville: 'city',
      SIRET: 'siret', 'TVA Intra': 'tva_number', Compte: 'account_code'
    },
    entries: {
      'N° Écriture': 'entry_number', Date: 'date', Journal: 'journal', Compte: 'account_code',
      'Libellé Compte': 'account_label', 'Libellé': 'label', 'Débit': 'debit',
      'Crédit': 'credit', 'Référence': 'reference', Tiers: 'third_party_name', Lettrage: 'lettering'
    },
    accounts: {
      Code: 'code', Libellé: 'label', Classe: 'class', Type: 'type', Catégorie: 'category'
    }
  };

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [maps[importType]?.[key] || key, value]));
}

export function serializeCsv(rows, separator = ';') {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(separator), ...rows.map((row) => headers.map((header) => escape(row[header])).join(separator))].join('\r\n');
}

export function serializeJson(rows) {
  return JSON.stringify(rows, null, 2);
}

export function validateAccountPlanRows(rows, accountingPlan = 'PCG') {
  const codes = new Set();
  const normalizedPlan = String(accountingPlan || 'PCG').toUpperCase();
  const errors = [];
  const validRows = rows.map((row, index) => {
    const code = String(row.code || '').trim();
    const label = String(row.label || '').trim();
    if (!code || !label) errors.push(`Ligne ${index + 1} : code et libellé obligatoires.`);
    if (codes.has(code)) errors.push(`Ligne ${index + 1} : code ${code} répété.`);
    codes.add(code);
    if (row.accounting_plan && String(row.accounting_plan).toUpperCase() !== normalizedPlan) {
      errors.push(`Ligne ${index + 1} : plan ${row.accounting_plan} incompatible avec ${normalizedPlan}.`);
    }
    return { ...row, code, label, class: row.class || code.charAt(0), accounting_plan: normalizedPlan };
  });
  return { valid: errors.length === 0, errors, rows: validRows };
}

export function accountingPlanCurrencyError(accountingPlan, currency) {
  const plan = String(accountingPlan || '').toUpperCase();
  const code = String(currency || '').toUpperCase();
  if (code === 'EUR' && plan !== 'PCG') return 'La monnaie EUR nécessite le plan PCG.';
  if ((code === 'XOF' || code === 'XAF') && plan !== 'SYSCOHADA') return 'Le franc CFA nécessite le plan SYSCOHADA.';
  return null;
}
