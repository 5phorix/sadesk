import { ApiError, methodNotAllowed } from '../_lib/sphorix-connect.js';
import {
  authorizeSadeskIntegration,
  hashRequest,
  isValidSourceSystem,
  sendIntegrationError,
} from '../_lib/sadesk-integration.js';

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const BATCH_FIELDS = 'id, source_system, source_connection, status, total_count, created_count, ignored_count, rejected_count, created_at, completed_at';

async function findExistingBatch(adminClient, companyId, idempotencyKey) {
  const { data, error } = await adminClient
    .from('sadesk_import_batches')
    .select(`${BATCH_FIELDS}, request_hash`)
    .eq('company_id', companyId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);

  try {
    const context = await authorizeSadeskIntegration(request, 'imports:write');
    const body = request.body || {};
    const sourceSystem = body.source_system;
    const sourceConnection = typeof body.source_connection === 'string' ? body.source_connection.trim() : '';
    const records = body.records;
    const idempotencyKey = request.headers['idempotency-key'];

    if (!isValidSourceSystem(sourceSystem)) {
      throw new ApiError(400, 'INVALID_SOURCE_SYSTEM', 'source_system est invalide.');
    }
    if (sourceConnection.length < 1 || sourceConnection.length > 160) {
      throw new ApiError(400, 'INVALID_SOURCE_CONNECTION', 'source_connection est obligatoire.');
    }
    if (!Array.isArray(records) || records.length < 1 || records.length > 250) {
      throw new ApiError(400, 'INVALID_BATCH_SIZE', 'Un lot doit contenir de 1 a 250 elements.');
    }
    if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key doit contenir 8 a 128 caracteres autorises.');
    }

    const referencedPartyIds = [...new Set(records
      .filter((record) => record.object_type === 'invoices')
      .map((record) => record.payload?.counterparty?.external_id)
      .filter((externalId) => typeof externalId === 'string' && externalId.length > 0))];
    const availablePartyIds = new Set();
    if (referencedPartyIds.length > 0) {
      const { data: existingParties, error: partiesError } = await context.adminClient
        .from('sadesk_external_records')
        .select('external_id')
        .eq('company_id', context.companyId)
        .eq('source_system', sourceSystem)
        .eq('source_connection', sourceConnection)
        .eq('object_type', 'third_parties')
        .in('external_id', referencedPartyIds);
      if (partiesError) throw partiesError;
      (existingParties || []).forEach((party) => availablePartyIds.add(party.external_id));
    }

    for (const record of records) {
      if (record.object_type === 'third_parties' && typeof record.external_id === 'string') {
        availablePartyIds.add(record.external_id);
      }
      const counterpartyExternalId = record.object_type === 'invoices'
        ? record.payload?.counterparty?.external_id
        : null;
      if (counterpartyExternalId && !availablePartyIds.has(counterpartyExternalId)) {
        throw new ApiError(409, 'COUNTERPARTY_NOT_IMPORTED', 'Importez le tiers reference avant sa facture.');
      }
    }

    const requestHash = hashRequest({ source_system: sourceSystem, source_connection: sourceConnection, records });
    const existing = await findExistingBatch(context.adminClient, context.companyId, idempotencyKey);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette cle a deja servi a un lot different.');
      }
      if (existing.status !== 'accepted') {
        const { request_hash: ignoredHash, ...batch } = existing;
        return response.status(200).json({ batch, resumed: true });
      }
    }

    let batch = existing;
    if (!batch) {
      const { data, error } = await context.adminClient
        .from('sadesk_import_batches')
        .insert({
          company_id: context.companyId,
          source_system: sourceSystem,
          source_connection: sourceConnection,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          total_count: records.length,
          created_by: context.user.id,
        })
        .select(`${BATCH_FIELDS}, request_hash`)
        .single();
      if (error?.code === '23505') {
        batch = await findExistingBatch(context.adminClient, context.companyId, idempotencyKey);
        if (!batch || batch.request_hash !== requestHash) {
          throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette cle a deja servi a un lot different.');
        }
      } else if (error) {
        throw error;
      } else {
        batch = data;
      }
    }

    const { data: result, error: processError } = await context.adminClient.rpc('process_sadesk_import_batch', {
      target_batch_id: batch.id,
      target_records: records,
    });
    if (processError) throw processError;

    return response.status(existing ? 200 : 201).json({ batch: result, resumed: Boolean(existing) });
  } catch (error) {
    return sendIntegrationError(response, error);
  }
}
