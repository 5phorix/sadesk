import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { addDays, subMonths, parseISO, isBefore, isAfter } from 'npm:date-fns';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    if (!user.active_company_id) {
      return Response.json({ error: 'No active company' }, { status: 400 });
    }

    const companyId = user.active_company_id;

    // Charger les paramètres
    const settings = await base44.asServiceRole.entities.NotificationSetting.filter({ company_id: companyId });
    const setting = settings[0] || {
      invoice_reminder_days: 7,
      third_party_inactive_months: 6,
      send_email_notifications: false,
      enabled_types: {
        invoice_due_soon: true,
        invoice_overdue: true,
        third_party_inactive: true
      }
    };

    const notifications = [];
    const today = new Date();

    // 1. Vérifier les factures
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ 
      company_id: companyId,
      status: { $in: ['brouillon', 'validée'] }
    });

    for (const invoice of invoices) {
      if (!invoice.due_date) continue;

      try {
        const dueDate = parseISO(invoice.due_date);
        const reminderDate = addDays(dueDate, -setting.invoice_reminder_days);

        // Facture échue
        if (isBefore(dueDate, today) && setting.enabled_types?.invoice_overdue) {
          const existing = await base44.asServiceRole.entities.Notification.filter({
            company_id: companyId,
            related_entity_id: invoice.id,
            type: 'invoice_overdue',
            is_dismissed: false
          });

          if (existing.length === 0) {
            notifications.push({
              company_id: companyId,
              type: 'invoice_overdue',
              priority: 'high',
              title: `Facture ${invoice.invoice_number} en retard`,
              message: `La facture ${invoice.invoice_number} (${invoice.third_party_name}) est échue depuis le ${dueDate.toLocaleDateString('fr-FR')}. Montant: ${invoice.amount_ttc}€`,
              related_entity_type: 'Invoice',
              related_entity_id: invoice.id,
              related_entity_name: invoice.invoice_number,
              action_url: `Invoices?id=${invoice.id}`,
              trigger_date: today.toISOString().split('T')[0]
            });
          }
        }
        // Rappel avant échéance
        else if (isAfter(today, reminderDate) && isBefore(today, dueDate) && setting.enabled_types?.invoice_due_soon) {
          const existing = await base44.asServiceRole.entities.Notification.filter({
            company_id: companyId,
            related_entity_id: invoice.id,
            type: 'invoice_due_soon',
            is_dismissed: false
          });

          if (existing.length === 0) {
            const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            notifications.push({
              company_id: companyId,
              type: 'invoice_due_soon',
              priority: 'medium',
              title: `Facture ${invoice.invoice_number} à échoir`,
              message: `La facture ${invoice.invoice_number} (${invoice.third_party_name}) arrive à échéance dans ${daysLeft} jours. Montant: ${invoice.amount_ttc}€`,
              related_entity_type: 'Invoice',
              related_entity_id: invoice.id,
              related_entity_name: invoice.invoice_number,
              action_url: `Invoices?id=${invoice.id}`,
              trigger_date: today.toISOString().split('T')[0]
            });
          }
        }
      } catch (e) {
        console.error('Error processing invoice:', e);
      }
    }

    // 2. Vérifier les tiers inactifs
    if (setting.enabled_types?.third_party_inactive) {
      const thirdParties = await base44.asServiceRole.entities.ThirdParty.filter({ 
        company_id: companyId,
        is_active: true
      });

      const inactiveDate = subMonths(today, setting.third_party_inactive_months);

      for (const party of thirdParties) {
        // Vérifier dernière facture
        const recentInvoices = await base44.asServiceRole.entities.Invoice.filter({
          company_id: companyId,
          third_party_id: party.id
        });

        const hasRecentActivity = recentInvoices.some(inv => {
          try {
            const invDate = parseISO(inv.date);
            return isAfter(invDate, inactiveDate);
          } catch {
            return false;
          }
        });

        if (!hasRecentActivity && recentInvoices.length > 0) {
          const existing = await base44.asServiceRole.entities.Notification.filter({
            company_id: companyId,
            related_entity_id: party.id,
            type: 'third_party_inactive',
            is_dismissed: false
          });

          if (existing.length === 0) {
            notifications.push({
              company_id: companyId,
              type: 'third_party_inactive',
              priority: 'low',
              title: `Tiers inactif: ${party.name}`,
              message: `Le tiers ${party.name} (${party.code}) n'a pas eu de facture depuis ${setting.third_party_inactive_months} mois.`,
              related_entity_type: 'ThirdParty',
              related_entity_id: party.id,
              related_entity_name: party.name,
              action_url: `ThirdPartyDetail?id=${party.id}`,
              trigger_date: today.toISOString().split('T')[0]
            });
          }
        }
      }
    }

    // 3. Créer les notifications
    let createdCount = 0;
    for (const notif of notifications) {
      await base44.asServiceRole.entities.Notification.create(notif);
      createdCount++;

      // Envoyer email si activé
      if (setting.send_email_notifications) {
        const company = await base44.asServiceRole.entities.Company.filter({ id: companyId });
        const emailTo = setting.notification_email || company[0]?.email || user.email;

        await base44.asServiceRole.integrations.Core.SendEmail({
          from_name: 'Sadesk Notifications',
          to: emailTo,
          subject: `[Sadesk] ${notif.title}`,
          body: `
            <h2>${notif.title}</h2>
            <p>${notif.message}</p>
            <p><strong>Priorité:</strong> ${notif.priority}</p>
            <p><a href="https://app.base44.com/${companyId}/${notif.action_url}">Voir les détails</a></p>
          `
        });

        await base44.asServiceRole.entities.Notification.update(notif.id, {
          email_sent: true,
          email_sent_at: new Date().toISOString()
        });
      }
    }

    return Response.json({ 
      success: true, 
      notifications_created: createdCount,
      message: `${createdCount} notification(s) créée(s)`
    });

  } catch (error) {
    console.error('Error generating notifications:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});