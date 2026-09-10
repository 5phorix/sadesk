import { createClient } from '@supabase/supabase-js';
import { sanitizePermissions } from '../src/lib/permissions.js';

const ROLES = ['owner', 'admin', 'accountant', 'viewer'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!accessToken) return response.status(401).json({ error: 'Non authentifie' });

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase server environment is not configured');
    }

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
    const adminClient = createClient(url, serviceRoleKey);

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return response.status(401).json({ error: 'Non authentifie' });

    const {
      company_id: companyId,
      email,
      name,
      role = 'viewer',
      permissions = null
    } = request.body || {};

    if (!companyId) return response.status(400).json({ error: 'company_id requis' });
    if (!EMAIL_PATTERN.test(email || '')) {
      return response.status(400).json({ error: 'Adresse email invalide' });
    }
    if (!ROLES.includes(role)) return response.status(400).json({ error: 'Role invalide' });

    const { data: membership, error: membershipError } = await adminClient
      .from('company_users')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return response.status(403).json({ error: 'Acces refuse' });
    }
    // Seul un proprietaire peut en designer un autre.
    if (role === 'owner' && membership.role !== 'owner') {
      return response.status(403).json({ error: 'Seul un proprietaire peut nommer un proprietaire' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();
    if (companyError) throw companyError;

    const { data: existing, error: existingError } = await adminClient
      .from('company_users')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('user_email', normalizedEmail)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return response.status(409).json({ error: 'Cet utilisateur est deja rattache a la societe' });
    }

    // Un compte peut deja exister : dans ce cas l'invitation est simplement rattachee.
    const { data: userList, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    if (listError) throw listError;
    const existingAccount = userList.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail
    );

    let invitationSent = false;
    if (!existingAccount) {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: { full_name: name || null, invited_to: company?.name || null },
        redirectTo: process.env.APP_URL || undefined
      });
      if (inviteError) throw inviteError;
      invitationSent = true;
    }

    const { data: created, error: insertError } = await adminClient
      .from('company_users')
      .insert({
        company_id: companyId,
        user_id: existingAccount?.id || null,
        user_email: normalizedEmail,
        user_name: name || null,
        role,
        status: existingAccount ? 'active' : 'pending',
        invited_by: user.email,
        invited_at: new Date().toISOString(),
        accepted_at: existingAccount ? new Date().toISOString() : null,
        permissions: sanitizePermissions(role, permissions || {})
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return response.status(200).json({
      success: true,
      membership: created,
      invitation_sent: invitationSent,
      message: invitationSent
        ? `Invitation envoyee a ${normalizedEmail}`
        : `${normalizedEmail} a ete rattache a la societe`
    });
  } catch (error) {
    console.error('Invite user failed:', error);
    return response.status(500).json({ error: "L'invitation n'a pas pu etre envoyee" });
  }
}
