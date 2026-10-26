# API publique Sadesk pour les integrations

Statut : v1 locale, migration `0032_sadesk_public_integration_api.sql` et handlers serverless. Cette API est une frontiere publique; les tables et procedures internes ne sont pas son contrat client.

## Authentification

Un administrateur ou proprietaire de la societe emet une cle par `POST /api/v1/integration/clients` avec une session Sadesk.

```json
{
  "company_id": "uuid-de-la-societe-active",
  "name": "Sphorix Connect",
  "scopes": ["imports:read", "imports:write"],
  "expires_in_days": 90
}
```

La cle `sds_live_...` est retournee une seule fois. Sadesk ne conserve que SHA-256, prefixe, scopes et expiration. La liste masque le secret; la revocation requiert une session Sadesk `owner/admin`. Le credential machine est lie a une seule societe, revoquable et expire dans un maximum de 365 jours.

Une requete machine utilise `Authorization: Bearer sds_live_...`. Le serveur derive la societe depuis l'empreinte de la cle; un `company_id` dans la requete ne peut pas changer ce perimetre. Les roles utilisateur et sessions Connect ne sont jamais reutilises.

## Endpoints

### Creer / lister / revoquer les credentials

- `GET /api/v1/integration/clients?company_id=...` - session Sadesk owner/admin.
- `POST /api/v1/integration/clients` - session Sadesk owner/admin; le secret brut n'est retourne qu'a cette creation.
- `DELETE /api/v1/integration/clients/{client_id}?company_id=...` - session Sadesk owner/admin.

Scopes : `imports:write` et `imports:read`.

### Importer un lot

`POST /api/v1/integration/import-batches`, scopes `imports:write`, entete `Idempotency-Key` requise. Un lot contient 1 a 250 objets.

```json
{
  "source_system": "sphorix-connect",
  "source_connection": "uuid-ou-identifiant-stable",
  "records": [
    {
      "object_type": "third_parties",
      "external_id": "provider-party-51",
      "payload": {
        "role": "supplier",
        "name": "Fournisseur Exemple",
        "siret": "12345678901234"
      }
    },
    {
      "object_type": "invoices",
      "external_id": "provider-invoice-7842",
      "payload": {
        "invoice_number": "FAC-2026-0042",
        "direction": "inbound",
        "issue_date": "2026-10-10",
        "due_date": "2026-11-09",
        "currency": "EUR",
        "tax_rate": "20.000",
        "counterparty": {
          "external_id": "provider-party-51",
          "name": "Fournisseur Exemple"
        },
        "totals": { "net": "100.00", "tax": "20.00", "gross": "120.00" }
      }
    }
  ]
}
```

Les tiers doivent apparaitre avant les factures qui les referencent, ou deja etre connus pour la meme source et la meme connexion. Une reference inconnue rejette la requete avant creation du lot. Les factures sont toujours creees en brouillon; cette API ne cree pas de lignes de facture et ne valide aucune ecriture comptable.

Le meme `Idempotency-Key` avec le meme contenu retourne le lot existant sans reexecution. Reutiliser la cle avec un contenu different retourne `409 IDEMPOTENCY_KEY_REUSED`. Les identifiants externes stables empechent un doublon entre lots.

Les payloads bruts ne sont ni stockes dans les tables d'execution ni journalises. Le RPC SQL en service-role cree les objets et n'enregistre que l'identite source, le checksum, le resultat par ligne et les codes d'erreur.

### Consulter le lot et ses resultats

- `GET /api/v1/integration/import-batches/{batch_id}` - scope `imports:read`.
- `GET /api/v1/integration/import-batches/{batch_id}/items?limit=100&cursor=...` - scope `imports:read`; `limit` accepte de 1 a 100.

Les erreurs utilisent `{ request_id, error: { code, message, retryable } }`. Les details internes, credentials, payloads complets et donnees comptables ne sont jamais retournes.

## Etat et limites initiales

- Fait : autorisation machine deduite de la cle et de la societe; tables privees RLS; lots idempotents; imports de tiers et d'en-tetes de facture; factures en brouillon; erreurs paginees.
- Non pris en charge : lignes de facture, mise a jour de fiche existante, validation comptable, imports d'ecritures, attachments, reprise selective par `retryable`.
- A faire avant production : creation UI des credentials Sadesk, verification de signatures/quotas/observabilite, tests de contrat dans la CI et validation explicite des limits avec les consommateurs.
- La migration `0032` est appliquee uniquement sur la base Supabase locale; aucune base distante n'a ete modifiee.
