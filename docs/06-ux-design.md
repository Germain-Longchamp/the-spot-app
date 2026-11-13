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

1. **Accueil** (maquette d'Alison, SCRUM-57, remplace SCRUM-51) : logo couleur à 224 px (le plus petit permis par la charte pour le logo complet), date de l'événement en surtitre (rien sans date), nom de l'événement en titre framboise. « Prendre une photo » en action principale (framboise plein), « Importer une photo » en secondaire (blanc, bordure framboise), chacune avec une ligne d'aide. Dessous, un bandeau pêche clair résume les tirages (« 2 tirages dans la file » et la position du prochain ; « Votre photo est prête » ; souci en rouge) et ouvre « Vos tirages ». En bas, une seule entrée « Voir la galerie » avec le nombre de photos (« 24 photos partagées » ; galerie fermée : « Dévoilée plus tard · 2 de vos photos » ; sans galerie : « Vos photos »). « Comment ça marche » est retiré : les trois étapes vont sur la pancarte sous le QR code.
2. **Caméra** : plein écran, déclencheur rond, fermeture (croix) et bascule de caméra en icônes, éclair blanc à la prise.
3. **Aperçu** (« Votre photo ») : écran d'une hauteur exacte, sans défilement (SCRUM-52), allégé pour laisser la place au tirage (SCRUM-66). En haut « Reprendre » et, à droite, l'état de l'imprimante en pastille (mêmes mots qu'ailleurs, sur deux ou trois lignes sur un petit écran), sans titre ; au milieu le tirage sur un fond grisé qui occupe toute la largeur ; le toucher l'ouvre en plein écran sur fond noir (zoom à deux doigts, double toucher, croix ou bouton retour pour revenir). En bas : motif si l'impression est impossible, interrupteur « Ajouter à la galerie » sur une ligne, « Imprimer », et « Valider sans imprimer » en lien texte.
4. **Envoi** : anneau de progression, message rassurant ; jamais de retour possible pendant l'envoi.
5. **Confirmation** : coche animée, message, état de l'imprimante et suivi en étapes (envoyée, validation, impression, prête), puis « Prendre une autre photo » (ouvre la caméra) et « Retour à l'accueil » fixés en bas.

Composants : `components/guest/screen.tsx` (en-tête, contenu, barre du bas), `components/guest/print-steps.tsx`, `components/ui/switch.tsx`, `components/ui/icons.tsx`. Animations courtes (entrée d'écran, coche, éclair, pulsation) ; toutes coupées si le téléphone demande de réduire les animations.

## Principes pour les écrans

- Boutons grands, utilisables à une main, sur un téléphone en portrait
- Sur l'accueil, « Prendre une photo » est l'action principale et « Importer une photo » la secondaire ; les deux tiennent sans défilement, jusqu'à 320 × 568 (SCRUM-57)
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

## Galerie, seule entrée vers les photos (SCRUM-63)

Décision de Germain du 2026-11-11, après la passation d'Alison (`docs/design/alison-2026-11/`) : il n'y a plus deux entrées (« Galerie de l'événement » et « Mes photos », SCRUM-47) mais une seule, la Galerie.

- **Parcours** : l'invité prend ou importe une photo ; « Ajouter à la galerie de l'événement » est cochée par défaut ; il choisit « Imprimer » ou « Valider sans imprimer ». La confirmation propose « Voir la galerie ».
- **Galerie** : galerie ouverte, toutes les photos partagées et toutes celles de l'invité ; galerie fermée, seulement les siennes, avec « La galerie sera disponible plus tard » ; événement sans galerie, l'entrée s'appelle « Vos photos ». Les photos de l'invité portent la pastille « Vous », et « Non partagée » si elles ne sont visibles que de lui. Données : vue `gallery_photos` (RLS des photos, `is_mine` sans exposer l'auteur).
- **Ses propres photos** : elles s'ouvrent dans la même visionneuse que les autres (SCRUM-55, ci-dessous), avec leur état d'impression en pastille. « Imprimer » n'est proposé que pour une photo jamais imprimée ou dont la dernière demande a été annulée ; pas de réimpression.
- **Accueil** : le bandeau d'impression, sous les deux actions depuis SCRUM-57, ouvre « Vos tirages » (SCRUM-53). Mise à jour toutes les 5 secondes, dernier état connu si le réseau tombe.

## Vos tirages (SCRUM-53)

- Le bandeau de l'accueil ouvre la page « Vos tirages » ; une carte par tirage récent ouvre la photo en grand (retour « Vos tirages »).
- Ordre : prête, souci, en cours, puis la file dans son ordre d'arrivée. Résumé en tête (« 1 prêt · 2 en attente »).
- Position en langage humain : « 2 photos avant la vôtre », « C'est la prochaine ». Elle compte les demandes de l'événement en attente arrivées avant, validées ou non, comme la file numérotée du panneau opérateur. Le bandeau la reprend.
- Calculée par `guest_queue_positions` (security definer) : l'invité n'obtient que des nombres pour ses propres demandes.
- Position illisible : « En attente de validation par l'équipe ». Réseau coupé : dernier état connu, « Mise à jour impossible pour le moment ». Impressions en pause : « Les impressions reprennent bientôt » (hypothèse à confirmer).
- Pas de temps d'attente estimé en v1. La maquette d'Alison affiche aussi un grand rang (« 3e dans la file ») : non repris, la phrase dit la même chose.

## Galerie à jour toute seule (SCRUM-54)

- Plus de bouton « Actualiser » : la galerie relit ses photos toutes les 10 s tant que l'onglet est visible (pause onglet caché, relecture dès son retour). Hypothèse à confirmer face à Supabase Realtime (question ouverte n°10).
- Une photo ne bouge jamais sous le doigt : en haut de page, les nouvelles photos entrent directement ; plus bas, une pastille « 3 nouvelles photos » les annonce, et un appui remonte en haut pour les afficher. Revenir en haut seul a le même effet.
- Une photo supprimée par l'équipe disparaît à la relecture suivante. Réseau coupé : la grille reste, « Connexion perdue, nouvelle tentative… », reprise automatique.
- Maquette d'Alison (4-galerie) : retour « Accueil », titre « Galerie » en framboise et nombre de photos, grille 3 colonnes espacées de 6 px, coins de 8 px, pastille « Vous » blanche, bouton flottant « Prendre une photo » qui ouvre la caméra depuis l'accueil (`/e/<jeton>#photo`).
- « Vous » est calculé par la vue `gallery_photos` (SCRUM-63) : aucun identifiant d'invité n'arrive sur le téléphone.

## Galerie surprise (SCRUM-56)

- Galerie activée mais fermée : l'entrée de l'accueil reste (« Dévoilée plus tard · 2 de vos photos ») et ouvre la Galerie en mode surprise (maquette 6-galerie-surprise) : carte « La galerie est une surprise », « La galerie de [nom de l'événement] sera dévoilée plus tard. En attendant, vos photos sont bien gardées. », puis « Vos photos » avec leur nombre et la grille, et le bouton « Prendre une photo ».
- Seules les photos de l'invité reviennent de la base (RLS de la vue `gallery_photos`), partagées ou non (« Non partagée »).
- La page relit les réglages de galerie de l'événement toutes les 10 s : quand l'équipe ouvre la galerie, l'écran bascule sur la galerie complète, sans recharger.
- Aucune photo : « Vous n'avez pas encore de photo. » Réseau coupé : dernier état affiché.
- Galerie désactivée : pas d'écran surprise, la page s'appelle « Vos photos ».

## Photo en grand (SCRUM-55)

Maquette d'Alison (5-photo-en-grand), retouchée par la recette de Germain du 2026-11-12.

- Une seule visionneuse pour toutes les photos de la galerie, celles de l'invité comprises, dans l'ordre de la grille. Fond sombre (`foreground`, l'encre d'Alison), photo entière jamais recadrée, la vignette floue en attendant la photo complète.
- En haut : « Galerie » (bouton contour) à gauche, compteur « 7 / 24 » à droite. En bas : « Glissez pour voir les autres photos », puis les flèches « Photo précédente » et « Photo suivante » (absentes au bord), avec au centre l'action de la photo.
- Glisser (au moins 50 px, plus horizontal que vertical), les flèches ou le clavier (← →, Échap) changent de photo. Au bout des photos chargées, « suivante » charge la page d'après.
- L'adresse porte la photo (`?photo=…`) : le retour du téléphone ramène à la grille, à la même position. Une page rechargée avec une photo dans l'adresse montre la grille.
- Les nouvelles photos ne décalent ni la photo ni le compteur : elles attendent le retour à la grille. Une photo supprimée par l'équipe : « Cette photo n'est plus disponible. », puis la suivante au bout de 2 s.
- Photo de l'invité : pastilles « Vous », « Non partagée » si besoin, et l'état d'impression en langage humain (« En attente de validation », « Impression en cours », « Prête à récupérer »…) qui ouvre « Vos tirages » (`/e/<jeton>#tirages`). **Pas de suivi en étapes ici** (décision de Germain du 2026-11-12 : doublon avec « Vos tirages » et le bandeau de l'accueil).
- Photo de l'invité jamais imprimée (ou demande annulée) : « Imprimer » au centre, l'état de l'imprimante et, le cas échéant, le motif (pause, limite atteinte) juste au-dessus (règle UX n°1).
- Photo d'un autre invité : ni « Imprimer » ni état d'impression.
- « Télécharger » (SCRUM-59) : bouton blanc au centre, pour toutes les photos ; sur une photo de l'invité à imprimer, « Imprimer » passe au-dessus, sur toute la largeur. Sur un téléphone qui sait partager des fichiers, la feuille de partage s'ouvre avec la photo (« Enregistrer l'image »), préparée dès l'affichage pour s'ouvrir dans le geste, comme l'exige Safari ; sinon un lien signé d'une minute fait enregistrer le fichier `<événement>-<date>-<rang>.jpg` (rien sur l'invité). Feuille refermée : rien. Photo supprimée : « Cette photo n'est plus disponible. » Réseau coupé : « Téléchargement impossible pour le moment, réessayez. » Navigateur d'Instagram, Facebook… : « Si rien ne se passe, appuyez longuement sur la photo pour l'enregistrer. »
- Information au moment de partager (écran « Votre photo ») : quand l'invité active l'interrupteur, une bulle affiche « Les autres invités pourront la voir et l'enregistrer. » (galerie fermée : « Elle sera visible, et enregistrable, à l'ouverture de la galerie. ») pendant 4 s (SCRUM-66).

## Tirage façon Polaroid (SCRUM-65)

Décision de Germain du 2026-11-12 : un seul format en v1.

- Papier « 10 × 15 » (en pratique 4 × 6 pouces, 101,6 × 152,4 mm) en hauteur. Photo de 88 × 110 mm (4:5), centrée, à 6,8 mm du haut et des côtés, bande blanche de 35,6 mm en bas pour les textes (SCRUM-60, 61, 62). Agrandie par SCRUM-66 (Germain, 2026-11-13 ; avant : 80 × 100 mm). Pas de bord sous 6 mm : un papier décalé d'un millimètre se verrait. Les nombres sont dans `apps/web/lib/print/layout.ts`, copié dans l'agent (un test vérifie qu'ils sont identiques).
- Caméra : viseur toujours vertical en 4:5, le reste de l'écran noir, « Ce qui est dans le cadre sera imprimé ». La photo prise est exactement le cadre.
- Import : recadrage centré automatique en 4:5 (une photo en paysage perd ses côtés). Pas de réglage manuel en v1.
- Aperçu (« Votre photo ») : la page blanche du tirage, la photo recadrée dans sa fenêtre, la bande du bas avec ses textes.
- **Bande du bas (SCRUM-60)**, d'après la maquette d'Alison (`2-personnaliser-cadre`, 248 px de large mis à l'échelle du papier) : ligne 1 framboise en gras (6,55 mm), ligne 2 facultative grise en capitales espacées (4,3 mm), icône The Spot (9 mm) à droite. Le texte part du bord gauche de la photo, l'icône s'arrête à son bord droit, le tout centré dans la hauteur de la bande. Pour l'instant, ligne 1 = nom de l'événement, ligne 2 vide (SCRUM-61 et 62 viendront la remplir). Texte trop long : réduit jusqu'à 4,5 mm (ligne 1), puis coupé avec « … » ; emojis et caractères de contrôle retirés. Police Inter (licence OFL) embarquée dans l'agent et dessinée en tracés : le tirage ne dépend pas des polices du Mac.
- La photo stockée reste entière ; la zone gardée (relative, x, y, largeur, hauteur) est enregistrée avec elle et vérifiée par le serveur. L'agent la découpe, la pose sur la page blanche et l'imprime. Une page impossible à composer passe en souci pour l'équipe : jamais de tirage sans cadre.
- Galerie, vue en grand et téléchargement : la photo entière, sans cadre.
- Photo trop petite : imprimée quand même, sans avertissement (on verra selon les retours). Couleurs : à ajuster après les tirages tests.
