import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, FileUp, Loader2, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { requestSphorixConnect } from '@/api/sphorixConnect';
import { useUser } from '@/components/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const STATUS_LABELS = {
  queued: 'En attente',
  running: 'En cours',
  succeeded: 'Terminé',
  partially_succeeded: 'Terminé avec exceptions',
  failed: 'Échec',
  cancelled: 'Annulé',
};

async function connectRequest(path, { companyId, ...options } = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return requestSphorixConnect(path, {
    ...options,
    companyId,
    token: session?.access_token,
  });
}

export default function SphorixConnectPanel() {
  const { user } = useUser();
  const companyId = user?.active_company_id;
  const canManageConnections = ['owner', 'admin'].includes(user?.role);
  const [connections, setConnections] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transferDetails, setTransferDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [connectionName, setConnectionName] = useState('Import comptable');
  const [objectType, setObjectType] = useState('invoices');
  const [separator, setSeparator] = useState(';');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [activeTransfer, setActiveTransfer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!companyId) return () => { active = false; };

    Promise.all([
      connectRequest('/api/v1/connections', { companyId }),
      connectRequest('/api/v1/transfers', { companyId }),
    ]).then(([connectionPayload, transferPayload]) => {
      if (!active) return;
      const nextConnections = connectionPayload.connections || [];
      setConnections(nextConnections);
      setConnectionId(nextConnections[0]?.id || '');
      setTransfers(transferPayload.transfers || []);
    }).catch((error) => {
      if (active) setErrorMessage(error.message || 'Impossible de charger Sphorix Connect.');
    });

    return () => { active = false; };
  }, [companyId]);

  async function refreshTransfers() {
    const payload = await connectRequest('/api/v1/transfers', { companyId });
    setTransfers(payload.transfers || []);
  }

  async function loadTransferDetails(transferId) {
    setLoadingDetails(transferId);
    setErrorMessage('');
    try {
      const payload = await connectRequest(`/api/v1/transfers/${transferId}`, { companyId });
      setTransferDetails((current) => ({ ...current, [transferId]: payload }));
    } catch (error) {
      setErrorMessage(error.message || 'Impossible de charger le détail du transfert.');
    } finally {
      setLoadingDetails('');
    }
  }

  async function createConnection() {
    if (!connectionName.trim()) {
      setErrorMessage('Donnez un nom à cette connexion.');
      return;
    }

    setBusy(true);
    setBusyLabel('Création de la connexion...');
    setErrorMessage('');
    try {
      const payload = await connectRequest('/api/v1/connections', {
        companyId,
        method: 'POST',
        body: { connector_key: 'file-csv-json', display_name: connectionName.trim() },
      });
      setConnections((current) => [payload.connection, ...current]);
      setConnectionId(payload.connection.id);
    } catch (error) {
      setErrorMessage(error.message || 'La connexion n’a pas pu être créée.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function createPreview() {
    if (!connectionId) {
      setErrorMessage('Créez ou sélectionnez une connexion avant de continuer.');
      return;
    }
    if (!file) {
      setErrorMessage('Sélectionnez un fichier CSV ou JSON.');
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setErrorMessage('Le fichier doit peser entre 1 octet et 50 Mio.');
      return;
    }

    setBusy(true);
    setBusyLabel('Envoi et vérification du fichier...');
    setErrorMessage('');
    setPreview(null);
    setActiveTransfer(null);
    try {
      const upload = await connectRequest('/api/v1/uploads', {
        companyId,
        method: 'POST',
        body: {
          connection_id: connectionId,
          file_name: file.name,
          content_type: file.type || (file.name.toLowerCase().endsWith('.json') ? 'application/json' : 'text/csv'),
          size_bytes: file.size,
        },
      });
      const { error: uploadError } = await supabase.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const payload = await connectRequest('/api/v1/transfers/preview', {
        companyId,
        method: 'POST',
        body: {
          connection_id: connectionId,
          source_path: upload.path,
          object_type: objectType,
          separator,
        },
      });
      setPreview(payload.preview);
    } catch (error) {
      setErrorMessage(error.message || 'Le fichier n’a pas pu être vérifié.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function processTransfer(transferId) {
    setBusy(true);
    setBusyLabel('Traitement des lots...');
    setErrorMessage('');
    try {
      let hasMore = true;
      while (hasMore) {
        const payload = await connectRequest(`/api/v1/transfers/${transferId}/process`, {
          companyId,
          method: 'POST',
          body: {},
        });
        setActiveTransfer(payload.transfer);
        hasMore = payload.has_more;
      }
      setPreview(null);
      await refreshTransfers();
    } catch (error) {
      setErrorMessage(error.message || 'Le traitement est interrompu. Vous pourrez le reprendre depuis l’historique.');
      await refreshTransfers().catch(() => {});
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function confirmTransfer() {
    if (!preview?.id) return;
    setBusy(true);
    setBusyLabel('Préparation du transfert...');
    setErrorMessage('');
    try {
      const payload = await connectRequest('/api/v1/transfers', {
        companyId,
        method: 'POST',
        body: { preview_id: preview.id },
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveTransfer(payload.transfer);
      await processTransfer(payload.transfer.id);
    } catch (error) {
      setErrorMessage(error.message || 'Le transfert n’a pas pu démarrer.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function retryTransfer(transferId) {
    setBusy(true);
    setBusyLabel('Préparation de la reprise...');
    setErrorMessage('');
    try {
      const payload = await connectRequest(`/api/v1/transfers/${transferId}/retries`, {
        companyId,
        method: 'POST',
        body: {},
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveTransfer(payload.transfer);
      await processTransfer(payload.transfer.id);
    } catch (error) {
      setErrorMessage(error.message || 'La reprise n’a pas pu démarrer.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  if (!companyId) {
    return <Card><CardContent className="p-6 text-sm text-slate-600">Sélectionnez une société pour utiliser Sphorix Connect.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connexion de fichiers</CardTitle>
          <CardDescription>Le connecteur disponible importe des factures ou des tiers depuis un fichier CSV ou JSON, après aperçu et validation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Connexion existante
              <select
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Aucune connexion</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.display_name}</option>
                ))}
              </select>
            </label>
            {canManageConnections && (
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Nom d’une nouvelle connexion
                <span className="flex gap-2">
                  <input
                    value={connectionName}
                    onChange={(event) => setConnectionName(event.target.value)}
                    maxLength={120}
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  />
                  <Button type="button" variant="outline" onClick={createConnection} disabled={busy} aria-label="Créer une connexion">
                    <Plus className="h-4 w-4" />
                  </Button>
                </span>
              </label>
            )}
          </div>
          <div className="text-xs text-slate-500">Fichiers privés · 50 Mio maximum</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Préparer un transfert</CardTitle>
          <CardDescription>Aucune donnée métier n’est écrite avant confirmation de l’aperçu.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Type de données
            <select value={objectType} onChange={(event) => { setObjectType(event.target.value); setPreview(null); }} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
              <option value="invoices">Factures</option>
              <option value="third_parties">Clients et fournisseurs</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Fichier CSV ou JSON
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); }}
              className="block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
            />
          </label>
          {file?.name.toLowerCase().endsWith('.csv') && (
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Séparateur CSV
              <select value={separator} onChange={(event) => setSeparator(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                <option value=";">Point-virgule</option>
                <option value=",">Virgule</option>
                <option value="\t">Tabulation</option>
              </select>
            </label>
          )}
          <div className="flex items-end">
            <Button type="button" onClick={createPreview} disabled={busy || !file || !connectionId} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {busy ? busyLabel : 'Analyser le fichier'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Aperçu du transfert</CardTitle>
            <CardDescription>{preview.source_file_name} · les éléments invalides et les doublons ne seront pas importés.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Total', preview.total_count],
                ['Valides', preview.valid_count],
                ['Doublons', preview.duplicate_count],
                ['Invalides', preview.invalid_count],
              ].map(([label, value]) => (
                <div key={label} className="border-l-2 border-slate-300 pl-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-lg font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            {preview.valid_count > 0 ? (
              <Button type="button" onClick={confirmTransfer} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Confirmer l’import des {preview.valid_count} éléments valides
              </Button>
            ) : (
              <p className="text-sm text-amber-800">Aucun élément valide à importer. Corrigez le fichier et relancez l’analyse.</p>
            )}
          </CardContent>
        </Card>
      )}

      {activeTransfer && (
        <div role="status" className="flex items-start gap-3 border-l-4 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{STATUS_LABELS[activeTransfer.status] || activeTransfer.status} · {activeTransfer.written_count || 0} importé(s), {activeTransfer.ignored_count || 0} ignoré(s), {activeTransfer.failed_count || 0} en erreur.</p>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-start gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      <section aria-labelledby="connect-history-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="connect-history-heading" className="text-base font-semibold text-slate-900">Historique des transferts</h3>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => refreshTransfers().catch((error) => setErrorMessage(error.message))} aria-label="Actualiser l’historique">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {transfers.length === 0 ? (
          <p className="border-y border-slate-200 py-5 text-sm text-slate-500">Aucun transfert pour cette société.</p>
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{STATUS_LABELS[transfer.status] || transfer.status}</p>
                  <p className="mt-1 text-xs text-slate-500">{transfer.written_count} importé(s) · {transfer.ignored_count} ignoré(s) · {transfer.failed_count} en erreur</p>
                </div>
                <div className="flex gap-2">
                  {transfer.failed_count > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loadingDetails === transfer.id}
                      onClick={() => loadTransferDetails(transfer.id)}
                    >
                      {loadingDetails === transfer.id ? 'Chargement...' : transferDetails[transfer.id] ? 'Actualiser les erreurs' : 'Voir les erreurs'}
                    </Button>
                  )}
                  {['queued', 'running'].includes(transfer.status) && (
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => processTransfer(transfer.id)}>Reprendre</Button>
                  )}
                  {['failed', 'partially_succeeded'].includes(transfer.status) && (
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => retryTransfer(transfer.id)}>Relancer les erreurs</Button>
                  )}
                </div>
                {transferDetails[transfer.id] && (
                  <ul className="w-full space-y-2 border-t border-slate-100 pt-3 text-sm text-rose-800 sm:basis-full">
                    {(transferDetails[transfer.id].items || [])
                      .filter((item) => ['failed', 'unmapped'].includes(item.status))
                      .map((item) => (
                        <li key={`${item.object_type}-${item.record_number}`}>
                          Ligne {item.record_number} · {item.error_code || item.status}
                          {item.error_details?.field ? ` · Champ : ${item.error_details.field}` : ''}
                        </li>
                      ))}
                    {transfer.failed_count > (transferDetails[transfer.id].items || []).length && (
                      <li className="text-slate-500">Affichage limité aux 100 premières erreurs.</li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-500">Version actuelle : imports CSV/JSON de factures et de tiers. Les connecteurs éditeurs, les exports vers les tiers, la synchronisation automatique et le traitement réglementaire de la facturation électronique ne sont pas encore activés.</p>
    </div>
  );
}