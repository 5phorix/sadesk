import { createClient } from '@supabase/supabase-js';
import { autoReconcile } from '../src/lib/accounting.js';

const getSupabaseClients = (accessToken) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase server environment is not configured');
  }

  return {
    authClient: createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    }),
    adminClient: createClient(url, serviceRoleKey)
  };
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return response.status(401).json({ error: 'Non authentifie' });
  }

  try {
    const { company_id: companyId } = request.body || {};
    if (!companyId) {
      return response.status(400).json({ error: 'company_id requis' });
    }

    const { authClient, adminClient } = getSupabaseClients(accessToken);
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return response.status(401).json({ error: 'Non authentifie' });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('company_users')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'admin', 'accountant'].includes(membership.role)) {
      return response.status(403).json({ error: 'Acces refuse' });
    }

    const [{ data: transactions, error: transactionsError }, { data: entries, error: entriesError }] =
      await Promise.all([
        adminClient
          .from('bank_transactions')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_reconciled', false),
        adminClient
          .from('accounting_entries')
          .select('*')
          .eq('company_id', companyId)
          .like('account_code', '5%')
      ]);
    if (transactionsError) throw transactionsError;
    if (entriesError) throw entriesError;

    // Une ecriture deja rattachee a une transaction ne peut pas servir deux fois.
    const { data: reconciled, error: reconciledError } = await adminClient
      .from('bank_transactions')
      .select('reconciled_entry_id')
      .eq('company_id', companyId)
      .not('reconciled_entry_id', 'is', null);
    if (reconciledError) throw reconciledError;

    const used = new Set((reconciled || []).map((row) => row.reconciled_entry_id));
    const available = (entries || []).filter((entry) => !used.has(entry.id));

    const { matched, ambiguous, unmatched } = autoReconcile(transactions || [], available);

    const today = new Date().toISOString().slice(0, 10);
    for (const { transaction, entry, score } of matched) {
      const { error: updateError } = await adminClient
        .from('bank_transactions')
        .update({
          is_reconciled: true,
          reconciled_entry_id: entry.id,
          reconciliation_date: today,
          reconciliation_mode: 'auto',
          reconciliation_score: score,
          notes: `Rapprochement automatique (score ${Math.round(score)} %)`
        })
        .eq('id', transaction.id)
        .eq('company_id', companyId);
      if (updateError) throw updateError;
    }

    return response.status(200).json({
      success: true,
      message:
        `${matched.length} transaction(s) rapprochee(s) sur ${(transactions || []).length} analysee(s)` +
        (ambiguous.length > 0 ? `, ${ambiguous.length} a arbitrer manuellement` : ''),
      details: {
        checked: (transactions || []).length,
        matched: matched.length,
        ambiguous: ambiguous.length,
        unmatched: unmatched.length
      }
    });
  } catch (error) {
    console.error('Auto reconciliation failed:', error);
    return response.status(500).json({ error: 'Erreur lors du rapprochement automatique' });
  }
}
