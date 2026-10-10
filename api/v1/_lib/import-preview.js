import { duplicateKey } from '../../../src/lib/import-validation.js';
import { parseStructuredData } from '../../../src/lib/data-transfer.js';

const SUPPORTED_OBJECTS = new Set(['invoices', 'third_parties']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^\d+(?:[.,](\d{1,3}))?$/;
const MAX_RETURNED_ERRORS = 100;

function normalizeMoney(value, maxDecimals = 2) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  const match = normalized.match(DECIMAL_PATTERN);
  return match && (match[1]?.length || 0) <= maxDecimals ? normalized : null;
}

function minorUnits(value) {
  const normalized = normalizeMoney(value);
  if (!normalized) return null;
  const [whole, fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function normalizeRecord(objectType, record, companyCurrency) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;

  if (objectType === 'invoices' && record.totals) {
    return {
      external_id: record.external_id,
      invoice_number: record.invoice_number,
      type: record.direction === 'inbound' ? 'fournisseur' : record.direction === 'outbound' ? 'client' : record.type,
      date: record.issue_date,
      due_date: record.due_date,
      currency: record.currency || companyCurrency,
      third_party_name: record.counterparty?.name,
      counterparty_external_id: record.counterparty?.external_id,
      amount_ht: record.totals.net,
      amount_tva: record.totals.tax,
      amount_ttc: record.totals.gross,
      tva_rate: record.tax_rate,
      notes: record.notes,
    };
  }

  if (objectType === 'third_parties' && record.role) {
    return {
      ...record,
      type: record.role === 'supplier' ? 'fournisseur' : record.role === 'customer' ? 'client' : record.type,
      tva_number: record.vat_number ?? record.tva_number,
      address: typeof record.address === 'string' ? record.address : record.address?.line1,
      address_line_2: record.address?.line2 ?? record.address_line_2,
      postal_code: record.address?.postal_code ?? record.postal_code,
      city: record.address?.city ?? record.city,
      country: record.address?.country ?? record.country,
    };
  }

  if (objectType === 'invoices') return { ...record, currency: record.currency || companyCurrency };
  return record;
}

function rowIdentity(objectType, record) {
  if (objectType === 'invoices') return record?.invoice_number;
  return record?.external_id || record?.siret || record?.siren || record?.code;
}

function repeatedRows(records, objectType) {
  const seen = new Set();
  const repeated = new Set();

  records.forEach((record, index) => {
    const identity = rowIdentity(objectType, record);
    if (!identity) return;
    const key = duplicateKey(identity);
    if (seen.has(key)) repeated.add(index);
    else seen.add(key);
  });

  return repeated;
}

function validateRecord(objectType, record, companyCurrency) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return [{ code: 'INVALID_RECORD', field: null }];
  }

  if (objectType === 'invoices') {
    if (String(record.currency || '').toUpperCase() !== String(companyCurrency || '').toUpperCase()) {
      errors.push({ code: 'CURRENCY_NOT_SUPPORTED', field: 'currency' });
    }
    if (!String(record.invoice_number || '').trim()) errors.push({ code: 'INVOICE_NUMBER_REQUIRED', field: 'invoice_number' });
    if (!isIsoDate(record.date)) errors.push({ code: 'INVALID_DATE', field: 'date' });
    if (!['client', 'fournisseur'].includes(record.type)) errors.push({ code: 'INVALID_INVOICE_TYPE', field: 'type' });
    if (!String(record.third_party_name || '').trim()) errors.push({ code: 'COUNTERPARTY_REQUIRED', field: 'third_party_name' });

    const amounts = ['amount_ht', 'amount_tva', 'amount_ttc'];
    const normalizedAmounts = {};
    for (const field of amounts) {
      const normalized = normalizeMoney(record[field]);
      if (normalized === null) errors.push({ code: 'INVALID_AMOUNT', field });
      else normalizedAmounts[field] = normalized;
    }

    const taxRate = normalizeMoney(record.tva_rate, 3);
    if (taxRate === null || Number(taxRate) > 100) errors.push({ code: 'INVALID_TAX_RATE', field: 'tva_rate' });
    if (record.due_date && !isIsoDate(record.due_date)) errors.push({ code: 'INVALID_DUE_DATE', field: 'due_date' });

    if (amounts.every((field) => normalizedAmounts[field] !== undefined)) {
      const net = minorUnits(normalizedAmounts.amount_ht);
      const tax = minorUnits(normalizedAmounts.amount_tva);
      const gross = minorUnits(normalizedAmounts.amount_ttc);
      if (Math.abs(gross - (net + tax)) > 1) errors.push({ code: 'INCOHERENT_TOTALS', field: 'amount_ttc' });
    }
  } else {
    if (!String(record.name || '').trim()) errors.push({ code: 'NAME_REQUIRED', field: 'name' });
    if (!['client', 'fournisseur'].includes(record.type)) errors.push({ code: 'INVALID_PARTY_TYPE', field: 'type' });
    if (!rowIdentity(objectType, record)) errors.push({ code: 'STABLE_EXTERNAL_ID_REQUIRED', field: 'external_id' });
    if (record.payment_terms !== undefined && record.payment_terms !== null
      && (!Number.isInteger(Number(record.payment_terms)) || Number(record.payment_terms) < 0)) {
      errors.push({ code: 'INVALID_PAYMENT_TERMS', field: 'payment_terms' });
    }
  }

  return errors;
}

export function previewImport({ text, objectType, format, separator = ';', companyCurrency = 'EUR' }) {
  if (!SUPPORTED_OBJECTS.has(objectType)) throw new Error('Unsupported import object.');
  if (format === 'csv' && ![';', ',', '\t', '|'].includes(separator)) {
    throw new Error('Unsupported CSV separator.');
  }

  const parsedRows = parseStructuredData(text, objectType, format, separator);
  const records = parsedRows.map((record) => normalizeRecord(objectType, record, companyCurrency));
  const duplicateRows = repeatedRows(records, objectType);
  const results = records.map((record, index) => {
    const errors = validateRecord(objectType, record, companyCurrency);
    return {
      record_number: index + 1,
      data: record,
      status: errors.length > 0 ? 'invalid' : duplicateRows.has(index) ? 'duplicate' : 'valid',
      errors,
    };
  });

  const errors = results.flatMap((result) => result.errors.map((error) => ({
    record_number: result.record_number,
    ...error,
  })));
  const validCount = results.filter((result) => result.status === 'valid').length;
  const duplicateCount = results.filter((result) => result.status === 'duplicate').length;

  return {
    records: results,
    summary: {
      total_count: results.length,
      valid_count: validCount,
      duplicate_count: duplicateCount,
      invalid_count: results.length - validCount - duplicateCount,
      error_count: errors.length,
      errors: errors.slice(0, MAX_RETURNED_ERRORS),
      errors_truncated: errors.length > MAX_RETURNED_ERRORS,
    },
  };
}