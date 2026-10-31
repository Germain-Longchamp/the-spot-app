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

Sombre, tactile, minimale. Inspirée de l'esthétique sans filtre de BeReal, avec une ambiance soirée premium.

| Usage | Couleur |
|---|---|
| Fond | `#0D0D0D` |
| Actions principales | Ambre 400 |
| Succès, imprimante en ligne | Teal |
| Erreur, STUCK, imprimante hors ligne | Rouge |

À définir dans SCRUM-36 : typographie, espacements, zones tactiles, composants de base (bouton, carte, indicateur d'état, message d'erreur, écran de chargement), états (normal, désactivé, chargement, erreur). Pas de mode clair en v1.

## Principes pour les écrans

- Boutons grands, utilisables à une main, sur un téléphone en portrait
- Les deux actions de l'accueil (« Prendre une photo », « Importer une photo ») ont la même visibilité et tiennent sans défilement
- Écran de chargement plutôt qu'un écran vide quand le réseau est lent
- Messages d'erreur : ce qui s'est passé, ce que l'invité peut faire, jamais de détail technique
- Boutons désactivés : toujours accompagnés d'une explication
- Lisibilité en forte lumière (reflets, salon) : à tester sur un vrai téléphone
- Contraste cible WCAG AA (hypothèse à confirmer)

## Gestion des cas dégradés côté invité

| Situation | Comportement attendu |
|---|---|
| Permission caméra refusée | Message simple, proposition d'importer une photo, instructions pour réactiver |
| Navigateur intégré à une application qui bloque la caméra | Proposer d'ouvrir dans Safari ou Chrome |
| Réseau lent ou coupé pendant l'envoi | Progression visible, reprise automatique, bouton « Réessayer » en dernier recours |
| Quota d'impressions atteint | Bouton « Imprimer » désactivé avec explication |
| Imprimante hors ligne | Message clair, visible sur l'écran d'impression |
| Événement clôturé ou token invalide | Message neutre, aucune donnée affichée |
| Stockage navigateur bloqué (navigation privée) | L'appli reste utilisable, message simple |

## Textes (exemples de ton)

- Accueil : court, chaleureux, sans jargon
- Information sur les photos : usage (impression, galerie optionnelle), conservation d'environ 6 mois, aucun compte ni email demandé. Texte final à valider juridiquement avant la démo
- Erreurs : « Un souci est survenu, rendez-vous auprès de l'équipe » plutôt qu'un code
- Impression prête : « Votre photo est prête, à récupérer près de l'imprimante »

## Logo

Ajustement de la boucle du S (SCRUM-37) : lisible sur fond sombre et en petite taille, variantes pour l'icône, exports SVG et PNG. Le détail de l'ajustement attendu n'est pas précisé : à demander à Germain.

## Panneau opérateur

Écran de l'équipe, lisible d'un coup d'œil : liste des jobs avec photo et statut, bouton pour lancer l'impression suivante, pause globale, réessai ou annulation d'un job, indicateur d'état de l'agent toujours visible, accès aux réglages de l'événement et à l'export. Confirmation avant toute action irréversible.
