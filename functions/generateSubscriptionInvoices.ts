import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { format, parseISO, addMonths, isBefore, startOfDay } from 'npm:date-fns@3.6.0';

/**
 * Génération automatique des factures pour les abonnements actifs
 * Cette fonction doit être exécutée régulièrement (via scheduled task)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const today = startOfDay(new Date());
    const results = {
      processed: 0,
      generated: 0,
      errors: []
    };

    // Récupérer tous les abonnements actifs avec auto_generate_invoice
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
      status: 'active',
      auto_generate_invoice: true
    });

    for (const sub of subscriptions) {
      try {
        results.processed++;

        // Vérifier si la date de paiement est atteinte
        if (!sub.next_payment_date) continue;
        
        const nextPaymentDate = startOfDay(parseISO(sub.next_payment_date));
        if (!isBefore(nextPaymentDate, today) && nextPaymentDate.getTime() !== today.getTime()) {
          continue;
        }

        // Vérifier si une facture n'a pas déjà été générée pour cette période
        const existingInvoices = await base44.asServiceRole.entities.Invoice.filter({
          company_id: sub.company_id,
          third_party_id: sub.third_party_id,
          description: `Abonnement ${sub.name} - ${format(nextPaymentDate, 'MM/yyyy')}`
        });

        if (existingInvoices.length > 0) {
          continue; // Facture déjà générée
        }

        // Générer la facture
        const invoiceNumber = `FAC-${Date.now().toString().slice(-8)}`;
        const amount = parseFloat(sub.amount) || 0;
        const tvaRate = 20; // TVA par défaut
        const amountHT = amount / 1.2;
        const amountTVA = amount - amountHT;

        await base44.asServiceRole.entities.Invoice.create({
          company_id: sub.company_id,
          invoice_number: invoiceNumber,
          type: sub.type === 'income' ? 'client' : 'fournisseur',
          date: format(today, 'yyyy-MM-dd'),
          due_date: format(addMonths(today, 1), 'yyyy-MM-dd'),
          third_party_id: sub.third_party_id,
          third_party_name: sub.third_party_name,
          description: `Abonnement ${sub.name} - ${format(nextPaymentDate, 'MM/yyyy')}`,
          amount_ht: amountHT,
          tva_rate: tvaRate,
          amount_tva: amountTVA,
          amount_ttc: amount,
          status: 'validée',
          account_code: sub.account_code,
          notes: `Facture générée automatiquement depuis l'abonnement #${sub.subscription_number}`
        });

        // Mettre à jour la prochaine date de paiement
        let nextDate = parseISO(sub.next_payment_date);
        if (sub.frequency === 'monthly') {
          nextDate = addMonths(nextDate, 1);
        } else if (sub.frequency === 'quarterly') {
          nextDate = addMonths(nextDate, 3);
        } else if (sub.frequency === 'semi-annual') {
          nextDate = addMonths(nextDate, 6);
        } else if (sub.frequency === 'annual') {
          nextDate = addMonths(nextDate, 12);
        }

        await base44.asServiceRole.entities.Subscription.update(sub.id, {
          next_payment_date: format(nextDate, 'yyyy-MM-dd')
        });

        results.generated++;
      } catch (error) {
        results.errors.push({
          subscription_id: sub.id,
          subscription_name: sub.name,
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      message: `${results.generated} facture(s) générée(s) sur ${results.processed} abonnement(s) traité(s)`,
      details: results
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});