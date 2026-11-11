# Maquettes invités d'Alison (novembre 2026)

Passation de la designer Alison Medici, reçue le 2026-11-11. `HANDOFF.md`, `ecrans/` et `assets/` sont copiés tels quels : c'est la référence d'intégration des écrans invités.

Les fichiers de `ecrans/` sont des références de mise en page (format de maquette, styles en ligne), pas du code à copier. Les photos y sont des formes provisoires. Ouvrir un écran dans un navigateur à 390 × 844 pour le comparer à l'application.

## Écrans et stories

| Écran | Story | Version |
|---|---|---|
| `1-accueil.html` | SCRUM-57 | v1 Salon |
| `2-personnaliser-cadre.html` | SCRUM-63 (case galerie, boutons), SCRUM-61 (texte du cadre) | v1 / v2 Mariage |
| `3-file-attente.html` | SCRUM-53 | v1 Salon |
| `4-galerie.html` | SCRUM-54, SCRUM-63 | v1 Salon |
| `5-photo-en-grand.html` | SCRUM-55, SCRUM-59 | v1 Salon |
| `6-galerie-surprise.html` | SCRUM-56 | v1 Salon |
| Tokens de couleur | SCRUM-58 | v1 Salon |
| Cadre blanc imprimé | SCRUM-60, SCRUM-62 | v2 Mariage |

## Écarts décidés par Germain (2026-11-11)

Ces écarts sont voulus : l'intégration suit la maquette pour tout le reste.

- **Une seule entrée « Galerie »** : plus de « Mes photos ». Une photo non partagée reste visible par son auteur seul, avec la mention « Non partagée » (SCRUM-63).
- **Pas de temps estimé en v1** (« environ 2 min ») : seulement la position, « 2 photos avant la vôtre » (SCRUM-53, SCRUM-57).
- **Bouton « Valider sans imprimer »** au lieu de « Partager dans la galerie sans imprimer » : la case « Ajouter à la galerie » (cochée par défaut) décide seule du partage (SCRUM-63).
- **Pas de cadre personnalisé en v1** : l'écran 2 sert en v1 pour la case galerie et les boutons. Le cadre arrive en v2 avec deux lignes : la première préremplie avec le texte du cadre de l'événement, la seconde libre et facultative (SCRUM-60 à 62).
- **Galerie surprise** : « La galerie de [nom de l'événement] sera dévoilée plus tard » au lieu du nom des mariés (SCRUM-56).
- **Surtitre de l'accueil** : date de l'événement seule, pas de type d'événement en v1 (SCRUM-57).
- **État de l'imprimante** : toujours visible sur les écrans où l'on peut imprimer (règle UX n°1), même s'il n'apparaît pas sur la maquette.
- **Bordure `line` (#EADFE2)** : cartes seulement ; les contours des champs gardent #968079 pour le contraste 3:1 (SCRUM-58).

La landing page de la passation n'est pas reprise ici (hors périmètre, décision de Germain).
