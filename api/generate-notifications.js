import { createClient } from '@supabase/supabase-js';

const daysBetween = (left, right) => Math.ceil((left - right) / (1000 * 60 * 60 * 24));

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Non authentifie' });

  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase server environment is not configured');

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const adminClient = createClient(url, serviceRoleKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return response.status(401).json({ error: 'Non authentifie' });

    const { company_id: companyId } = request.body || {};
    if (!companyId) return response.status(400).json({ error: 'company_id requis' });

    const { data: membership, error: membershipError } = await adminClient
      .from('company_users').select('role').eq('company_id', companyId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) return response.status(403).json({ error: 'Acces refuse' });

    const [{ data: setting }, { data: invoices, error: invoicesError }, { data: parties, error: partiesError }] = await Promise.all([
      adminClient.from('notification_settings').select('*').eq('company_id', companyId).maybeSingle(),
      adminClient.from('invoices').select('*').eq('company_id', companyId).in('status', ['brouillon', 'validee']),
      adminClient.from('third_parties').select('*').eq('company_id', companyId).eq('is_active', true)
    ]);
    if (invoicesError) throw invoicesError;
    if (partiesError) throw partiesError;

    const settings = setting || { invoice_reminder_days: 7, third_party_inactive_months: 6, enabled_types: { invoice_due_soon: true, invoice_overdue: true, third_party_inactive: true } };
    const today = new Date();
    const notifications = [];

    for (const invoice of invoices || []) {
      if (!invoice.due_date) continue;
      const dueDate = new Date(invoice.due_date);
      const daysToDue = daysBetween(dueDate, today);
      let type = null;
      let priority = null;
      let title = null;
      let message = null;

      if (daysToDue < 0 && settings.enabled_types?.invoice_overdue) {
        type = 'invoice_overdue';
        priority = 'high';
        title = `Facture ${invoice.invoice_number} en retard`;
        message = `La facture ${invoice.invoice_number} (${invoice.third_party_name || ''}) est échue. Montant: ${invoice.amount_ttc} EUR`;
      } else if (daysToDue >= 0 && daysToDue <= settings.invoice_reminder_days && settings.enabled_types?.invoice_due_soon) {
        type = 'invoice_due_soon';
        priority = 'medium';
        title = `Facture ${invoice.invoice_number} à échoir`;
        message = `La facture ${invoice.invoice_number} arrive à échéance dans ${daysToDue} jour(s). Montant: ${invoice.amount_ttc} EUR`;
      }

      if (type) {
        const { data: existing } = await adminClient.from('notifications').select('id').eq('company_id', companyId).eq('related_entity_id', invoice.id).eq('type', type).eq('is_dismissed', false).limit(1);
        if (!existing?.length) notifications.push({ company_id: companyId, type, priority, title, message, related_entity_type: 'Invoice', related_entity_id: invoice.id, related_entity_name: invoice.invoice_number, action_url: `Invoices?id=${invoice.id}`, trigger_date: today.toISOString().slice(0, 10) });
      }
    }

    if (settings.enabled_types?.third_party_inactive) {
      const inactiveDate = new Date(today);
      inactiveDate.setMonth(inactiveDate.getMonth() - settings.third_party_inactive_months);
      for (const party of parties || []) {
        const { data: recentInvoices } = await adminClient.from('invoices').select('date').eq('company_id', companyId).eq('third_party_id', party.id);
        const hasRecentActivity = (recentInvoices || []).some((invoice) => new Date(invoice.date) > inactiveDate);
        if ((recentInvoices || []).length && !hasRecentActivity) {
          const { data: existing } = await adminClient.from('notifications').select('id').eq('company_id', companyId).eq('related_entity_id', party.id).eq('type', 'third_party_inactive').eq('is_dismissed', false).limit(1);
          if (!existing?.length) notifications.push({ company_id: companyId, type: 'third_party_inactive', priority: 'low', title: `Tiers inactif: ${party.name}`, message: `Le tiers ${party.name} n'a pas eu de facture depuis ${settings.third_party_inactive_months} mois.`, related_entity_type: 'ThirdParty', related_entity_id: party.id, related_entity_name: party.name, action_url: `ThirdPartyDetail?id=${party.id}`, trigger_date: today.toISOString().slice(0, 10) });
        }
      }
    }

    if (notifications.length) {
      const { error } = await adminClient.from('notifications').insert(notifications);
      if (error) throw error;
    }
    return response.status(200).json({ success: true, notifications_created: notifications.length, message: `${notifications.length} notification(s) créée(s)` });
  } catch (error) {
    console.error('Notification generation failed:', error);
    return response.status(500).json({ error: 'Erreur lors de la génération des notifications' });
  }
}
