import { createClient } from '@supabase/supabase-js';

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
    if (!membership) return response.status(403).json({ error: 'Acces refuse' });

    const [{ data: transactions, error: transactionsError }, { data: entries, error: entriesError }] = await Promise.all([
      adminClient.from('bank_transactions').select('*').eq('company_id', companyId).eq('is_reconciled', false),
      adminClient.from('accounting_entries').select('*').eq('company_id', companyId).is('lettering', null)
    ]);
    if (transactionsError) throw transactionsError;
    if (entriesError) throw entriesError;

    const bankEntries = (entries || []).filter((entry) => entry.account_code?.startsWith('5'));
    const results = { checked: 0, matched: 0, errors: [] };

    for (const transaction of transactions || []) {
      results.checked++;
      const match = bankEntries.find((entry) => {
        const transactionAmount = Math.abs(Number.parseFloat(transaction.amount) || 0);
        const entryAmount = Math.abs((Number.parseFloat(entry.debit) || Number.parseFloat(entry.credit) || 0));
        const dateDifference = Math.abs(
          (new Date(transaction.transaction_date) - new Date(entry.date)) / (1000 * 60 * 60 * 24)
        );
        return Math.abs(entryAmount - transactionAmount) < 0.01 && dateDifference <= 5 && !entry.lettering;
      });

      if (!match) continue;

      const lettering = `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const { error: transactionUpdateError } = await adminClient
        .from('bank_transactions')
        .update({
          is_reconciled: true,
          reconciled_entry_id: match.id,
          reconciliation_date: new Date().toISOString().slice(0, 10),
          notes: 'Rapprochement automatique'
        })
        .eq('id', transaction.id)
        .eq('company_id', companyId);
      if (transactionUpdateError) throw transactionUpdateError;

      const { error: entryUpdateError } = await adminClient
        .from('accounting_entries')
        .update({ lettering })
        .eq('id', match.id)
        .eq('company_id', companyId);
      if (entryUpdateError) throw entryUpdateError;

      bankEntries.splice(bankEntries.indexOf(match), 1);
      results.matched++;
    }

    return response.status(200).json({
      success: true,
      message: `${results.matched} transaction(s) rapprochee(s) sur ${results.checked} verifiee(s)`,
      details: results
    });
  } catch (error) {
    console.error('Auto reconciliation failed:', error);
    return response.status(500).json({ error: 'Erreur lors du rapprochement automatique' });
  }
}
