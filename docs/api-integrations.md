# Sphorix Connect — API d'integration

## Objectif

Connecter progressivement Sadesk Compta aux logiciels et plateformes cites dans la liste de reference `Sphorix-france/docs/liste_pa_attente_rapport_audit.pdf`, sans promettre un connecteur par nom commercial avant verification de son interface technique. Cette liste identifie des fournisseurs, pas leurs protocoles, leurs API disponibles ou leurs conditions d'acces. Son statut et sa date doivent etre verifies avant toute communication commerciale.

L'API doit pouvoir accueillir des integrations independantes et composer des transferts de donnees avec validation, suivi, explication des erreurs et reprise sans doublons.

L'objectif produit final est la recuperation complete des donnees accessibles d'une source pour le perimetre annonce : historique, objets, relations, statuts et pieces jointes lorsque la source les expose. Une execution ne peut pas etre declaree complete si des lignes ont ete omises, rejetees ou tronquees sans signalement. Les limites d'acces du fournisseur sont declarees; une source qui ne permet ni API complete ni export complet ne peut pas etre vendue comme recuperation automatique totale.

## Constat dans la base actuelle

- L'application est une SPA Vite hebergee avec des handlers serverless dans `api/` et Supabase pour l'authentification et les donnees.
- `src/lib/data-transfer.js` parse et serialise CSV/JSON; `src/pages/ImportExport.jsx` valide puis insere les lignes directement depuis le navigateur.
- Les handlers serverless existants implementent chacun un cas metier; il n'y a pas de registre de connecteurs ni de cycle de vie commun des transferts.
- `audit_logs` trace les changements de lignes metier. Il ne remplace pas l'historique operationnel d'un import, d'une synchronisation ou d'une livraison webhook.

## Architecture cible

### Noyau commun

1. **Registre des connecteurs** : identifiant stable, editeur, protocoles, capacites (lecture/ecriture, objets, pieces jointes), exigences d'authentification et etat de disponibilite.
2. **Connexion par entreprise** : fournisseur, statut, configuration non sensible, reference vers les secrets, date du dernier test et dernier echange reussi. Toutes les lignes sont cloisonnees par `company_id`.
3. **Adaptateurs** : contrat commun pour tester une connexion, decouvrir ou lire des donnees, convertir vers le modele canonique, envoyer des donnees et classer les erreurs. Les details propres a un editeur restent dans son adaptateur.
4. **Moteur de transfert** : inventaire du perimetre, apercu et validation avant ecriture, extraction paginee avec curseurs/checkpoints, ordre des dependances, traitement en lots, dedoublonnage, reconciliation des volumes et reprise des seuls elements en echec.
5. **Supervision** : historique consultable par entreprise, fournisseur, sens, periode et statut; compteurs recus/valides/crees/ignores/en erreur et detail actionnable des erreurs.

Un connecteur concret ne sera declare compatible qu'apres verification de la documentation officielle, du mode d'authentification, des limites, du sandbox et des droits d'acces. Les noms de la liste de reference ne sont pas des contrats d'API.

Pour chaque connecteur, un manifeste declare les entites disponibles, la profondeur d'historique, les relations, les pieces jointes, les statuts, les possibilites d'extraction totale ou incrementale et les limites connues. Une extraction totale suit un snapshot jusqu'a la fin de chaque entite, conserve ses curseurs de reprise, puis rapproche les volumes source, lus, transformes et ecrits. La synchronisation incrementale ne demarre qu'apres validation du snapshot initial.

### Definition de la recuperation complete

La completude est evaluee pour une entreprise source, une plage historique et une liste d'entites explicites, autorisees au demarrage de l'execution.

- Parcourir toutes les pages et tous les lots jusqu'a la fin signalee par la source; conserver les curseurs et reprendre apres interruption sans recommencer les lots termines.
- Capturer les enregistrements et fichiers source dans une zone d'archive privee, chiffree et soumise a une politique de retention. Chaque fichier conserve sa taille et son empreinte; les champs source inconnus ne sont pas jetes pendant le mapping.
- Reconstituer les relations avec les identifiants externes, dans l'ordre necessaire, et enregistrer les references aux pieces jointes.
- Rapprocher les nombres annonces par la source, lus, archives, transformes et ecrits. Si la source ne fournit pas de compte total, la fin de pagination et l'absence d'erreur doivent etre etablies pour chaque entite.
- Distinguer `complete`, `complete_with_exceptions`, `partial` et `failed`. Une exception ou un objet non mappe est visible et explique; il n'est jamais assimile a une reussite silencieuse.

La conservation brute sert a eviter la perte d'information quand Sadesk ne possede pas encore d'objet cible. Elle ne remplace pas le mapping metier, ne rend pas les donnees non accessibles recuperables et ne doit pas etre active sans definir les controles d'acces, la duree de retention et la suppression demandee.

### Inventaire initial du modele cible Sadesk

Cet inventaire est le point de depart des mappings, extrait des migrations existantes; il ne limite pas les objets que les sources peuvent exposer.

| Domaine | Entites Sadesk existantes | Point de vigilance |
| --- | --- | --- |
| Societe et referentiels | `companies`, `fiscal_years`, `accounts`, `accounting_plan_catalog`, `third_parties`, `cost_centers` | Identifiants, plans comptables, periodes et dependances doivent etre relies avant les transactions. |
| Ventes, achats et comptabilite | `invoices`, `accounting_entries`, `lettering_sequences`, `receivable_followups` | `invoices` n'a pas de lignes; aucune validation comptable automatique. |
| Tresorerie et banque | `bank_statements`, `bank_transactions` | Preserver identifiants de releve, operations, rapprochements et soldes lorsque disponibles. |
| Budgets et clotures | `budgets`, `budget_lines`, `monthly_closings`, `management_settings` | Distinguer les parametres importables des valeurs calculees ou cloturees. |
| Immobilisations et stocks | `fixed_assets`, `fixed_asset_depreciations`, `fixed_asset_impairments`, `stock_items`, `stock_movements`, `stock_impairments` | Respecter l'ordre parent/enfant et ne pas recalculer ou comptabiliser silencieusement l'historique. |
| Performance | `performance_periods`, `kpi_definitions`, `kpi_values`, `performance_objectives`, `performance_objective_versions`, `performance_alerts`, `performance_action_plans`, `performance_budget_versions`, `performance_costing_calculations` | Separer definitions, mesures historisees et resultats recalculables; garder leurs sources si disponibles. |
| Documents et activite | `documents`, stockage de fichiers, `tasks` | Migrer contenu, metadonnees et liens; appliquer une politique de retention aux fichiers. |
| Administration et audit | `profiles`, `company_users`, `roles`, `notifications`, `notification_settings`, `audit_logs` | Ne jamais importer identites, roles, secrets ou journaux sans mapping, autorisation et decision de retention explicites. |

Les entites source qui ne correspondent a aucune entite Sadesk restent conservees dans l'archive de migration avec leur provenance et sont listees comme non mappees. Le rapport ne declare pas la migration metier complete tant qu'elles n'ont pas ete mappees, exclues explicitement par le client, ou classees comme donnees techniques hors perimetre.

Le contrat de Sphorix Connect est defini avant l'etude des API tierces. Les interfaces des fournisseurs sont ensuite traitees comme des details d'adaptation; l'absence d'API chez un fournisseur ne bloque pas son integration si un autre canal fiable est disponible.

### Types de connecteurs

- API fournisseur (REST ou autre protocole officiellement documente), avec authentification et pagination gerees par l'adaptateur.
- Webhooks entrants, verifies par signature, dedoublonnes et traites de maniere repetable.
- Echanges de fichiers (formats structures valides, depot/retrait securise) comme voie d'interoperabilite lorsque l'API directe n'est pas disponible.
- Connecteur generique configurable uniquement pour des protocoles et destinations autorises; aucune URL arbitraire fournie par un utilisateur ne doit etre appelee par le serveur.

Les formats et profils de facturation electronique seront listes dans une matrice de compatibilite apres validation normative et technique; ils ne doivent pas etre supposes interchangeables.

## Contrat API propose

Les routes versionnees restent sous `/api/v1/` et repondent en JSON avec un `request_id` stable pour le support. Le contrat public est exprime en objets Sphorix Connect; les formats propres aux fournisseurs sont convertis par leurs adaptateurs.

- `GET /api/v1/connectors` : catalogue des connecteurs et capacites, sans exposer de secret.
- `GET /api/v1/connections` et `POST /api/v1/connections` : lister et creer les connexions de l'entreprise autorisee.
- `POST /api/v1/connections/{connection_id}/test` : tester la connexion et ses capacites accessibles.
- `POST /api/v1/uploads` : obtenir une URL signee pour un fichier CSV/JSON dans l'archive privee.
- `POST /api/v1/transfer-previews` : analyser une source et retourner validations, correspondances, doublons et avertissements sans ecriture metier.
- `POST /api/v1/transfers` : confirmer un apercu, creer une execution et retourner `202 Accepted`; le traitement long ne reste pas dans une requete HTTP synchrone.
- `POST /api/v1/transfers/{transfer_id}/process` : traiter au plus 250 enregistrements et retourner `has_more`; l'appelant repete la requete jusqu'a l'etat terminal. Un lease en base empeche deux lots concurrents et expire pour autoriser la reprise apres panne.
- `GET /api/v1/transfers/{transfer_id}` : statut, compteurs et erreurs lisibles.
- `GET /api/v1/transfers/{transfer_id}/items` : resultat pagine par element.
- `POST /api/v1/transfers/{transfer_id}/retries` : creer une execution fille pour les seuls echecs classes recuperables; l'execution initiale reste inchangee.
- `POST /api/v1/webhooks/{connector_id}` : recevoir les notifications fournisseur avec verification propre au connecteur.

Les mutations exigent une authentification utilisateur ou fournisseur explicite, une autorisation sur l'entreprise et une validation stricte des entrees. Le serveur ne fait confiance ni au `company_id` seul fourni dans le corps, ni au seul `company_id` selectionne dans le navigateur.

### Exemple de contrat de transfert

Creation d'un apercu :

```json
{
	"connection_id": "uuid",
	"object_type": "invoice",
	"direction": "inbound",
	"source": { "type": "file", "file_id": "uuid" },
	"options": { "duplicate_policy": "skip" }
}
```

Reponse d'aperçu :

```json
{
	"request_id": "uuid",
	"preview": {
		"id": "uuid",
		"expires_at": "2026-10-11T12:00:00Z",
		"summary": { "total": 120, "valid": 116, "duplicates": 3, "invalid": 1 },
		"warnings": [],
		"errors": [{ "code": "INVALID_DATE", "item": 18, "field": "issue_date" }]
	}
}
```

Confirmation d'un apercu valide :

```http
POST /api/v1/transfers
Idempotency-Key: client-generated-unique-key
```

```json
{
	"preview_id": "uuid"
}
```

La reponse `202 Accepted` contient `request_id` et `transfer: { id, status: "queued", created_at }`. Une cle d'idempotence repetee avec la meme requete retourne la meme execution; sa reutilisation avec un contenu different est rejetee.

Les erreurs partagent l'enveloppe `{ "request_id": "uuid", "error": { "code": "...", "message": "...", "retryable": false } }`. Les details internes, traces techniques, secrets et donnees comptables brutes ne sont jamais retournes au client.

### Cycle de vie d'une execution

- Execution : `queued` -> `running` -> `succeeded`, `partially_succeeded` ou `failed`; `queued` peut aussi devenir `cancelled` si l'annulation est prise en charge avant le demarrage.
- Element traite : `written`, `ignored`, `failed` ou `unmapped`; chaque erreur porte un code stable et, si pertinent, le champ concerne. L'aperçu distingue `valid`, `duplicate` et `invalid` avant l'execution.
- Une reprise cree une nouvelle execution liee a l'original et ne rejoue que les elements recuperables. Chaque element est dedoublonne par connexion, objet source et cle externe, pas seulement par numero de ligne.
- Les apercus expirent et sont lies a leur entreprise, connexion, contenu source et version de mapping; toute modification invalide l'apercu.

Pour le connecteur fichier v1, l'appelant pilote les lots en repetant `POST /api/v1/transfers/{transfer_id}/process` tant que `has_more` vaut `true`. Chaque appel traite au plus 250 lignes et prend un lease en base; un lease expire apres trois minutes pour permettre la reprise. Les adaptateurs fournisseur pourront utiliser un worker serveur si leur mode de pagination ou leur volume le necessite.

### Authentification par acteur

- Utilisateur de Sadesk : jeton de session et role actif dans l'entreprise; l'entreprise est derivee et autorisee cote serveur.
- Connecteur fournisseur : secrets par connexion, jamais renvoyes apres creation ni stockes dans une configuration JSON lisible par les utilisateurs.
- Webhook : signature ou mecanisme officiel, horodatage et identifiant d'evenement unique; echec de verification rejete avant toute mutation.
- Client API tiers : identifiants scopes et revocables par entreprise; ne pas reutiliser la cle `service_role` Supabase comme cle d'API.

### Perimetre propose pour v1

- Sens prioritaire : import vers Sadesk et export depuis Sadesk, avec apercu, validation et historique.
- Factures et tiers sont le premier vertical slice, pas le perimetre final. La v1 doit prouver un snapshot complet sur le perimetre d'une source de test, puis elargir l'inventaire des objets. Les ecritures comptables ne sont jamais validees implicitement.
- Canal initial : fichier CSV/JSON prive de 50 Mio maximum pour le premier vertical slice. Il doit representer un export complet; les imports fichier acceptent un snapshot, pas encore les synchronisations incrementales. Les fournisseurs plus volumineux passeront par des adaptateurs pagines.
- Le modele actuel des factures ne contient pas de lignes de facture. Cette v1 valide les echanges de donnees d'en-tete et ne doit pas etre presentee comme une solution conforme de reception/envoi reglementaire.
- Les pieces jointes, les statuts officiels et les formats legaux ne sont inclus qu'apres definition et validation de leurs exigences propres.

Chaque connecteur publie sa couverture par entite et periode. Le terme « recuperation complete » s'applique uniquement aux donnees exposees et autorisees dans ce perimetre; toute donnee non exportable, illisible ou non prise en charge est visible comme une lacune, jamais masquee derriere un statut de succes.

### Objets canoniques proposes pour v1

Les payloads utilisent des noms de champs stables, independants des colonnes de Sadesk et des noms de champs des fournisseurs. Les montants sont des chaines decimales avec deux decimales pour eviter les erreurs d'arrondi binaires; les dates sont au format ISO `YYYY-MM-DD`.

Facture :

```json
{
	"external_id": "provider-invoice-7842",
	"invoice_number": "FAC-2026-0042",
	"direction": "inbound",
	"issue_date": "2026-10-10",
	"due_date": "2026-11-09",
	"currency": "EUR",
	"tax_rate": "20.000",
	"counterparty": {
		"external_id": "provider-party-51",
		"role": "supplier",
		"name": "Fournisseur Exemple",
		"siret": "12345678901234",
		"vat_number": "FR00123456789"
	},
	"totals": { "net": "100.00", "tax": "20.00", "gross": "120.00" }
}
```

Correspondance initiale avec Sadesk : `direction=inbound` vers `invoices.type=fournisseur`, `outbound` vers `client`; `issue_date` vers `date`; les totaux vers `amount_ht`, `amount_tva` et `amount_ttc`; la contrepartie vers `third_parties` et `third_party_id`. L'API rejette les directions ou devises non prises en charge et ne valide jamais une facture importee automatiquement.

Tiers : `external_id`, `role` (`customer` ou `supplier`), `name`, `contact_name`, `email`, `phone`, adresse structuree, identifiants d'entreprise (`siret`, `siren`, `vat_number`), `payment_terms` et `account_code`. `role` se mappe vers les types locaux `client` et `fournisseur`; les champs absents restent absents au lieu d'etre inventes.

Pour une connexion editeur, `external_id` identifie un objet chez ce fournisseur. Les imports fichier sans identifiant externe utilisent les cles de doublon deja connues (numero de facture ou code du tiers) et signalent les collisions dans l'apercu; un numero de ligne ne sert jamais d'identifiant durable. Les changements d'identite d'un objet lie doivent etre resolus dans l'apercu et ne remplacent pas silencieusement une autre fiche.

## Donnees et fiabilite

Prevoir des tables dediees, soumises a RLS et indexees par `company_id` :

- `integration_connections` : entreprise, connecteur, statut et configuration non sensible;
- `integration_previews` : reference vers le fichier archive prive, empreinte et compteurs;
- `integration_preview_items` : lignes normalisees privees au client, statuts et erreurs par ligne; staging conserve tant qu'une execution comporte des exceptions;
- `integration_runs` : connexion, direction, type d'objet, statut, cles d'idempotence, compteurs, dates, erreur resumee et demandeur;
- `integration_run_scopes` : execution et entite, statut, curseur/checkpoint, nombre annonce par la source, lus, transformes, ecrits, ignores et en erreur, plus resultat de reconciliation;
- `integration_run_items` (si le volume et le besoin de detail le justifient) : reference source, resultat et erreur par element, sans dupliquer inutilement les donnees personnelles;
- `integration_object_links` : `company_id`, `connection_id`, `object_type`, `direction`, `external_id`, `local_record_id`, date de derniere synchronisation; contrainte unique sur la connexion, l'objet, le sens et l'identifiant externe;
- `webhook_receipts` : fournisseur, identifiant d'evenement unique, date de reception, statut de traitement et nombre de tentatives.

Les secrets sont conserves hors des colonnes de configuration ordinaires, via un stockage de secrets adapte au deploiement. Les journaux ne contiennent ni jetons, ni contenu comptable sensible. Les politiques RLS et fonctions privilegiees doivent etre testees pour empecher toute lecture ou ecriture inter-entreprises.

Chaque transfert doit etre idempotent : une nouvelle tentative ou la livraison repetee d'un webhook ne cree pas de doublons. Les erreurs sont classees (authentification, limitation, validation, temporaire, definitive); les erreurs temporaires utilisent une reprise bornee avec delai progressif. Les ecritures comptables restent en brouillon et ne sont jamais validees implicitement.

## Decoupage de realisation

1. Concevoir le contrat de Sphorix Connect sans dependre d'un fournisseur : objets canoniques, endpoints, authentification, droits par entreprise, apercu, executions, erreurs, idempotence et reprise.
2. Prototyper le noyau et un connecteur fichier de bout en bout pour valider ce contrat avec un vrai scenario metier.
3. Etudier ensuite chaque fournisseur de la liste : documentation officielle, API et acces partenaire, protocoles alternatifs, formats, sandbox, limites et date de verification.
4. Classer chaque fournisseur selon son canal disponible : API directe, webhook, transfert securise de fichiers, format d'echange standard valide, ou non connectable automatiquement a ce stade.
5. Ajouter des adaptateurs au contrat de Sphorix Connect pour les fournisseurs prioritaires; les details de leur API ne doivent pas modifier le modele canonique.
6. Tester chaque adaptateur en conditions realistes : interruption, doublon, erreur lisible, reprise et resultat dans le logiciel de destination.

Ne pas fixer le mot « majorite » a un simple nombre de noms. Suivre separement le nombre de fournisseurs techniquement compatibles, les objets/cas couverts et la part des entreprises cibles couverte. Toute promesse de couverture attend la matrice verifiee.

## Criteres d'acceptation du premier connecteur

- Un administrateur peut configurer et tester la connexion sans exposer ses secrets.
- L'utilisateur peut previsualiser les donnees, les correspondances, les erreurs et les doublons avant execution.
- L'execution est visible avec un resultat par entite et par element, des compteurs source/lus/ecrits et un historique consultable.
- Rejouer une execution ne duplique pas les donnees; une erreur temporaire peut etre reprise sans refaire les elements reussis.
- Un utilisateur d'une entreprise ne peut ni consulter ni relancer les transferts d'une autre entreprise.
- Le snapshot atteint la fin de toutes les entites annoncees; les volumes source, lus et ecrits sont rapproches, ou tout ecart bloque la declaration de completude et est explique.
- Les relations et fichiers declares disponibles sont conserves; une interruption puis reprise ne perd ni ne duplique d'elements.
- Le scenario est valide de bout en bout avec un environnement de test fournisseur et un critere mesurable de temps gagne.

## Checklist d'implementation

### Fait sur `feature/api`

- [x] Ajouter le catalogue API versionne et le connecteur fichier CSV/JSON.
- [x] Authentifier les utilisateurs et verifier leur role actif dans la societe cote serveur.
- [x] Stocker les exports dans un bucket prive avec des URLs d'upload signees.
- [x] Previsualiser factures et tiers, valider les champs, devises, montants et doublons, puis garder un resume et les erreurs par ligne.
- [x] Creer des executions idempotentes, suivre leur progression par entite et traiter 250 lignes maximum par appel avec lease et checkpoint.
- [x] Relier les objets aux identifiants externes et reprendre les erreurs classees recuperables dans une execution fille.
- [x] Garder les imports comptables en brouillon; ne jamais valider une ecriture implicitement.
- [x] Ajouter des tests unitaires de parsing/validation et valider le flux SQL tiers -> facture dans une transaction annulee.
- [x] Verifier lint, typecheck, build et les 183 tests unitaires.

### Reste a faire

- [ ] Construire l'interface Sadesk pour configurer une connexion, envoyer un export, suivre l'apercu/progression et resoudre les exceptions.
- [ ] Definir l'authentification des clients API tiers (scopes, creation/revocation, rotation); actuellement les routes d'edition utilisent une session Sadesk.
- [ ] Etendre la recuperation au catalogue complet des objets source et orchestrer un snapshot multi-entites avec dependances et relations.
- [ ] Ajouter les adaptateurs editeur par editeur apres verification des API, acces partenaires, formats, quotas et environnements de test.
- [ ] Gerer les exports depassant 50 Mio, les extractions API paginees et les synchronisations incrementales.
- [ ] Etendre le modele cible, notamment les lignes de facture, les pieces jointes et les donnees manquantes, avant toute promesse de migration integrale ou de conformite reglementaire.
- [ ] Definir les regles d'update/fusion des objets deja presents et le traitement des erreurs non recuperables.
- [ ] Definir la retention/suppression des archives brutes et du staging restant apres une execution avec exceptions.
- [ ] Faire tourner les tests d'integration RLS/API avec un endpoint Supabase de test joignable, puis valider les routes Vercel et un fournisseur sandbox.

Les migrations 0029/0030 sont presentes dans la branche et ont ete testees dans une transaction PostgreSQL annulee; elles ne sont pas appliquees a la base locale, qui etait en retard a la migration 0017. `npm test` lance les tests d'integration mais echoue sur `fetch failed` vers Supabase dans l'environnement courant; les tests unitaires passent.