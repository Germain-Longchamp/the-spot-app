# Décisions et questions ouvertes

## Décisions validées

| Sujet | Décision |
|---|---|
| QR code | Un QR par événement (token dans l'URL), code court saisissable en secours |
| Compte au mariage (v2) | Optionnel, sans email obligatoire |
| Quota d'impressions | Par événement, pas par invité ; sans valeur renseignée, pas de limite |
| Quota et échecs | Un échec reste compté, une annulation rend l'impression |
| Accès opérateur | Lien secret, seul le hash est stocké |
| Validation des impressions | L'opérateur lance chaque job ; « Réessayer » relance directement |
| Galerie | Suppression d'une photo par un administrateur, pas de modération préalable |
| Export | Zip simple, un dossier par événement, tous les admins peuvent exporter |
| Clôture | Seul l'Owner clôture |
| Rétention | Environ 6 mois après clôture, suppression manuelle d'abord |
| Installation | Pas d'installation imposée ; expérience « page web » rassurante |
| Stack | Next.js 14, Supabase (auth anonyme, Postgres + RLS, Storage, Realtime), agent Node.js sous PM2 |
| Impression | Agent local sur l'ordinateur branché à l'imprimante, connexion sortante uniquement |
| STUCK | Implémenté dès le départ avec le heartbeat (seuil 60 s via `pg_cron`, sans fonction Edge) |
| DONE tardif | Accepté après `STUCK` si la tentative est la même et sans réessai ; sinon ignoré et tracé |
| Mitigation v1 | Une personne est présente à l'ordinateur du salon pendant l'événement |
| Ordre de construction | Pipeline d'impression avant l'interface |
| Direction visuelle | Thème clair (Germain, 2026-11-08, SCRUM-46, remplace le thème sombre du 2026-11-06) : fond crème, cartes blanches, Framboise pour les actions, Pêche en décor, logo couleur, police Inter ; parcours invité en écrans par étape |
| Nom affiché | « The Spot Memories » (2026-11-06) |
| Galerie : deux réglages | `gallery_enabled` : l'événement a une galerie, l'invité peut publier ; `gallery_visible` : la galerie est ouverte et consultable. Une photo publiée galerie fermée apparaît à l'ouverture (SCRUM-28, à confirmer par Germain) |
| Une seule entrée « Galerie » | Plus de « Mes photos » : la Galerie montre les photos partagées (galerie ouverte) et toutes celles de l'invité ; une photo non partagée n'est visible que de son auteur, marquée « Non partagée ». Case « Ajouter à la galerie » **cochée par défaut**, décochable (Germain, 2026-11-11, SCRUM-63) |
| Enregistrer les photos de la galerie | Oui : tout invité peut télécharger les photos de la galerie ouverte (Germain, 2026-11-11, SCRUM-59) |
| Suppression d'une photo (équipe) | Depuis le panneau opérateur, après confirmation : la photo quitte la galerie de tous, ses fichiers sont effacés, l'enregistrement reste (historique des impressions) et l'action est tracée. Refusée tant qu'une impression de la photo est en attente ou à vérifier (SCRUM-30, à confirmer par Germain) |
| Réglages pendant le salon | Depuis le panneau opérateur : galerie (activée, ouverte), limite d'impressions (vide = sans limite, vaut pour les prochaines demandes seulement), fermeture de l'événement avec confirmation, réversible tant que rien n'est purgé. Chaque changement est tracé (SCRUM-32, à confirmer par Germain) |
| Journal des erreurs | Sans service tiers : table `app_errors` dans Supabase (téléphones via `log_app_error`, limité à 20/min par téléphone et 300/min au total ; agent avec la clé serveur), lue avec `apps/web/scripts/recent-errors.mjs` ou le tableau de bord Supabase. L'agent écrit aussi un journal JSON local avec rotation (5 Mo × 5) et garde ses erreurs hors réseau. Liens secrets et identifiants masqués (SCRUM-41, à confirmer par Germain : service tiers et durée de conservation) |
| Jira | Backlog dans le projet SCRUM, version « v1 Salon », type Story |

## Questions ouvertes

| # | Question | Story concernée | Qui répond |
|---|---|---|---|
| 1 | Modèle exact de l'imprimante, connexion, système de l'ordinateur du salon, formats de papier, consommables, coût par tirage, retour d'état du pilote | SCRUM-26, 42 | La personne qui fournit l'imprimante |
| 6 | Un invité peut-il retirer lui-même ses photos de la galerie, ou partager après coup une photo gardée pour lui ? (L'enregistrement est tranché, voir plus haut.) | SCRUM-28, 29, 63 | Germain |
| 7 | Photo originale conservée, ou seulement l'image compressée ; dimensions cibles | SCRUM-17, 18, 20 | Germain, selon le format d'impression |
| 8 | Création de l'événement de démo par script (sans écran) | SCRUM-14 | Germain |
| 9 | Galerie cachée par défaut jusqu'à libération par l'organisateur | SCRUM-14, 32 | Germain |
| 10 | Galerie à jour toute seule (SCRUM-54, sans bouton « Actualiser ») : interrogation toutes les 10 s, onglet visible seulement, plutôt que Supabase Realtime. Hypothèse en place, à confirmer | SCRUM-29, 54 | Germain |
| 11 | La fermeture d'un événement est-elle réversible avant purge ? | SCRUM-32 | Germain |
| 12 | L'export contient-il aussi les photos non publiées ? Format des noms de fichiers ? | SCRUM-33 | Germain |
| 13 | Purge par script ou par écran en v1 ; confirmation par saisie du nom de l'événement | SCRUM-35 | Germain |
| 14 | Message d'information RGPD : simple information sans case à cocher ; texte validé juridiquement avant la démo | SCRUM-34 | Germain, avis juridique |
| 15 | Web app sans installation vs support PWA (manifeste seul ou rien) | SCRUM-39 | Germain |
| 16 | Hébergement de l'application web | SCRUM-39 | Germain |
| 17 | Service de suivi d'erreurs, durée de conservation des journaux | SCRUM-41 | Germain |
| 18 | Cible de charge (200 visiteurs sur la journée, pic d'environ 50 simultanés) et seuils acceptables | SCRUM-43 | Germain |
| 19 | Ajustement attendu pour la boucle du S du logo, fichier source disponible | SCRUM-37 | Germain |
| 20 | Contraste cible (WCAG AA) à vérifier en forte lumière | SCRUM-36 | Germain |

## Tensions à surveiller

- Le brief cite 200 personnes au salon alors que les décisions de design visaient environ 50 utilisateurs simultanés. À trancher avant le test de charge (question 18).
- Le brief écarte l'installation obligatoire alors que la stack mentionne le support PWA (question 15).
- Aucun matériel testé à ce jour : tant que le spike d'impression sur la vraie imprimante n'est pas fait, le pipeline reste validé uniquement avec l'imprimante simulée.

## Hors périmètre actuel (v2)

File d'attente automatique et estimation du temps, numéro unique sur la photo ou le cadre, comptes utilisateurs, rejoindre par code, gestion de plusieurs administrateurs, rétention automatique, écran « TV près de l'imprimante ».
