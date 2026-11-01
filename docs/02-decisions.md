# Décisions et questions ouvertes

## Décisions validées

| Sujet | Décision |
|---|---|
| QR code | Un QR par événement (token dans l'URL), code court saisissable en secours |
| Compte au mariage (v2) | Optionnel, sans email obligatoire |
| Impressions par invité | Limite par défaut de 2 à 3, réglable par l'organisateur |
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
| Direction visuelle | Sombre, tactile, minimale (inspirée BeReal), ambre pour les actions principales |
| Jira | Backlog dans le projet SCRUM, version « v1 Salon », type Story |

## Questions ouvertes

| # | Question | Story concernée | Qui répond |
|---|---|---|---|
| 1 | Modèle exact de l'imprimante, connexion, système de l'ordinateur du salon, formats de papier, consommables, coût par tirage, retour d'état du pilote | SCRUM-26, 42 | La personne qui fournit l'imprimante |
| 2 | Mécanisme exact de validation des impressions par l'opérateur (valider chaque job, ou « autoriser la prochaine ») | SCRUM-21, 25 | Germain |
| 3 | Accès opérateur en v1 : lien ou code secret simple, sans compte complet | SCRUM-25 | Germain |
| 4 | Quota par défaut : 2 ou 3 impressions par invité ; un échec consomme-t-il le quota ? | SCRUM-16, 21, 31 | Germain |
| 5 | Option galerie décochée par défaut (consentement explicite) | SCRUM-19, 28 | Germain |
| 6 | Un invité peut-il retirer lui-même ses photos de la galerie ? Peut-il enregistrer les photos de la galerie ? | SCRUM-28, 29 | Germain |
| 7 | Photo originale conservée, ou seulement l'image compressée ; dimensions cibles | SCRUM-17, 18, 20 | Germain, selon le format d'impression |
| 8 | Création de l'événement de démo par script (sans écran) | SCRUM-14 | Germain |
| 9 | Galerie cachée par défaut jusqu'à libération par l'organisateur | SCRUM-14, 32 | Germain |
| 10 | Mise à jour en direct de la galerie ou rafraîchissement manuel | SCRUM-29 | Germain |
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
