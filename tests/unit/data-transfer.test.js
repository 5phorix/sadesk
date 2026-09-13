import { describe, expect, it } from 'vitest';
import {
  normalizeCsvRow,
  parseCsv,
  parseStructuredData,
  serializeCsv,
  serializeJson,
  validateAccountPlanRows,
  accountingPlanCurrencyError,
} from '@/lib/data-transfer';

describe('transfert de donnees', () => {
  it('parse un CSV avec des champs guillemetes et des retours a la ligne', () => {
    const rows = parseCsv('Nom;Description\r\n"Client; A";"Ligne 1\nLigne 2"');

    expect(rows).toEqual([{ Nom: 'Client; A', Description: 'Ligne 1\nLigne 2' }]);
  });

  it('convertit les colonnes exportees en champs metier', () => {
    expect(normalizeCsvRow({ 'N° Écriture': 'AC-1', Débit: '10,50' }, 'entries')).toEqual({
      entry_number: 'AC-1',
      debit: '10,50',
    });
  });

  it('accepte un JSON enveloppe par type', () => {
    expect(parseStructuredData('{"accounts":[{"code":"401000"}]}', 'accounts', 'json')).toEqual([
      { code: '401000' },
    ]);
  });

  it('serialize un CSV et un JSON telechargeables', () => {
    const rows = [{ Code: '401000', Libelle: 'Fournisseur "A"' }];

    expect(serializeCsv(rows)).toBe('Code;Libelle\r\n"401000";"Fournisseur ""A"""');
    expect(JSON.parse(serializeJson(rows))).toEqual(rows);
  });

  it('valide un plan comptable contre le plan de la societe', () => {
    const result = validateAccountPlanRows([{ code: '401000', label: 'Fournisseurs' }], 'PCG');
    expect(result.valid).toBe(true);
    expect(result.rows[0].accounting_plan).toBe('PCG');
    expect(validateAccountPlanRows([{ code: '401000', label: 'A' }, { code: '401000', label: 'B' }]).valid).toBe(false);
  });

  it('impose la correspondance monnaie et plan comptable', () => {
    expect(accountingPlanCurrencyError('PCG', 'EUR')).toBeNull();
    expect(accountingPlanCurrencyError('SYSCOHADA', 'XOF')).toBeNull();
    expect(accountingPlanCurrencyError('SYSCOHADA', 'EUR')).toMatch(/EUR/);
    expect(accountingPlanCurrencyError('PCG', 'XAF')).toMatch(/CFA/);
  });
});
