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

Claire, chaleureuse, tactile, aux couleurs de The Spot Memories. **Thème clair depuis la décision de Germain du 2026-11-08 (SCRUM-46)**, qui remplace le thème sombre de SCRUM-45 : la charte d'Alison Medici met le logo couleur sur fond clair.

| Usage | Couleur | Règle |
|---|---|---|
| Fond | Crème `#F6EEE3` | Relevé sur la charte (à confirmer par Alison) |
| Cartes, barres | Blanc `#FFFFFF` | Ombre douce pour les détacher du crème |
| Texte | `#2B1B20` | 14:1 sur le crème |
| Texte secondaire | `#6B585C` | 5,7:1 |
| Actions principales | Framboise `#AD354E` | Texte blanc dessus (6,2:1) |
| Décor | Pêche `#EC9A62` (et Pêche clair `#FBE6D6`) | **Jamais pour du texte sur fond clair** (2:1) ; texte foncé dessus |
| Contours des contrôles | `#968079` | 3:1 au moins |
| Succès, imprimante en ligne | Vert `#1F7A4D` | |
| Erreur, impression bloquée | Rouge `#B42318` | Toujours avec une icône et une phrase |

Typographie : Inter, embarquée dans l'application. Contraste WCAG AA vérifié par `e2e/brand-colors.spec.ts`.

## Parcours invité (SCRUM-46)

Un écran par étape, une action principale par écran :

1. **Accueil** : logo couleur, nom de l'événement, deux grandes tuiles de même poids (« Prendre une photo », « Importer une photo »), « Comment ça marche » en trois étapes, puis la carte « Mes photos (n) » et le lien vers la galerie. Un bandeau en haut signale une impression en attente, en cours, prête ou en souci (SCRUM-47).
2. **Caméra** : plein écran, déclencheur rond, fermeture (croix) et bascule de caméra en icônes, éclair blanc à la prise.
3. **Aperçu** (« Votre photo ») : photo encadrée comme un tirage, état de l'imprimante, interrupteur « Ajouter à la galerie », barre d'actions fixée en bas (« Imprimer », « Valider sans imprimer »), « Reprendre » toujours visible en haut.
4. **Envoi** : anneau de progression, message rassurant ; jamais de retour possible pendant l'envoi.
5. **Confirmation** : coche animée, message, état de l'imprimante et suivi en étapes (envoyée, validation, impression, prête), puis « Prendre une autre photo » (ouvre la caméra) et « Retour à l'accueil » fixés en bas.

Composants : `components/guest/screen.tsx` (en-tête, contenu, barre du bas), `components/guest/print-steps.tsx`, `components/ui/switch.tsx`, `components/ui/icons.tsx`. Animations courtes (entrée d'écran, coche, éclair, pulsation) ; toutes coupées si le téléphone demande de réduire les animations.

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

Organisation depuis SCRUM-48 (décision de Germain du 2026-11-08) :

- **Barre collante** : état de l'imprimante, bandeaux « Impressions en pause » et « Événement fermé », onglets. Elle reste visible quelle que soit la vue et le défilement
- **Impressions** (vue par défaut) : compteurs, pause, puis les demandes regroupées — à vérifier, en impression, file d'attente numérotée dans l'ordre d'arrivée (« Prochaine à imprimer » en tête), historique replié
- **Galerie** : photos publiées, suppression après confirmation
- **Paramètres** : accès à la galerie, nombre maximal d'impressions, fermeture et réouverture de l'événement
- Un badge sur l'onglet « Impressions » compte les demandes en attente ou à vérifier ; il passe en rouge s'il y a un souci

## Socle visuel (SCRUM-36)

Toutes les couleurs vivent dans `apps/web/lib/ui/tokens.ts` : changer une valeur s'applique à toute l'application. Les anciennes couleurs provisoires (ambre, sarcelle) y sont listées comme interdites. Les composants de base sont dans `apps/web/components/ui/`, visibles sur `/dev/ui` en local.

## Mes photos (SCRUM-47)

Les photos et les impressions de l'invité sont réunies dans une seule vue, la photo étant l'objet central (décisions de Germain du 2026-11-08).

- **Accueil** : un bandeau en haut, seulement si une impression est en attente, en cours, prête (pendant 30 minutes) ou en souci ; il ouvre la photo concernée. Sous les deux tuiles, une carte « Mes photos (n) » avec trois mini-vignettes, absente tant qu'aucune photo n'est envoyée.
- **Vue « Mes photos »** : une grille de deux colonnes ; chaque carte porte un badge d'état en clair (« Prête à récupérer », « Un souci : voyez l'équipe », « Impression en cours », « En attente de validation », « Annulée », « Non imprimée ») et, le cas échéant, « Dans la galerie » (lecture seule). Ordre : prête, souci, en cours, en attente, puis le reste du plus récent au plus ancien.
- **Détail** : la photo en grand, l'état de l'imprimante et le suivi en étapes. « Imprimer » n'est proposé que pour une photo jamais imprimée ou dont la dernière demande a été annulée ; pas de réimpression.
- Accès aussi depuis l'écran de confirmation (« Voir mes photos »). Mise à jour toutes les 5 secondes, dernier état connu si le réseau tombe.

