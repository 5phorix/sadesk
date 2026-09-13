# Checklist de mise en production

Cette checklist couvre les éléments restant à traiter avant de déclarer Sadesk Compta opérationnel en production.

## P0 - Bloquants de mise en production

### Secrets et configuration

- [ ] Confirmer les secrets GitHub dans `Settings > Secrets and variables > Actions`.
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
- [ ] Vérifier le job E2E sur GitHub Actions (scénarios ajoutés, dernier workflow en échec à diagnostiquer).

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

- [ ] Remplacer ou isoler `xlsx` dans un environnement d’exécution séparé.
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
