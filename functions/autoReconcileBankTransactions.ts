import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO, differenceInDays } from 'npm:date-fns@3.6.0';

/**
 * Rapprochement bancaire automatique basé sur les montants et dates
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { company_id } = await req.json();

    if (!company_id) {
      return Response.json({ error: 'company_id requis' }, { status: 400 });
    }

    const results = {
      checked: 0,
      matched: 0,
      errors: []
    };

    // Récupérer les transactions non rapprochées
    const transactions = await base44.entities.BankTransaction.filter({
      company_id,
      is_reconciled: false
    });

    // Récupérer les écritures non lettrées sur comptes de trésorerie (classe 5)
    const entries = await base44.entities.AccountingEntry.filter({
      company_id,
      lettering: null
    });

    const bankEntries = entries.filter(e => e.account_code?.startsWith('5'));

    for (const transaction of transactions) {
      try {
        results.checked++;

        const transactionAmount = Math.abs(parseFloat(transaction.amount) || 0);
        const transactionDate = parseISO(transaction.transaction_date);

        // Chercher une écriture correspondante
        const match = bankEntries.find(entry => {
          const entryAmount = parseFloat(entry.debit) || parseFloat(entry.credit) || 0;
          const entryDate = parseISO(entry.date);
          
          // Vérifier montant exact
          const amountMatch = Math.abs(entryAmount - transactionAmount) < 0.01;
          
          // Vérifier date (± 5 jours)
          const daysDiff = Math.abs(differenceInDays(entryDate, transactionDate));
          const dateMatch = daysDiff <= 5;
          
          return amountMatch && dateMatch && !entry.lettering;
        });

        if (match) {
          // Générer un code de lettrage unique
          const letteringCode = `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

          // Mettre à jour la transaction
          await base44.entities.BankTransaction.update(transaction.id, {
            is_reconciled: true,
            reconciled_entry_id: match.id,
            reconciliation_date: new Date().toISOString().split('T')[0],
            notes: `Rapprochement automatique`
          });

          // Mettre à jour l'écriture
          await base44.entities.AccountingEntry.update(match.id, {
            lettering: letteringCode
          });

          results.matched++;

          // Retirer l'écriture des disponibles
          const index = bankEntries.indexOf(match);
          if (index > -1) {
            bankEntries.splice(index, 1);
          }
        }
      } catch (error) {
        results.errors.push({
          transaction_id: transaction.id,
          error: error.message
        });
      }
    }

    return Response.json({
      success: true,
      message: `${results.matched} transaction(s) rapprochée(s) sur ${results.checked} vérifiée(s)`,
      details: results
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});