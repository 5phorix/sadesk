import { createClient } from '@supabase/supabase-js';
import generateNotifications from './generate-notifications.js';
import { evaluateCompanyKpis } from './evaluate-performance-kpis.js';

const invokeForCompany = (companyId) => new Promise((resolve) => {
  const result = {
    status(code) {
      return {
        json(payload) {
          resolve({ code, payload });
        }
      };
    }
  };

  generateNotifications({
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET },
    body: { company_id: companyId }
  }, result);
});

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const cronAuthorization = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const isAuthorized = process.env.CRON_SECRET && (
    request.headers['x-cron-secret'] === process.env.CRON_SECRET ||
    cronAuthorization === process.env.CRON_SECRET
  );
  if (!isAuthorized) {
    return response.status(401).json({ error: 'Cron non authentifie' });
  }

  try {
    const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: companies, error } = await adminClient.from('companies').select('id');
    if (error) throw error;

    const kpiResults = await Promise.all((companies || []).map((company) => evaluateCompanyKpis(adminClient, company.id)));

    const results = await Promise.all((companies || []).map((company) => invokeForCompany(company.id)));
    const failures = results.filter(({ code }) => code >= 400);
    return response.status(failures.length ? 207 : 200).json({
      success: failures.length === 0,
      companies_processed: results.length,
      failures: failures.length,
      kpi_results: kpiResults
    });
  } catch (error) {
    console.error('Notification cron failed:', error);
    return response.status(500).json({ error: 'Erreur lors de la planification des notifications' });
  }
}