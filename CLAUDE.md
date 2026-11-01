# The Spot — instructions pour Claude Code

Web app photobooth pour événements (salons, mariages) : l'invité scanne un QR code, prend ou importe une photo, l'ajoute à une galerie (option) et lance une impression. Une équipe sur place contrôle les impressions. Parcours visé : « je scanne → je prends/envoie → c'est imprimé ».

Product Owner et relecteur : Germain (ancien développeur fullstack web, il lit et comprend le code). Tu codes, il relit et tranche.

## Périmètre actuel

- **v1 « Salon / Démo »** (cible : janvier 2027) : c'est la seule version à construire pour l'instant. Environ 200 visiteurs sur la journée. Accès direct par QR, sans compte, sans email, sans code. Impression contrôlée à la main par l'équipe, une à la fois.
- **v2 « Mariage »** (cible : juin 2027) : file d'attente automatique, numéro sur la photo, comptes optionnels, admin complet, rétention automatique. **Ne rien construire de la v2** et ne pas sur-concevoir pour elle, sauf là où la v1 l'exige déjà (multi-tenant, isolation par événement).

Source de vérité du backlog : Jira, site `glongchamp8.atlassian.net`, projet **SCRUM** (version « v1 Salon »). Le projet porte encore le nom « Team StudioPlantes » ; Germain le renommera. Les 10 Epics sont SCRUM-5 à SCRUM-13 et SCRUM-38 ; SCRUM-10 (impression mariage) relève de la v2 et n'a pas de story (voir `docs/03-backlog-v1.md`).

## Stack (verrouillée, ne pas la remettre en cause)

- **Frontend** : Next.js 14 (App Router)
- **Backend / données** : Supabase — authentification anonyme, Postgres avec **RLS**, Storage, Realtime
- **Agent d'impression** : démon Node.js géré par PM2, sur l'ordinateur branché à l'imprimante
- **Tâches planifiées** : `pg_cron` + fonction Edge (passage des jobs en STUCK après 60 s sans signe de vie)
- **Imprimante** : imprimante photo professionnelle fournie par le client ; **modèle encore inconnu** (voir « Points ouverts »)

## Règles non négociables

### UX
1. Le statut de l'agent d'impression est **toujours visible** sur l'écran d'impression. Aucune panne silencieuse.
2. La position dans la file et les statuts sont écrits en **langage humain** (« 2 photos avant la vôtre »). Jamais de `PENDING`, `STUCK` ou autre statut brut côté invité.
3. Textes sans jargon technique. Public : invités néophytes, sur téléphone, souvent avec un réseau médiocre.
4. Pas d'installation imposée : on reste sur une expérience « page web » (Safari iOS, Chrome Android et desktop au minimum).
5. Aucun email ni compte demandé au salon.

### Sécurité et données
1. **RLS sur toutes les tables**, dès la première migration. Un invité n'accède qu'aux données de l'événement de son token.
2. Token d'accès non devinable, vérifié côté serveur.
3. Aucune photo ni donnée personnelle dans les journaux.
4. Aucun secret dans le dépôt. Variables d'environnement uniquement.
5. L'agent d'impression ne se connecte que **vers l'extérieur** (aucun port entrant).
6. Les actions irréversibles (suppression de photo, purge d'événement) exigent une confirmation et laissent une trace.

### Fiabilité de l'impression
1. Le statut `STUCK` et le heartbeat sont implémentés **dès le départ**, pas différés.
2. Les jobs sont **idempotents** : un redémarrage ou un double appui ne produit jamais deux impressions.
3. Un job n'est traité que par un seul agent à la fois (verrou).
4. Le code appelle l'imprimante uniquement via l'interface `print(image, options)`. En attendant le modèle réel, une **implémentation simulée** la remplace.

## Méthode de travail

- **Ordre de construction** : socle (SCRUM-39) → pipeline d'impression avec imprimante simulée (SCRUM-21 à 24) → accès et événement → capture/import → galerie → opérateur et réglages → export, purge → design et logo en parallèle. Le pipeline d'impression passe **avant** l'interface.
- **Une story Jira = une branche = une revue de Germain.** Tranches verticales (de l'écran à la base), jamais « tout le back puis tout le front ».
- **Les critères Gherkin de chaque story deviennent des tests automatisés.** Sans test correspondant, la story n'est pas terminée.
- **Jira** : quand Germain dit « implémente SCRUM-xx », lis la story via le connecteur Atlassian (description, panels, critères). Ne change son statut que sur demande.
- **Hypothèses** : les stories contiennent des lignes « Hypothèse à confirmer avec Germain ». **N'invente jamais la réponse** : pose la question, ou implémente la solution la plus simple en la signalant clairement dans la description de la PR.
- **Relecture obligatoire par Germain** pour : règles RLS, verrou et transitions des jobs, quota d'impressions, droits opérateur, export, purge. Signale-les dans la PR.
- Aucune nouvelle fonctionnalité dans les deux dernières semaines avant le salon : corrections uniquement.

## Definition of done

- Les critères Gherkin de la story sont couverts par des tests qui passent
- Lint, types et build passent en intégration continue
- RLS vérifiée pour toute table ou requête touchée
- Testé sur un vrai iPhone et un vrai téléphone Android quand l'écran utilise la caméra, l'import ou l'envoi de photo
- Textes lisibles par un non-initié
- Description de PR : ce qui change, hypothèses prises, points à relire

## Conventions (propositions à confirmer par Germain)

- Interface en français ; code, noms de tables et messages de commit en anglais
- TypeScript strict
- Migrations Supabase versionnées dans le dépôt, jamais de modification manuelle d'un environnement
- Commandes de test, de lint et de lancement (définies par SCRUM-39) :
  - `cd apps/web && npm run dev` — démarrer le serveur de développement (port 3000)
  - `cd apps/web && npm run build` — build de production
  - `cd apps/web && npm run lint` — ESLint
  - `cd apps/web && npm run type-check` — TypeScript strict
  - `cd apps/web && npm test` — tests Playwright (lance le serveur automatiquement)
  - `cd apps/print-agent && npm run lint && npm run build` — vérifier l'agent d'impression
  - Variables d'env : copier `apps/web/.env.example` → `apps/web/.env.local`
- Intégration continue : GitHub Actions (`.github/workflows/ci.yml`), à chaque push sur toute branche. Lance les vérifications ci-dessus, sans relance automatique des tests.
- Vercel : le répertoire racine `apps/web` se règle dans les paramètres du projet Vercel, pas dans un fichier du dépôt.

## Structure du dépôt (SCRUM-39)

```
the-spot/
  CLAUDE.md
  .github/workflows/    intégration continue (GitHub Actions)
  .nvmrc                version de Node (22, requise par supabase-js)
  .gitignore
  docs/                 documentation produit et technique
  apps/web/             application Next.js 14 (App Router)
    lib/                utilitaires (Supabase client, validation env)
    e2e/                tests Playwright (critères Gherkin)
  apps/print-agent/     agent d'impression Node.js (squelette, implémenté en SCRUM-21+)
  supabase/migrations/  migrations SQL versionnées
  scripts/              initialisation de l'événement de démo, purge, outils
```

## Points ouverts (à ne pas trancher seul)

- Modèle exact de l'imprimante, connexion, système de l'ordinateur du salon, formats de papier, consommables, retour d'état du pilote (SCRUM-26)
- Validation de chaque job par l'opérateur : mécanisme exact (SCRUM-21, SCRUM-25)
- Accès opérateur : lien ou code secret simple en v1 (SCRUM-25)
- Quota d'impressions par invité : 2 ou 3 par défaut, réglable
- Option galerie décochée par défaut (SCRUM-19)
- Photo originale conservée ou seulement la version compressée (SCRUM-20)

Liste complète et historique des décisions : `docs/02-decisions.md`.

## Documentation

- `docs/01-brief.md` — brief produit
- `docs/02-decisions.md` — décisions validées et questions ouvertes
- `docs/03-backlog-v1.md` — stories v1, clés Jira, dépendances, ordre
- `docs/04-impression.md` — pipeline d'impression, statuts, agent
- `docs/05-donnees.md` — modèle de données proposé
- `docs/06-ux-design.md` — règles UX et direction visuelle
- `docs/07-methode.md` — flux de travail avec Claude Code
