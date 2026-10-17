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

Les tests refusent les variables generales `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` comme cible. Une base distante dediee exige aussi `SUPABASE_TEST_ALLOW_REMOTE=true` et `SUPABASE_TEST_PROJECT_REF` avec le project ref correspondant exactement a l'hote `https://<project-ref>.supabase.co`. Ne configurez jamais une base de production comme cible de test.

## Exécution

```
npm run test:integration
```

Si les variables ne sont pas définies, les suites sont automatiquement ignorées
(`describe.skipIf`) afin de ne pas casser la CI.

## Nettoyage

Chaque suite supprime ses fixtures dans `afterAll` (`cleanupFixtures`). La suppression
d'une société entraîne en cascade celle de ses écritures, factures et rattachements.
