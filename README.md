**SADESK Compta**

Application de comptabilité multi-sociétés (React + Vite + Supabase).

**Prérequis**

1. Cloner le dépôt
2. `npm install`
3. Créer un fichier `.env.local` :

```
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon
```

4. `npm run dev`

**Variables d'environnement serveur** (endpoints `api/`, jamais exposées au navigateur) :

```
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_cle_anon
SUPABASE_SERVICE_ROLE_KEY=votre_cle_service_role
AI_API_KEY=cle_du_fournisseur_llm
AI_BASE_URL=https://api.openai.com/v1   # optionnel
AI_MODEL=gpt-4o-mini                    # optionnel
```

**Base de données**

Les migrations se trouvent dans `supabase/migrations/`. Appliquez-les avec :

```
supabase db push
```

Pour appliquer les migrations sur un projet distant, authentifiez puis liez la CLI :

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Pour activer le job d'intégration GitHub, créez les trois secrets dans les paramètres du dépôt. La commande `gh secret set` demande chaque valeur de façon masquée :

```bash
gh auth login
gh secret set SUPABASE_PUBLIC_URL
gh secret set SUPABASE_PUBLISHABLE_KEY
gh secret set SUPABASE_SERVICE_ROLE_KEY
```

Les tests locaux lisent ces noms depuis `.env.test.local`, qui ne doit jamais être commitée. `SUPABASE_SECRET_URL` reste accepté comme alias d'URL, mais une URL n'est pas une clé secrète.

**Scripts**

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | Analyse ESLint |
| `npm run typecheck` | Vérification de configuration JSX et des modules |
| `npm run test` | Tests unitaires (Vitest) |
| `npm run test:unit` | Tests unitaires autonomes, dont le smoke test RTL |
| `npm run test:integration` | Tests d'isolation multi-sociétés et de rôles (nécessite une base Supabase de test) |
| `npm run test:e2e` | Smoke test navigateur Playwright |

Le projet est en JavaScript/JSX : `npm run typecheck` vérifie la résolution des modules et la compilation JSX. ESLint porte les diagnostics JavaScript (`npm run lint`).

Voir [SECURITY.md](SECURITY.md) pour l'isolement de `xlsx`, l'audit npm et la vérification des secrets GitHub.

Voir [ARCHITECTURE.md](ARCHITECTURE.md) pour les niveaux produit, les responsabilités des modules et les règles de cloisonnement.

**Tests d'intégration**

Ils vérifient le cloisonnement des données entre sociétés et les permissions des rôles
`viewer`, `accountant`, `admin`, `owner`. Voir `tests/integration/README.md`.
