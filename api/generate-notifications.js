import { createClient } from '@supabase/supabase-js';
import { detectAccountingAnomalies } from '../src/lib/accounting.js';
import { receivableReminder } from '../src/lib/auxiliaryAccounting.js';

const daysBetween = (left, right) => Math.ceil((left - right) / (1000 * 60 * 60 * 24));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function sendEmail({ recipient, notifications }) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'provider_not_configured' };
  if (!EMAIL_PATTERN.test(recipient || '')) return { sent: false, reason: 'recipient_invalid' };

  const rows = notifications.map((notification) => `
    <li><strong>${escapeHtml(notification.title)}</strong><br>${escapeHtml(notification.message)}</li>
  `).join('');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'SADESK Compta <onboarding@resend.dev>',
      to: [recipient],
      subject: `${notifications.length} notification(s) SADESK Compta`,
      html: `<p>Voici vos nouvelles notifications :</p><ul>${rows}</ul>`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Email provider error:', response.status, details);
    return { sent: false, reason: 'provider_error' };
  }
  return { sent: true, reason: null };
}

async function sendReceivableFollowup({ recipient, invoice, level, daysLate }) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'provider_not_configured' };
  if (!EMAIL_PATTERN.test(recipient || '')) return { sent: false, reason: 'recipient_invalid' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'SADESK Compta <onboarding@resend.dev>',
      to: [recipient],
      subject: `Relance ${level} - facture ${invoice.invoice_number || 'client'}`,
      html: `<p>Bonjour,</p><p>La facture <strong>${escapeHtml(invoice.invoice_number || 'sans numéro')}</strong> d'un montant de <strong>${escapeHtml(invoice.amount_ttc)} EUR</strong> présente ${daysLate} jour(s) de retard.</p><p>Merci de procéder à son règlement ou de nous indiquer sa date de paiement prévue.</p><p>Cordialement,<br>SADESK Compta</p>`
    })
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Receivable followup email error:', response.status, details);
    return { sent: false, reason: 'provider_error' };
  }
  return { sent: true, reason: null };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const cronAuthorization = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const isCronRequest = Boolean(
    process.env.CRON_SECRET && (
      request.headers['x-cron-secret'] === process.env.CRON_SECRET ||
      cronAuthorization === process.env.CRON_SECRET
    )
  );
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token && !isCronRequest) return response.status(401).json({ error: 'Non authentifie' });

  try {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase server environment is not configured');

    const adminClient = createClient(url, serviceRoleKey);
    let user = null;
    if (!isCronRequest) {
      const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: { user: authenticatedUser }, error: authError } = await authClient.auth.getUser();
      if (authError || !authenticatedUser) return response.status(401).json({ error: 'Non authentifie' });
      user = authenticatedUser;
    }

    const { company_id: companyId } = request.body || {};
    if (!companyId) return response.status(400).json({ error: 'company_id requis' });

    if (!isCronRequest) {
      const { data: membership, error: membershipError } = await adminClient
        .from('company_users').select('role').eq('company_id', companyId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership || !['owner', 'admin'].includes(membership.role)) return response.status(403).json({ error: 'Acces refuse' });
    }

    const [
      { data: setting },
      { data: invoices, error: invoicesError },
      { data: parties, error: partiesError },
      { data: entries, error: entriesError },
      { data: accounts, error: accountsError },
      { data: recipients, error: recipientsError },
      { data: followups, error: followupsError }
    ] = await Promise.all([
      adminClient.from('notification_settings').select('*').eq('company_id', companyId).maybeSingle(),
      adminClient.from('invoices').select('*').eq('company_id', companyId).in('status', ['brouillon', 'validee']),
      adminClient.from('third_parties').select('*').eq('company_id', companyId).eq('is_active', true),
      adminClient.from('accounting_entries').select('*').eq('company_id', companyId),
      adminClient.from('accounts').select('code').eq('company_id', companyId),
      adminClient.from('company_users').select('user_id').eq('company_id', companyId).eq('status', 'active').not('user_id', 'is', null),
      adminClient.from('receivable_followups').select('invoice_id, level, status').eq('company_id', companyId)
    ]);
    if (invoicesError) throw invoicesError;
    if (partiesError) throw partiesError;
    if (entriesError) throw entriesError;
    if (accountsError) throw accountsError;
    if (recipientsError) throw recipientsError;
    if (followupsError) throw followupsError;

    const settings = setting || {
      invoice_reminder_days: 7,
      third_party_inactive_months: 6,
      enabled_types: {
        invoice_due_soon: true,
        invoice_overdue: true,
        third_party_inactive: true,
        accounting_anomaly: true
      }
    };
    const today = new Date();
    const notifications = [];
    const followupRows = [];
    const followupByKey = new Map((followups || []).map((followup) => [`${followup.invoice_id}:${followup.level}`, followup]));

    if (settings.send_email_notifications && settings.enabled_types?.invoice_overdue !== false) {
      for (const invoice of invoices || []) {
        const reminder = receivableReminder(invoice, today);
        if (!reminder) continue;
        const { daysLate, level } = reminder;

        const key = `${invoice.id}:${level}`;
        if (followupByKey.has(key)) continue;

        const party = (parties || []).find((candidate) => candidate.id === invoice.third_party_id);
        const recipient = party?.email || invoice.third_party_email;
        const email = await sendReceivableFollowup({ recipient, invoice, level, daysLate });
        followupRows.push({
          company_id: companyId,
          invoice_id: invoice.id,
          level,
          scheduled_date: today.toISOString().slice(0, 10),
          sent_at: email.sent ? new Date().toISOString() : null,
          status: email.sent ? 'sent' : 'planned',
          channel: 'email',
          notes: email.sent ? null : `Relance non envoyée: ${email.reason}`
        });
      }
    }

    if (followupRows.length) {
      const { error: followupInsertError } = await adminClient.from('receivable_followups').insert(followupRows);
      if (followupInsertError) throw followupInsertError;
    }

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

    if (settings.enabled_types?.accounting_anomaly !== false) {
      const anomalies = detectAccountingAnomalies(entries || [], {
        knownAccountCodes: (accounts || []).map((account) => account.code)
      });
      const anomalyTitles = {
        duplicate: 'Doublon comptable détecté',
        unusual_amount: 'Montant comptable inhabituel',
        unknown_account: 'Compte comptable inconnu'
      };

      anomalies.forEach((anomaly) => {
        const entryId = anomaly.entryIds[0] || null;
        notifications.push({
          company_id: companyId,
          type: 'accounting_anomaly',
          priority: anomaly.severity === 'high' ? 'high' : 'medium',
          title: anomalyTitles[anomaly.type] || 'Anomalie comptable',
          message: anomaly.message,
          related_entity_type: 'AccountingEntry',
          related_entity_id: entryId,
          action_url: 'ImportExport',
          trigger_date: today.toISOString().slice(0, 10),
          dedupe_key: `accounting-anomaly:${anomaly.type}:${anomaly.entryIds.join(',')}`
        });
      });
    }

    const notificationRows = notifications.flatMap((notification) => {
      if (!recipients?.length) return [notification];
      return recipients.map(({ user_id: userId }) => ({ ...notification, user_id: userId }));
    });
    const dedupeKeys = [...new Set(notificationRows.map((notification) => notification.dedupe_key).filter(Boolean))];
    let existingDedupeRows = [];
    if (dedupeKeys.length) {
      const { data, error } = await adminClient
        .from('notifications')
        .select('user_id, dedupe_key')
        .eq('company_id', companyId)
        .in('dedupe_key', dedupeKeys);
      if (error) throw error;
      existingDedupeRows = data || [];
    }
    const isAlreadyCreated = (notification) => notification.dedupe_key && existingDedupeRows.some(
      (existing) => existing.user_id === notification.user_id && existing.dedupe_key === notification.dedupe_key
    );
    const newNotificationRows = notificationRows.filter((notification) => !isAlreadyCreated(notification));
    const newDedupeKeys = new Set(newNotificationRows.map((notification) => notification.dedupe_key).filter(Boolean));
    const newNotifications = notifications.filter((notification) =>
      !notification.dedupe_key || newDedupeKeys.has(notification.dedupe_key)
    );

    if (newNotificationRows.length) {
      const { error } = await adminClient.from('notifications').insert(newNotificationRows);
      if (error) throw error;
    }

    let email = { sent: false, reason: 'disabled' };
    if (settings.send_email_notifications && newNotifications.length) {
      let recipient = settings.notification_email;
      if (!recipient) {
        const { data: owner } = await adminClient
          .from('company_users')
          .select('user_email')
          .eq('company_id', companyId)
          .eq('role', 'owner')
          .eq('status', 'active')
          .not('user_email', 'is', null)
          .limit(1)
          .maybeSingle();
        recipient = owner?.user_email;
      }
      email = await sendEmail({ recipient, notifications: newNotifications });
    }

    return response.status(200).json({
      success: true,
      notifications_created: newNotificationRows.length,
      followups_created: followupRows.length,
      followups_sent: followupRows.filter((followup) => followup.status === 'sent').length,
      email,
      message: `${notifications.length} notification(s) créée(s)`
    });
  } catch (error) {
    console.error('Notification generation failed:', error);
    return response.status(500).json({ error: 'Erreur lors de la génération des notifications' });
  }
}
