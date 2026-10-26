import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { requestSphorixConnect } from '@/api/sphorixConnect';
import { useUser } from '@/components/hooks/useUser';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SCOPE_OPTIONS = [
  { value: 'connections:read', label: 'Lire les connexions' },
  { value: 'connections:write', label: 'Gérer les connexions' },
  { value: 'transfers:read', label: 'Lire les transferts et erreurs' },
  { value: 'transfers:write', label: 'Créer des transferts' },
  { value: 'transfers:process', label: 'Traiter les lots' },
  { value: 'transfers:retry', label: 'Relancer les erreurs' },
  { value: 'uploads:write', label: 'Envoyer les fichiers' },
];

async function connectRequest(path, { companyId, ...options } = {}) {
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

export default function ApiClientsPanel() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const canManage = ['owner', 'admin'].includes(user?.role);
  const [clients, setClients] = useState([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['transfers:read']);
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [revealedToken, setRevealedToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [clientToRevoke, setClientToRevoke] = useState(null);

  async function refreshClients() {
    if (!companyId || !canManage) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const payload = await connectRequest('/api/v1/api-clients', { companyId });
      setClients(payload.api_clients || []);
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de charger les clés API.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshClients();
  }, [companyId, canManage]);

  async function createClient(event) {
    event.preventDefault();
    if (!name.trim() || scopes.length === 0) return;

    setBusy(true);
    setErrorMessage('');
    setFeedback('');
    setRevealedToken('');
    try {
      const payload = await connectRequest('/api/v1/api-clients', {
        companyId,
        method: 'POST',
        body: { name: name.trim(), scopes, expires_in_days: Number(expiresInDays) },
      });
      setClients((current) => [payload.api_client, ...current]);
      setRevealedToken(payload.token);
      setName('');
      setFeedback('Clé créée. Copiez-la maintenant : elle ne sera plus affichée ensuite.');
    } catch (error) {
      setErrorMessage(error.message || 'La clé API n’a pas pu être créée.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeClient() {
    if (!clientToRevoke) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const payload = await connectRequest(`/api/v1/api-clients/${clientToRevoke.id}`, {
        companyId,
        method: 'DELETE',
      });
      setClients((current) => current.map((client) => (
        client.id === payload.api_client.id ? payload.api_client : client
      )));
      setClientToRevoke(null);
    } catch (error) {
      setErrorMessage(error.message || 'La clé API n’a pas pu être révoquée.');
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(revealedToken);
      setFeedback('Clé copiée dans le presse-papiers.');
    } catch {
      setErrorMessage('Copie automatique indisponible. Sélectionnez la clé pour la copier.');
    }
  }

  function toggleScope(scope, checked) {
    setScopes((current) => checked
      ? [...current, scope]
      : current.filter((value) => value !== scope));
  }

  if (!companyId) {
    return <Card><CardContent className="p-6 text-sm text-slate-600">Sélectionnez une société pour gérer ses clés API.</CardContent></Card>;
  }

  if (!canManage) {
    return <Card><CardContent className="p-6 text-sm text-slate-600">La gestion des clés API est réservée aux propriétaires et administrateurs de la société.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Créer une clé API</CardTitle>
          <CardDescription>Chaque clé est limitée à cette société, à un membre actif et aux accès sélectionnés.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createClient} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-2">
                <Label htmlFor="api-client-name">Nom du client</Label>
                <Input id="api-client-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} minLength={2} placeholder="Ex. Connecteur comptable" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-client-expiry">Expiration</Label>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger id="api-client-expiry"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 jours</SelectItem>
                    <SelectItem value="90">90 jours</SelectItem>
                    <SelectItem value="180">180 jours</SelectItem>
                    <SelectItem value="365">365 jours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-800">Autorisations</legend>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {SCOPE_OPTIONS.map((scope) => (
                  <label key={scope.value} className="flex min-h-8 items-center gap-3 text-sm text-slate-700">
                    <Checkbox
                      checked={scopes.includes(scope.value)}
                      onCheckedChange={(checked) => toggleScope(scope.value, checked === true)}
                    />
                    <span>{scope.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Button type="submit" className="gap-2" disabled={busy || !name.trim() || scopes.length === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer la clé
            </Button>
          </form>
        </CardContent>
      </Card>

      {revealedToken && (
        <section aria-labelledby="api-key-created-heading" className="space-y-3 border-l-4 border-emerald-500 bg-emerald-50 p-4">
          <div className="flex items-start gap-3 text-emerald-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 id="api-key-created-heading" className="font-semibold">{feedback}</h3>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input aria-label="Nouvelle clé API" readOnly value={revealedToken} className="min-w-0 bg-white font-mono text-xs" onFocus={(event) => event.target.select()} />
                <Button type="button" variant="outline" onClick={copyToken} className="gap-2 bg-white">
                  <Copy className="h-4 w-4" /> Copier la clé
                </Button>
              </div>
              {feedback === 'Clé copiée dans le presse-papiers.' && <p role="status" className="mt-2 text-sm">Clé copiée.</p>}
            </div>
          </div>
        </section>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-start gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Clés de cette société</CardTitle>
            <CardDescription>Les secrets complets ne sont jamais conservés ni réaffichés.</CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={refreshClients} disabled={loading} aria-label="Actualiser les clés API">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p role="status" className="py-4 text-sm text-slate-500">Chargement des clés API...</p>
          ) : clients.length === 0 ? (
            <p className="border-y border-slate-200 py-5 text-sm text-slate-500">Aucune clé API pour cette société.</p>
          ) : (
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {clients.map((client) => {
                const expired = isExpired(client);
                const revoked = Boolean(client.revoked_at);
                return (
                  <li key={client.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <KeyRound className="h-4 w-4 text-slate-500" />
                        <span className="font-medium text-slate-900">{client.name}</span>
                        <Badge variant={revoked || expired ? 'secondary' : 'default'}>
                          {revoked ? 'Révoquée' : expired ? 'Expirée' : 'Active'}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-slate-500">{client.key_prefix}••••••••</p>
                      <p className="text-xs text-slate-500">Expire le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(client.expires_at))}</p>
                      <ul className="flex flex-wrap gap-1.5" aria-label={`Autorisations de ${client.name}`}>
                        {client.scopes.map((scope) => (
                          <li key={scope} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">{SCOPE_OPTIONS.find((item) => item.value === scope)?.label || scope}</li>
                        ))}
                      </ul>
                    </div>
                    {!revoked && !expired && (
                      <Button type="button" variant="outline" size="sm" className="gap-2 self-start text-rose-700 hover:text-rose-800" onClick={() => setClientToRevoke(client)} disabled={busy}>
                        <Trash2 className="h-4 w-4" /> Révoquer
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(clientToRevoke)} onOpenChange={(open) => { if (!open) setClientToRevoke(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé API ?</AlertDialogTitle>
            <AlertDialogDescription>
              {clientToRevoke?.name} ne pourra plus accéder à Sphorix Connect avec cette clé. Cette action est immédiate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); revokeClient(); }} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Révoquer la clé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}