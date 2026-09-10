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

**Scripts**

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | Analyse ESLint |
| `npm run test` | Tests unitaires (Vitest) |
| `npm run test:integration` | Tests d'isolation multi-sociétés et de rôles (nécessite une base Supabase de test) |

**Tests d'intégration**

Ils vérifient le cloisonnement des données entre sociétés et les permissions des rôles
`viewer`, `accountant`, `admin`, `owner`. Voir `tests/integration/README.md`.
