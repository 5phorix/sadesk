# Securite et dependances

## Dependances npm

- `xlsx` reste uniquement dans `devDependencies`.
- Il est utilise par `scripts/export-accounting-plans.cjs`, jamais par le bundle de production.
- Son avis npm eleve reste surveille car la version publique corrigee n'est pas disponible.
- Avant toute utilisation de donnees Excel dans l'application, preferer un traitement serveur isole ou une bibliotheque maintenue.

Verification locale :

```bash
npm audit
npm audit --omit=dev
```

L'audit de production ne doit pas contenir de vulnerabilite elevee ou critique. L'audit complet peut continuer a signaler `xlsx` pour les scripts de developpement.

## Secrets GitHub

La presence des secrets ne peut pas etre lue depuis le code source. Le workflow CI verifie leur disponibilite en activant le job d'integration uniquement lorsque ces trois secrets existent :

- `SUPABASE_PUBLIC_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Verification par un mainteneur dans GitHub : `Settings > Secrets and variables > Actions`. Les valeurs ne doivent jamais etre affichees dans les logs.

## Rotation des secrets

1. Creer un nouveau secret chez le fournisseur concerne, sans supprimer l'ancien.
2. Mettre a jour le secret correspondant dans `Settings > Secrets and variables > Actions` et dans les variables du fournisseur de deploiement.
3. Lancer la CI et un test fonctionnel non destructif : notifications, relances ou IA selon le secret change.
4. Revoquer l'ancien secret chez le fournisseur.
5. Verifier les journaux sans afficher de valeur sensible et consigner la date de rotation.

Secrets concernes : `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLIC_URL`, `AI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` et `CRON_SECRET`.

Le job E2E ne depend pas de secrets Supabase : il installe Chromium avec ses dependances Linux et execute le smoke test navigateur.
