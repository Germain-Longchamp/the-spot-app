# The Spot memories · App invités — passation design

Maquettes validées pour la web app invités (mobile, 390 × 844). À implémenter dans l'app existante (`the-spot-app.vercel.app`).
Maquettes en ligne (canevas) : https://claude.ai/artifact/MWhssJCwaqzs9vaK4ocA2S

## Comment utiliser ce dossier avec Claude Code

1. Copier le dossier `the-spot-handoff/` à la racine du repo (ou dans `docs/`).
2. Dans Claude Code, demander par exemple :
   > Lis `the-spot-handoff/HANDOFF.md` et les écrans dans `the-spot-handoff/ecrans/`. Mets à jour l'app invités pour qu'elle corresponde à ces maquettes, écran par écran, en réutilisant nos composants et notre style existants. Commence par l'accueil.
3. Avancer écran par écran et vérifier sur mobile à chaque étape.

Les fichiers de `ecrans/` sont des **références de mise en page**, pas du code à copier : ils utilisent un format de maquette (`<x-dc>`, `<sc-for>`, `{{…}}`) et des styles en ligne. Tailles, couleurs, espacements et textes y sont exacts. Les photos sont des illustrations provisoires (formes SVG) à remplacer par les vraies photos.

## Design tokens

| Token | Valeur | Usage |
|---|---|---|
| framboise | `#AD354E` | Titres, bouton principal, texte du petit mot |
| peche | `#EC9A62` | Accents, état « prête » (jamais de texte pêche sur fond clair) |
| peche-clair | `#FBE3D2` | Bandeaux d'info |
| creme | `#F6EDE3` | Fond des écrans |
| paper | `#FFFFFF` | Cartes, cadre des tirages |
| ink | `#2B1A1E` | Texte fort, fond de la vue photo en grand |
| ink-soft | `#5A474B` | Texte courant, légendes |
| line | `#EADFE2` | Bordures 1 px des cartes |

- Police : **Inter** (400, 600, 700). Titre écran 24–29 px bold framboise ; texte 14–15 px ; eyebrow 12 px majuscules, interlettrage 0.18em.
- Rayons : boutons 16–20 px, cartes 16 px, vignettes 8 px, pastilles 999 px.
- Zones tactiles ≥ 44 px. Pas d'emoji. Icônes en trait (stroke 1.8–2).
- Logo : complet en haut de l'accueil (200 px de large minimum) ; icône (diaphragme) 28 px en haut à droite des autres écrans.

## Écrans

### 1 · Accueil (`1-accueil.html`)
- **Retirer les 3 étapes** (elles passent sur la pancarte imprimée sous le QR code).
- Logo complet en haut, eyebrow (type · date), nom de l'événement, phrase d'intro.
- « Prendre une photo » = bouton principal (framboise plein). « Importer une photo » = secondaire (blanc, bordure framboise).
- Si l'invité a des tirages en cours : bandeau pêche « N tirages dans la file » → écran 3.
- En bas : carte « Voir la galerie » avec le nombre de photos.

### 2 · Personnaliser le cadre (`2-personnaliser-cadre.html`) — nouveau
- Remplace la numérotation des tirages.
- Aperçu du tirage : photo + bande blanche avec **le petit mot de l'invité** (framboise, bold), **nom de l'événement · date** (fixés par l'organisateur) et l'icône The Spot.
- Champ « Votre petit mot sur le cadre » : 30 caractères max, compteur visible. Aperçu mis à jour en direct.
- **Pas de choix de couleur** : texte toujours framboise.
- Case « Ajouter aussi à la galerie de l'événement » (cochée par défaut).
- Actions : « Imprimer ma photo » (principal) → écran 3 ; « Partager dans la galerie sans imprimer » (lien secondaire) → galerie, sans entrer dans la file.

### 3 · File d'attente (`3-file-attente.html`) — nouveau
- Un invité peut avoir **plusieurs tirages en attente** : une carte par tirage.
- Chaque carte : vignette, petit mot entre guillemets, état, détail, et position dans la file si en attente.
- États : `en_attente` (« 3e dans la file », temps estimé) → `en_impression` → `prete` (pastille pêche, bordure pêche, « Elle vous attend près de l'imprimante »).
- Mise à jour en temps réel (position et temps estimé).
- Message : « Vous pouvez fermer cette page et profiter de la soirée : vos places sont gardées. » → la session doit persister (même onglet fermé).
- Bouton secondaire « Prendre une autre photo ».

### 4 · Galerie (`4-galerie.html`)
- **Supprimer le bouton « Actualiser »** : rafraîchissement automatique (polling ou temps réel).
- Quand de nouvelles photos arrivent pendant que l'invité fait défiler : pastille flottante « N nouvelles photos » ; un appui remonte en haut et les affiche.
- Grille 3 colonnes, espacement 6 px. Pastille « Vous » sur les photos de l'invité.
- Bouton flottant « Prendre une photo » en bas.
- Appui sur une photo → écran 5.

### 5 · Photo en grand (`5-photo-en-grand.html`)
- Fond ink. Retour « Galerie » en haut à gauche, **bouton secondaire** (contour), pas de « Fermer » en primary.
- Compteur « 7 / 24 » en haut à droite.
- Photo affichée avec son cadre blanc (petit mot + événement).
- Glisser gauche/droite pour naviguer + flèches précédente/suivante (accessibilité).
- **Bouton « Télécharger »** (blanc) : enregistrer la photo, y compris celles des autres invités.

### 6 · Galerie surprise (`6-galerie-surprise.html`)
- Affiché quand l'organisateur a choisi « galerie dévoilée à la fin » (réglage admin).
- Carte : « La galerie est une surprise — [mariés] la dévoileront à la fin de la soirée. En attendant, vos photos sont bien gardées. »
- Section « Vos photos » : les photos de l'invité uniquement.
- Bouton « Prendre une photo ».

## Hors périmètre
- Interface admin (dont le réglage galerie publique / surprise) : déjà côté PO.
