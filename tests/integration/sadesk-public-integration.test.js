import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  cleanupFixtures,
  createTestCompany,
  isIntegrationConfigured,
} from './helpers';

const sourceSystem = 'sphorix-connect';

describe.skipIf(!isIntegrationConfigured)('API publique Sadesk - imports Connect', () => {
  let company;
  let admin;

  beforeAll(async () => {
    company = await createTestCompany('connect-api');
    admin = adminClient();
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('cree les tiers et factures en brouillon et ne duplique pas un replay', async () => {
    const records = [
      {
        object_type: 'third_parties',
        external_id: 'provider-party-1',
        payload: { role: 'supplier', name: 'Fournisseur Connect', code: 'EXT-1', siret: '11122233344455' },
      },
      {
        object_type: 'invoices',
        external_id: 'provider-invoice-1',
        payload: {
          invoice_number: 'CONNECT-API-001',
          direction: 'inbound',
          issue_date: '2026-10-18',
          due_date: '2026-11-17',
          currency: 'EUR',
          tax_rate: '20.000',
          counterparty: { external_id: 'provider-party-1', name: 'Fournisseur Connect' },
          totals: { net: '100.00', tax: '20.00', gross: '120.00' },
        },
      },
    ];
    const { data: batch, error: batchError } = await admin
      .from('sadesk_import_batches')
      .insert({
        company_id: company.id,
        source_system: sourceSystem,
        source_connection: 'test-connection',
        idempotency_key: `connect-${crypto.randomUUID()}`,
        request_hash: 'a'.repeat(64),
        total_count: records.length,
      })
      .select('id')
      .single();
    expect(batchError).toBeNull();
    const { data: result, error } = await admin.rpc('process_sadesk_import_batch', {
      target_batch_id: batch.id,
      target_records: records,
    });
    expect(error).toBeNull();
    expect(result).toMatchObject({
      status: 'succeeded',
      total_count: 2,
      created_count: 2,
      ignored_count: 0,
      rejected_count: 0,
    });

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, type, status, third_party_id, amount_ht, amount_tva, amount_ttc')
      .eq('company_id', company.id)
      .eq('invoice_number', 'CONNECT-API-001')
      .single();
    expect(invoice).toMatchObject({ type: 'fournisseur', status: 'brouillon', amount_ht: 100, amount_tva: 20, amount_ttc: 120 });
    expect(invoice.third_party_id).not.toBeNull();

    const { data: replay, error: replayError } = await admin.rpc('process_sadesk_import_batch', {
      target_batch_id: batch.id,
      target_records: records,
    });
    expect(replayError).toBeNull();
    expect(replay.created_count).toBe(2);

    const { count } = await admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('invoice_number', 'CONNECT-API-001');
    expect(count).toBe(1);
  });

  it('signale les erreurs de validation sans ecrire de facture', async () => {
    const records = [{
      object_type: 'invoices',
      external_id: 'provider-invoice-invalid',
      payload: {
        invoice_number: 'CONNECT-API-INVALID',
        direction: 'outbound',
        issue_date: '2026-10-18',
        currency: 'USD',
        tax_rate: '20',
        counterparty: { name: 'Client Connect' },
        totals: { net: '100.00', tax: '20.00', gross: '121.00' },
      },
    }];
    const { data: batch, error: batchError } = await admin
      .from('sadesk_import_batches')
      .insert({
        company_id: company.id,
        source_system: sourceSystem,
        source_connection: 'test-connection',
        idempotency_key: `connect-${crypto.randomUUID()}`,
        request_hash: 'b'.repeat(64),
        total_count: 1,
      })
      .select('id')
      .single();
    expect(batchError).toBeNull();

    const { data: result, error } = await admin.rpc('process_sadesk_import_batch', {
      target_batch_id: batch.id,
      target_records: records,
    });
    expect(error).toBeNull();
    expect(result).toMatchObject({ status: 'partially_succeeded', rejected_count: 1, created_count: 0 });

    const { data: item, error: itemError } = await admin
      .from('sadesk_import_batch_items')
      .select('status, error_code, error_field')
      .eq('batch_id', batch.id)
      .single();
    expect(itemError).toBeNull();
    expect(item).toMatchObject({ status: 'rejected', error_code: 'CURRENCY_NOT_SUPPORTED', error_field: 'currency' });

    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('company_id', company.id)
      .eq('invoice_number', 'CONNECT-API-INVALID');
    expect(invoice).toEqual([]);
  });
});
