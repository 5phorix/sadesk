import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { requestSphorixConnect } from '@/api/sphorixConnect';
import { useUser } from '@/components/hooks/useUser';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function integrationRequest(path, { companyId, ...options } = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return requestSphorixConnect(path, {
    ...options,
    companyId,
    token: session?.access_token,
  });
}

function isExpired(client) {
  return new Date(client.expires_at).getTime() <= Date.now();
}

export default function SadeskIntegrationClientsPanel() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const canManage = ['owner', 'admin'].includes(user?.role);
  const [clients, setClients] = useState([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['imports:write', 'imports:read']);
  const [expiry, setExpiry] = useState('90');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);

  async function loadClients() {
    if (!companyId || !canManage) return;
    setLoading(true);
    setError('');
    try {
      const result = await integrationRequest('/api/v1/integration/clients', { companyId });
      setClients(result.api_clients || []);
    } catch (loadError) {
      setError(loadError.message || 'Les credentials d’intégration n’ont pas pu être chargés.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadClients(); }, [companyId, canManage]);

  function toggleScope(scope) {
    setScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  }

  async function createClient(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setSecret('');
    try {
      const result = await integrationRequest('/api/v1/integration/clients', {
        companyId,
        method: 'POST',
        body: { name: name.trim(), scopes, expires_in_days: Number(expiry) },
      });
      setClients((current) => [result.api_client, ...current]);
      setSecret(result.token);
      setMessage('Cette clé ne sera plus affichée après cette étape.');
      setName('');
    } catch (createError) {
      setError(createError.message || 'Le credential Sadesk n’a pas pu être créé.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeClient() {
    if (!revokeTarget) return;
    setBusy(true);
    setError('');
    try {
      const result = await integrationRequest(`/api/v1/integration/clients/${revokeTarget.id}`, {
        companyId,
        method: 'DELETE',
      });
      setClients((current) => current.map((client) => client.id === result.api_client.id ? result.api_client : client));
      setRevokeTarget(null);
    } catch (revokeError) {
      setError(revokeError.message || 'Le credential n’a pas pu être révoqué.');
    } finally {
      setBusy(false);
    }
  }

  if (!companyId) return null;
  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès API pour les intégrations</CardTitle>
          <CardDescription>Émission réservée aux propriétaires et administrateurs de la société.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Accès API pour les intégrations</CardTitle>
          <CardDescription>Ces credentials donnent accès uniquement aux imports pris en charge par cette société Sadesk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={createClient} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-2">
              <Label htmlFor="sadesk-api-client-name">Nom du produit connecté</Label>
              <Input id="sadesk-api-client-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} minLength={2} placeholder="Ex. Sphorix Connect" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sadesk-api-client-expiry">Expiration</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="sadesk-api-client-expiry"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                  <SelectItem value="180">180 jours</SelectItem>
                  <SelectItem value="365">365 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <fieldset className="space-y-3 md:col-span-2">
              <legend className="text-sm font-medium text-slate-800">Scopes</legend>
              {[
                ['imports:write', 'Importer des tiers et des en-têtes de factures en brouillon'],
                ['imports:read', 'Lire les résultats et erreurs des lots'],
              ].map(([scope, label]) => (
                <label key={scope} className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-sky-700" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                  <span><span className="font-mono text-xs text-slate-500">{scope}</span> · {label}</span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" className="gap-2 md:col-span-2 md:justify-self-start" disabled={busy || !name.trim() || scopes.length === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer un credential Sadesk
            </Button>
          </form>
          {error && <div role="alert" className="border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
          {secret && (
            <div className="border-l-4 border-emerald-500 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">Credential créé</p><p className="mt-1 text-sm">{message}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Nouveau credential Sadesk" readOnly value={secret} className="min-w-0 bg-white font-mono text-xs" onFocus={(event) => event.target.select()} /><Button type="button" variant="outline" className="gap-2 bg-white" onClick={async () => { await navigator.clipboard.writeText(secret); setMessage('Credential copié.'); }}><Copy className="h-4 w-4" /> Copier</Button></div>{message === 'Credential copié.' && <p role="status" className="mt-2 text-sm">Credential copié.</p>}</div></div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4"><div><CardTitle>Credentials émis</CardTitle><CardDescription>Les secrets complets ne sont pas conservés ni réaffichés.</CardDescription></div><Button type="button" variant="ghost" size="icon" onClick={loadClients} disabled={loading} aria-label="Actualiser les credentials">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button></CardHeader>
        <CardContent>
          {loading ? <p role="status" className="py-4 text-sm text-slate-500">Chargement…</p> : clients.length === 0 ? <p className="border-y py-5 text-sm text-slate-500">Aucun credential émis pour cette société.</p> : <div className="divide-y border-y">{clients.map((client) => { const revoked = Boolean(client.revoked_at); const expired = isExpired(client); return <div key={client.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><KeyRound className="h-4 w-4 text-slate-500" /><strong className="text-sm text-slate-900">{client.name}</strong><Badge variant={revoked || expired ? 'secondary' : 'default'}>{revoked ? 'Révoqué' : expired ? 'Expiré' : 'Actif'}</Badge></div><p className="font-mono text-xs text-slate-500">{client.key_prefix}••••••••</p><p className="text-xs text-slate-500">Expire le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(client.expires_at))}</p><ul className="flex flex-wrap gap-1.5">{client.scopes.map((scope) => <li key={scope} className="rounded border bg-slate-50 px-2 py-1 text-xs text-slate-600">{scope}</li>)}</ul></div>{!revoked && !expired && <Button type="button" variant="outline" size="sm" className="gap-2 self-start text-rose-700" onClick={() => setRevokeTarget(client)} disabled={busy}><Trash2 className="h-4 w-4" /> Révoquer</Button>}</div>; })}</div>}
        </CardContent>
      </Card>
      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Révoquer ce credential Sadesk ?</AlertDialogTitle><AlertDialogDescription>{revokeTarget?.name} ne pourra plus importer de données dans cette société.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); revokeClient(); }} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Révoquer</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
