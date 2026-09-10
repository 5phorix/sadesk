# Tests d'intégration

Ces tests vérifient, sur une **vraie base Supabase**, deux garanties critiques :

- **Isolation multi-sociétés** : un utilisateur ne peut ni lire, ni écrire, ni modifier
  les données d'une société à laquelle il n'appartient pas.
- **Permissions par rôle** : comportement réel de `viewer`, `accountant`, `admin`, `owner`.
- **Intégrité comptable** : contraintes SQL sur les montants et validation des écritures équilibrées.

## Prérequis

> N'utilisez **jamais** votre base de production : les tests créent et suppriment des
> utilisateurs, des sociétés et des écritures.

1. Démarrer une instance locale (`supabase start`) ou créer un projet Supabase dédié.
2. Appliquer les migrations : `supabase db push`.
3. Créer un fichier `.env.test.local` à la racine :

```
SUPABASE_TEST_URL=http://127.0.0.1:54321
SUPABASE_TEST_ANON_KEY=...
SUPABASE_TEST_SERVICE_ROLE_KEY=...
```

## Exécution

```
npm run test:integration
```

Si les variables ne sont pas définies, les suites sont automatiquement ignorées
(`describe.skipIf`) afin de ne pas casser la CI.

## Nettoyage

Chaque suite supprime ses fixtures dans `afterAll` (`cleanupFixtures`). La suppression
d'une société entraîne en cascade celle de ses écritures, factures et rattachements.
