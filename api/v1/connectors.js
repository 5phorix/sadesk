import { methodNotAllowed } from './_lib/sphorix-connect.js';

const CONNECTORS = [
  {
    id: 'file-csv-json',
    name: 'Fichier CSV / JSON',
    category: 'file',
    directions: ['inbound'],
    objects: ['invoices', 'third_parties'],
    formats: ['csv', 'json'],
    accepts_full_snapshot_file: true,
    supports_incremental_sync: false,
    requires_credentials: false,
  },
];

export default function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);

  response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  return response.status(200).json({
    api_version: 'v1',
    connectors: CONNECTORS,
  });
}