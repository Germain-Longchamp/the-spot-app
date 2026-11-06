# UX et design

## Règles non négociables

1. **Le statut de l'agent d'impression est toujours visible** sur l'écran d'impression. Aucune panne silencieuse.
2. **Langage humain pour la file et les statuts** (« 2 photos avant la vôtre », jamais de statut brut).
3. Pas d'installation imposée : expérience « page web » rassurante.
4. Aucune collecte d'email ni de compte au salon.
5. Textes sans jargon, pour des invités néophytes sur téléphone.
6. Un parcours principal sans friction : scan, photo, impression.

Les deux premières règles sont les plus critiques.

## Direction visuelle (validée)

Sombre, tactile, minimale, aux couleurs de The Spot Memories. Couleurs de marque issues de la charte logo d'Alison Medici (v1.0, novembre 2026) ; thème sombre conservé (décision de Germain du 2026-11-06, SCRUM-45). Pas de mode clair en v1.

| Usage | Couleur | Règle |
|---|---|---|
| Fond | `#0D0D0D` | Quasi noir (hypothèse : la charte ne donne pas de fond) |
| Surface (cartes) | `#1A1A1A` | |
| Texte principal | Crème `#F6EEE3` | À faire valider par Alison Medici |
| Texte secondaire | `#B5AAA0` | |
| Actions principales | Pêche `#EC9A62` | Texte foncé dessus |
| Marque (bandeaux, décor) | Framboise `#AD354E` | **Jamais pour du texte sur le fond sombre** (contraste d'environ 3:1) ; texte crème dessus |
| Contours des contrôles | `#756A62` | Au moins 3:1 sur les deux fonds |
| Succès, imprimante en ligne | Vert `#4ADE80` | |
| Erreur, STUCK, imprimante hors ligne | Rouge `#F87171` | Distinct du Framboise, toujours avec un texte |

Typographie : Inter pour tous les textes, embarquée dans l'application (aucun appel à un serveur de polices). La police du logo n'est pas imitée.

Contraste : WCAG AA, soit 4,5:1 pour le texte et 3:1 pour les éléments graphiques utiles. Vérifié par `e2e/brand-colors.spec.ts`. Une information ne passe jamais par la couleur seule.

## Principes pour les écrans

- Boutons grands, utilisables à une main, sur un téléphone en portrait
- Les deux actions de l'accueil (« Prendre une photo », « Importer une photo ») ont la même visibilité et tiennent sans défilement
- Écran de chargement plutôt qu'un écran vide quand le réseau est lent
- Messages d'erreur : ce qui s'est passé, ce que l'invité peut faire, jamais de détail technique
- Boutons désactivés : toujours accompagnés d'une explication
- Lisibilité en forte lumière (reflets, salon) : à tester sur un vrai téléphone
- Contraste WCAG AA, vérifié par des tests automatiques

## Gestion des cas dégradés côté invité

| Situation | Comportement attendu |
|---|---|
| Permission caméra refusée | Message simple, proposition d'importer une photo, instructions pour réactiver |
| Navigateur intégré à une application qui bloque la caméra | Proposer d'ouvrir dans Safari ou Chrome |
| Réseau lent ou coupé pendant l'envoi | Progression visible, reprise automatique, bouton « Réessayer » en dernier recours |
| Quota de l'événement atteint | Bouton « Imprimer » désactivé avec explication |
| Imprimante hors ligne | Message clair, visible sur l'écran d'impression |
| Événement clôturé ou token invalide | Message neutre, aucune donnée affichée |
| Stockage navigateur bloqué (navigation privée) | L'appli reste utilisable, message simple |

## Textes (exemples de ton)

- Accueil : court, chaleureux, sans jargon
- Information sur les photos : usage (impression, galerie optionnelle), conservation d'environ 6 mois, aucun compte ni email demandé. Texte final à valider juridiquement avant la démo
- Erreurs : « Un souci est survenu, rendez-vous auprès de l'équipe » plutôt qu'un code
- Impression prête : « Votre photo est prête, à récupérer près de l'imprimante »

## Logo

Logo final livré par Alison Medici (charte v1.0, novembre 2026), intégré en SCRUM-37. Nom affiché : « The Spot Memories ».

- Fichiers : `apps/web/public/brand/` (versions blanches) ; favicon, icône SVG et icône iPhone 180 px dans `apps/web/app/`
- Composant unique : `components/ui/logo.tsx`. Il applique la charte : version blanche sur fond sombre, proportions du fichier, zone de protection (hauteur du « e » de « The »), et bascule sur la version plus simple sous la taille minimale (200 px complet, 120 px sans « memories », 16 px icône)
- Emplacements : accueil de l'événement et messages de fin (logo complet), panneau opérateur (sans « memories »), aperçu de la photo (icône). Aucun logo sur l'écran caméra
- Interdits (charte) : déformer, pivoter, recadrer, recolorer, ajouter un effet, poser sur un fond qui manque de contraste

## Panneau opérateur

Écran de l'équipe, lisible d'un coup d'œil : liste des jobs avec photo et statut, bouton pour lancer l'impression suivante, pause globale, réessai ou annulation d'un job, indicateur d'état de l'agent toujours visible, accès aux réglages de l'événement et à l'export. Confirmation avant toute action irréversible.

## Socle visuel (SCRUM-36)

Toutes les couleurs vivent dans `apps/web/lib/ui/tokens.ts` : changer une valeur s'applique à toute l'application. Les anciennes couleurs provisoires (ambre, sarcelle) y sont listées comme interdites. Les composants de base sont dans `apps/web/components/ui/`, visibles sur `/dev/ui` en local.
