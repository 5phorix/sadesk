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

Le job E2E ne depend pas de secrets Supabase : il installe Chromium avec ses dependances Linux et execute le smoke test navigateur.
