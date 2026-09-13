# Architecture Sadesk Compta

## Flux fonctionnel

1. **Collecter** : documents, factures, relevés et imports CSV/JSON.
2. **Comptabiliser** : écritures brouillon, validation humaine, FEC et à-nouveaux.
3. **Contrôler** : doublons, comptes inconnus, pièces déséquilibrées, impayés, rapprochement bancaire, stocks et clôtures.
4. **Analyser** : produits, charges, résultat, trésorerie, BFR et tendances mensuelles.
5. **Aider à décider** : recommandations déterministes, toujours accompagnées de leur justification et d’un lien vers l’action.

## Organisation technique

- `src/pages` contient les écrans métier.
- `src/components` contient les composants réutilisables et les hooks de données société.
- `src/lib` contient les règles pures testables : comptabilité, FEC, TVA, amortissements, stocks et transferts.
- `api` contient les handlers serveur : IA, notifications, relances et rapprochement bancaire.
- `supabase/migrations` contient le schéma, les contraintes et les politiques RLS.
- `tests/unit`, `tests/integration` et `tests/e2e` couvrent respectivement les règles pures/UI, la base Supabase et le navigateur.

## Noyau Performance

La migration `0023_performance_management_core.sql` introduit les entités configurables du module : périodes, définitions et valeurs de KPI, objectifs, alertes et plans d’action. Elles restent rattachées à `company_id`, soumises à RLS et séparées des données sources. Les calculs doivent conserver un instantané de leurs sources et leur période pour permettre l’explication et l’historisation.

## Cloisonnement et validation

Toutes les requêtes métier filtrent `company_id`. Les écritures générées sont créées en brouillon ; la validation passe par les règles comptables et verrouille ensuite la pièce. Les fonctions serveur vérifient le jeton utilisateur, l’appartenance à la société et les rôles requis.

## Déploiement

La CI exécute `npm ci`, lint, typecheck, tests unitaires, build, intégration Supabase conditionnelle et Playwright avec Chromium et ses dépendances Linux.
