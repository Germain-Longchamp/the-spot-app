# Brief produit — The Spot

## Objectif

Web app photobooth pour événements (mariages, salons). Les invités peuvent :
- prendre une photo avec leur caméra ou importer une photo ;
- l'ajouter à une galerie d'événement (selon le réglage de l'événement) ;
- lancer une impression ;

et les administrateurs gèrent l'événement et exportent toutes les photos en fin d'événement.

Expérience visée : ultra fluide, « je scanne → je prends/envoie → c'est imprimé ».

## Versions

### v1 — « Salon / Démo » (cible : janvier 2027)
Démontrer que ça marche en conditions réelles (environ 200 personnes) sans friction.
- Accès par un QR code spécial qui mène directement à l'événement de démo
- Sans compte, sans email, sans code événement
- Impression : contrôle manuel par l'équipe, une impression à la fois, pas de file d'attente automatisée
- Priorités : capture/import, galerie en option, impression fonctionnelle

### v2 — « Mariage / charge + admin + file d'attente » (cible : juin 2027)
Utilisable par des invités en autonomie, avec montée en charge.
- File d'attente complète avec estimation du temps
- Gestion du « rush » : numéro unique imprimé sur la photo ou le cadre
- Gestion de charge (100 utilisateurs et plus)
- Interface admin plus aboutie
- Comptes optionnels, rejoindre un événement par code

## Rôles

| Rôle | Description |
|---|---|
| Invité | Accède à l'événement par QR, prend ou importe une photo, peut imprimer selon les règles, peut publier en galerie et la consulter selon les réglages |
| Owner | Crée et paramètre l'événement, ajoute d'autres administrateurs, peut clôturer |
| Admin | Fonctions d'administration selon ses droits, peut exporter les photos |
| Équipe / opérateur (salon) | Contrôle les impressions pour éviter que 200 personnes impriment en même temps |

En v1, Owner, Admin et opérateur se confondent : c'est l'équipe du salon.

## Principes d'accès

- Web app dans Safari ou Chrome, pas d'app store, pas d'installation imposée
- Le QR code est le mécanisme principal d'accès
- Mode salon (v1) : QR direct, zéro friction
- Mode standard (v2) : QR vers l'application, puis création de compte optionnelle ou saisie d'un code événement
- Décision validée : un **QR par événement** (token dans l'URL), avec un code court saisissable en secours

## Parcours invité

1. Scanner le QR et arriver dans l'événement
2. Accueil : « Prendre une photo » ou « Importer une photo »
3. Prévisualisation
4. Choix : imprimer, et/ou ajouter à la galerie (si l'événement le permet)
5. Confirmation et suivi : en attente, en cours, prête (« à récupérer près de l'imprimante »)

## Galerie

L'organisateur règle à la création si la galerie est visible immédiatement ou cachée jusqu'à sa libération. L'invité choisit de publier ou non sa photo. Galerie cachée : les invités peuvent envoyer et imprimer sans voir les photos des autres. Pas de modération préalable ; un administrateur peut supprimer une photo.

## Impression

- **Salon (v1)** : l'équipe valide et lance les impressions une par une depuis un panneau opérateur
- **Mariage (v2)** : file d'attente, écran dédié près de l'imprimante, estimation du temps (base d'environ 1 min 30 par tirage, jusqu'à environ 8 min en rush), numéro unique imprimé sur la photo ou le cadre

## Cycle de vie et rétention

- Après clôture, l'événement reste accessible environ 6 mois
- Ensuite suppression : manuelle d'abord, automatisée plus tard
- Export en fin d'événement : zip simple, un dossier par événement, exportable par tous les administrateurs

## Exigences non fonctionnelles

- **Charge** : v1 environ 200 visiteurs sur la journée ; v2 100 utilisateurs et plus. Différencier « être connecté » de « tout le monde imprime en même temps »
- **Robustesse impression** : pas de collision ni de perte, ordre respecté
- **Compatibilité** : Safari iOS et Chrome Android/desktop au minimum
- **Simplicité** : pas de jargon, onboarding minimal
- **Confidentialité** : aucune collecte d'email ni de compte au salon ; accès aux photos par lien non devinable ; information claire sur l'usage des photos
- **Réseau** : wifi ou 4G médiocres sur site ; compression côté client, reprise sur échec

## Écrans

**Invité** : entrée, accueil de l'événement, caméra et permissions, prévisualisation avec actions, suivi d'impression, galerie.
**Admin / opérateur** : panneau d'impression manuelle (v1), réglages de l'événement, export, suppression ; v2 : création d'événement, gestion des admins, file d'attente, écran « TV près de l'imprimante ».

## Rappel de la découpe en Epics

1. Accès & onboarding · 2. Événements · 3. Capture / import photo · 4. Galerie · 5. Impression salon · 6. Impression mariage · 7. Admin & export · 8. Rétention & suppression · 9. Identité visuelle & UI kit · 10. Socle technique & qualité (ajout)

Les numéros d'Epic du brief ne correspondent pas aux clés Jira : voir `03-backlog-v1.md`.
