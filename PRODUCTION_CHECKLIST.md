# Checklist de mise en production

Cette checklist couvre les éléments restant à traiter avant de déclarer Sadesk Compta opérationnel en production.

## Frontière Sadesk / Sphorix Connect

- [ ] Commercialisation de Sadesk et Connect différée jusqu’à validation explicite des conceptions, parcours, sécurité, tests et exploitation; le modèle de vente sera défini à ce jalon, sans paiement ni tarification ajoutés avant.
- [x] Définir le contrat de données et la propriété de chaque domaine dans le dépôt autonome `sphorix-connect`.
- [x] Créer le socle API Connect et sa base Supabase locale distincte, avec organisations et authentification propres.
- [x] Définir l’API publique d’import Sadesk et appliquer sa migration locale `0032`.
- [x] Protéger l’API par credentials Sadesk `sds_live_...` scoped, expirables et liés à une seule société.
- [x] API Sadesk publique testée en local pour lots idempotents, imports tiers/factures en brouillon et erreurs paginées.
- [x] Ajouter l’écran Sadesk d’émission/révocation des credentials scoped dans les paramètres société.
- [x] Porter le connecteur CSV/JSON et le moteur de transfert vers le dépôt Connect; tests réels 250+1 avec reprise.
- [ ] Migrer les connexions et exécutions locales avec une procédure de retour arrière.
- [ ] Retirer après bascule les routes, tables et écrans Connect de Sadesk; ne pas appliquer cette suppression en production avant validation de la bascule.

## Validation locale au 17 octobre 2026

- [x] `npm run lint` passe.
- [x] `npm run typecheck` passe.
- [x] `npm run build` passe.
- [x] Suite Vitest : 191 tests réussis; 87 tests d’intégration ignorés faute de cible de test Supabase autorisée.
- [ ] Suite d’intégration Supabase à exécuter sur une cible dédiée : la configuration présente ne fournit que des identifiants Supabase généraux, désormais refusés par le garde-fou.
- [ ] `npm audit --omit=dev --audit-level=high` échoue : 12 vulnérabilités signalées, dont 7 élevées.
- [x] Refonte UI locale compilée : shell, dashboard, états financiers, rapports, écritures, factures et rapprochement.
- [x] Tables métier améliorées : pagination, états vides, skeletons et responsive mobile.
- [ ] Playwright local bloqué au lancement de Chromium par l’absence de `libnspr4.so`; les 7 scénarios n’ont pas atteint l’application.

## Validation locale au 18 octobre 2026

- [x] Démarrer la stack Supabase locale de Sadesk; les conteneurs sont sains sur les ports `54321` à `54324`.
- [x] Réinitialiser uniquement la base locale dédiée et appliquer les migrations `0001` à `0032`, dont `0029` à `0032`.
- [x] Suite d’intégration Supabase : 89 tests réussis dans 7 fichiers, contre la base locale.
- [x] Suite unitaire : 211 tests réussis; lint, typecheck et build passent.
- [x] Les identifiants distants présents dans `.env.test.local` n’ont pas été utilisés; les tests ont reçu temporairement les clés locales.
- [x] Gestion des clés API Sphorix Connect : scopes, expiration, révocation et stockage par empreinte; migration `0031` appliquée localement.
- [x] Pagination des erreurs de transfert par curseur, avec limite de 100 éléments par page.
- [x] Écran de gestion des clés API accessible depuis la navigation Sphorix Connect, réservé aux propriétaires et administrateurs.
- [x] Écran paramètres Sadesk pour émettre et révoquer les credentials `sds_live_...`; le secret brut n’est affiché qu’à la création.
- [ ] `npm audit --omit=dev --audit-level=high` : 12 vulnérabilités, dont 7 élevées.
- [ ] Playwright local toujours bloqué : `libnspr4.so` est absent.

## Validation locale au 19 octobre 2026

- [x] Corriger la clé React du menu Sphorix Connect, qui partageait la clé `ImportExport` avec l’entrée Import / Export FEC.
- [x] Vérifier les 45 routes enregistrées : les 77 références des menus et raccourcis pointent vers une page existante.
- [x] Suite unitaire : 211 tests réussis; lint, typecheck et build validés après mise à jour des dépendances.
- [x] `npm audit --omit=dev --audit-level=high` : aucune vulnérabilité de production détectée; `tailwindcss-animate` est réservé aux dépendances de développement.
- [ ] Tests d’intégration non exécutés : les 89 tests ont été ignorés faute de cible Supabase de test configurée dans cette session.
- [ ] Tests Playwright bloqués avant chargement de l’application : Chromium ne démarre pas car `libnspr4.so` est absent.
- [ ] L’audit incluant les dépendances de développement signale encore 9 vulnérabilités (6 élevées, 3 modérées), dont des dépendances Tailwind sans correctif disponible.
- [x] Scan facture : champs extraits corrigibles avant création; contrôle des montants et des dates.
- [x] Préserver l’absence d’échéance, gérer la TVA à 0 % sans ligne comptable nulle et maintenir l’équilibre des écritures générées.
- [x] Suite unitaire après amélioration du scan : 217 tests réussis; lint ciblé, typecheck et build validés.
- [x] Implémenter la création atomique de la facture scannée et de ses écritures via une fonction SQL transactionnelle.
- [ ] Appliquer la migration locale `0033` et exécuter le test d’intégration qui vérifie le succès et le rollback.
- [x] Unifier sidebar et catalogue autour des mêmes pôles, avec couleurs et icônes cohérentes; toutes les destinations sont couvertes par des tests.
- [x] La recherche globale ouvre directement la facture ou le tiers sélectionné; elle respecte la société active et ouvre les écritures en brouillon.
- [x] Suite unitaire après refonte navigation/recherche : 221 tests réussis; lint, typecheck et build validés.
- [ ] Parcours visuel authentifié non vérifié : l’aperçu n’a pas de session de démonstration disponible.

## P0 - Bloquants de mise en production

### Secrets et configuration

- [ ] Confirmer les secrets GitHub dans `Settings > Secrets and variables > Actions` (non observable depuis ce terminal).
- [ ] Configurer `SUPABASE_PUBLIC_URL`.
- [ ] Configurer `SUPABASE_PUBLISHABLE_KEY`.
- [ ] Configurer `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Configurer `AI_API_KEY`.
- [ ] Configurer `RESEND_API_KEY`.
- [ ] Configurer `EMAIL_FROM` avec un domaine expéditeur vérifié.
- [ ] Configurer `CRON_SECRET`.
- [ ] Vérifier que les secrets ne sont jamais affichés dans les logs.
- [ ] Tester la rotation des secrets selon [SECURITY.md](SECURITY.md).

### Base distante

- [x] Migrations Supabase synchronisées jusqu’à `0028`.
- [ ] Vérifier les tables `0023` à `0027` dans la base distante.
- [ ] Vérifier les policies RLS du module Performance.
- [x] Exécuter un test d’intégration avec au moins deux sociétés (`87/87`).
- [ ] Vérifier les sauvegardes et la restauration sur une base de test.

### CI et navigateur

- [x] CI GitHub configurée.
- [x] La CI installe Chromium avec `npx playwright install --with-deps chromium`.
- [ ] Installer `libnspr4` localement pour exécuter Playwright.
- [ ] Exécuter `npm run test:e2e` localement.
- [ ] Vérifier le job E2E sur GitHub Actions (scénarios ajoutés, dernier workflow en échec ; logs détaillés à consulter dans GitHub).
- [ ] Vérifier visuellement les parcours principaux sur desktop et mobile avec Playwright.

## P1 - Fonctionnalités métier indispensables

### Relances clients

- [x] Relances niveaux 1/2/3 après 7, 30 et 60 jours.
- [ ] Configurer et tester `RESEND_API_KEY`, `EMAIL_FROM` et `CRON_SECRET`.
- [ ] Tester l’envoi réel vers une adresse de référence.
- [ ] Vérifier la déduplication d’une relance déjà envoyée.
- [ ] Vérifier le comportement sans adresse email client.
- [ ] Vérifier l’exécution planifiée du cron.

### IA

- [ ] Configurer `AI_API_KEY` dans un environnement sécurisé.
- [ ] Préparer des documents de référence : facture achat, facture vente, relevé bancaire, justificatif.
- [ ] Tester extraction structurée et validation humaine.
- [ ] Vérifier les formats refusés et les limites de taille.
- [ ] Vérifier le cloisonnement société des documents et chemins de stockage.
- [ ] Vérifier les erreurs fournisseur et l’absence de fuite de données sensibles dans les logs.

### Connexion bancaire et imports planifiés

- [ ] Choisir un agrégateur bancaire compatible avec les pays et banques ciblés.
- [ ] Définir le périmètre des comptes bancaires et consentements.
- [ ] Ajouter le stockage sécurisé des tokens de connexion.
- [ ] Implémenter la synchronisation initiale.
- [ ] Implémenter la synchronisation planifiée et idempotente.
- [ ] Ajouter la gestion des révocations, erreurs et reconnexions.
- [ ] Tester le rapprochement automatique après synchronisation.

### TVA

- [x] TVA calculée selon le plan comptable et le régime configurés.
- [ ] Définir les régimes TVA supportés par pays.
- [ ] Gérer les taux multiples, exonérations, autoliquidation et opérations intracommunautaires.
- [ ] Ajouter la période de déclaration TVA.
- [ ] Calculer TVA collectée, TVA déductible et solde à payer/crédit.
- [ ] Générer les écritures de déclaration TVA.
- [ ] Ajouter contrôles et export de déclaration.
- [ ] Tester les cas nominaux et exceptions avec un expert-comptable.

### Archivage réglementaire

- [ ] Définir la durée de conservation par type de document.
- [ ] Ajouter l’empreinte et l’horodatage des documents archivés.
- [ ] Empêcher la suppression silencieuse des pièces archivées.
- [ ] Ajouter export d’archive lisible et traçable.
- [ ] Ajouter journal des consultations et restaurations.
- [ ] Tester une restauration complète sur environnement isolé.

## P1 - Qualité et validation produit

### Tests React Testing Library

- [ ] Tester `KpiManagement`.
- [ ] Tester `Objectives`.
- [ ] Tester `PerformanceAlerts`.
- [ ] Tester `ActionPlans`.
- [ ] Tester `Costing`.
- [ ] Tester `ForecastScenarios`.
- [ ] Tester `VarianceAnalysis`.
- [ ] Tester les états chargement, erreur, vide et succès.

### Tests Playwright métier

- [x] Scénarios ajoutés pour KPI, objectifs, budgets, écarts et plans d’action (`tests/e2e/performance.spec.js`).
- [ ] Connexion et sélection de société avec un compte E2E GitHub.
- [ ] Création d’un KPI.
- [ ] Création d’un objectif et d’une version.
- [ ] Création d’un budget et vérification d’une version.
- [ ] Analyse d’un écart avec drill-down.
- [ ] Création d’un plan d’action et mesure après action.
- [ ] Parcours import/export.
- [ ] Parcours immobilisation et dotation.
- [ ] Parcours mouvement de stock.
- [ ] Parcours sauvegarde/restauration sur environnement de test.

## P2 - Robustesse et dette technique

### KPI et alertes automatiques

- [x] Implémenter le moteur d’évaluation périodique des KPI personnalisés (`api/evaluate-performance-kpis.js`).
- [x] Enregistrer chaque valeur dans `kpi_values` avec sa période et son snapshot source.
- [x] Déclencher automatiquement les alertes au franchissement des seuils.
- [x] Dédupliquer les alertes KPI ouvertes par société et KPI.
- [x] Relier automatiquement les alertes critiques à un plan d’action.

### Sécurité npm

- [x] Maintenir `xlsx` uniquement dans `devDependencies`, hors du bundle de production.
- [ ] Remplacer `xlsx` ou isoler son exécution si des fichiers Excel entrent dans un futur flux utilisateur.
- [ ] Maintenir `npm audit --omit=dev` à zéro vulnérabilité.
- [ ] Surveiller l’existence d’un correctif maintenu pour `xlsx`.
- [ ] Revoir les dépendances majeures à chaque release.

### Exploitation

- [ ] Ajouter monitoring des erreurs API et cron.
- [ ] Ajouter alertes sur échec de synchronisation bancaire, IA et email.
- [ ] Définir une procédure d’incident et de restauration.
- [ ] Définir une procédure de clôture et de sauvegarde périodique.
- [ ] Documenter les responsabilités d’exploitation.

## Critères de déclaration production

La version peut être déclarée opérationnelle lorsque :

- tous les items P0 sont validés ;
- les parcours IA, email et migrations sont testés sur un environnement réel contrôlé ;
- les tests Playwright métier critiques passent en CI ;
- les tests d’intégration Supabase passent avec cloisonnement multi-sociétés ;
- une sauvegarde et une restauration ont été vérifiées ;
- aucune vulnérabilité de production élevée ou critique n’est présente ;
- les limites connues sont documentées et acceptées.

## Point d’arrêt - 17 octobre 2026

- Branche de travail : `feature/api` dans le dépôt Sadesk Compta.
- Livré aujourd’hui : console Sphorix Connect pour les imports CSV/JSON de factures et de tiers, aperçu avant écriture, traitement/reprise des lots, consultation des 100 premières erreurs et garde-fou empêchant les tests Supabase de viser une base générale.
- Vérifications : lint, typecheck, build et 191 tests Vitest réussis; 87 tests d’intégration ignorés faute de cible de test autorisée.
- Bloqué : Docker n’est pas démarré; Playwright ne peut pas lancer Chromium sans `libnspr4.so`; l’audit npm relève 12 vulnérabilités, dont 7 élevées.
- Reprise : démarrer Docker et Supabase local lors de la prochaine séance, appliquer les migrations sur cette base de test, relancer l’intégration; puis traiter les vulnérabilités et poursuivre les connecteurs, le snapshot multi-entités et les parcours de production Sadesk.

## Point d’arrêt - 18 octobre 2026

- Branche de travail : `feature/api` dans le dépôt Sadesk Compta; aucun changement applicatif ni commit effectué.
- Docker et Supabase local Sadesk sont démarrés; l’instance Supabase précédente `lebondjassa` a été arrêtée avec ses volumes conservés. Son conteneur Postgres autonome sur le port `5433` est resté actif.
- Migrations locales `0001` à `0031` appliquées; tests unitaires : 200/200 et tests d’intégration : 87/87 réussis.
- `.env.test.local` contient toujours des variables Supabase générales distantes; les tests ont utilisé des variables `SUPABASE_TEST_*` temporaires et des clés locales.
- Sphorix Connect : clés API limitées par scopes, empreinte SHA-256, expiration et révocation; erreurs de transfert paginées par curseur.
- Prochaine étape produit : choisir un fournisseur pilote, vérifier sa documentation officielle et cadrer le périmètre source avant de développer l’adaptateur.
- Qualité restante : traiter les vulnérabilités npm et installer `libnspr4` pour lancer Playwright.

## Point d’arrêt - 20 octobre 2026

- Vérifications locales : 221 tests unitaires réussis; lint, typecheck et build réussis.
- Les 91 tests d’intégration sont ignorés, car aucune cible Supabase de test n’est configurée dans cette session.
- Docker n’est pas accessible dans le WSL courant; Supabase local et la recette authentifiée restent à faire. Aucun environnement distant n’a été utilisé.
- Ajout de la migration `0033_scanned_invoice_atomic_create.sql`, utilisée par le scan pour créer facture et écritures dans une même transaction; le test de succès et de rollback est ajouté mais non exécuté contre PostgreSQL.
- Étape suivante : rétablir Docker, appliquer les migrations sur Supabase locale isolée, puis exécuter les 91 tests d’intégration et contrôler la fonction de transaction.
