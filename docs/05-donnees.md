# Modèle de données — proposition à valider

Ce schéma est une **proposition de départ** déduite des stories. Il n'a pas été validé par Germain : à relire avant la première migration (SCRUM-14, 21, 22). Les noms sont en anglais.

## Tables

### `events`
| Colonne | Type | Remarque |
|---|---|---|
| id | uuid | clé primaire |
| name | text | ex. « Salon démo » |
| event_date | date | optionnelle |
| access_token | text | unique, aléatoire, non devinable |
| short_code | text | unique, saisissable en secours |
| status | enum `open` / `closed` | |
| gallery_visibility | enum `visible` / `hidden` | |
| print_limit | int | quota d'impressions de l'événement ; vide = pas de limite |
| printing_paused | bool | pause globale par l'opérateur |
| created_at, closed_at | timestamptz | |

### `guests`
Identité anonyme d'un invité, rattachée à une session Supabase anonyme.
| Colonne | Type |
|---|---|
| id | uuid |
| event_id | uuid → events |
| auth_user_id | uuid (session anonyme) |
| created_at | timestamptz |

### `photos`
| Colonne | Type | Remarque |
|---|---|---|
| id | uuid | |
| event_id | uuid | |
| guest_id | uuid | |
| storage_path | text | image envoyée |
| thumb_path | text | vignette de galerie |
| is_published | bool | **faux par défaut** |
| idempotency_key | text | unique par envoi |
| created_at | timestamptz | |

### `print_jobs`
| Colonne | Type | Remarque |
|---|---|---|
| id | uuid | |
| event_id, photo_id, guest_id | uuid | |
| status | enum `PENDING` / `PRINTING` / `DONE` / `STUCK` / `FAILED` / `CANCELLED` | |
| idempotency_key | text | unique par invité |
| authorized_at | timestamptz | autorisation de l'opérateur (hypothèse, voir `04-impression.md`) |
| attempt | int | numéro de la tentative, incrémenté à chaque prise |
| claimed_by | text | identifiant de l'agent qui a verrouillé le job |
| last_error | text | motif d'échec |
| last_activity_at | timestamptz | dernier signe de vie, base du passage en `STUCK` |
| created_at, started_at, finished_at | timestamptz | |

### `print_job_events`
Historique des transitions : `job_id`, `from_status`, `to_status`, `actor` (invité, agent, opérateur, système), `attempt`, `applied` (faux pour une demande refusée), `detail`, `created_at`.

### `agent_heartbeats`
`agent_id`, `event_id`, `last_seen_at` (heure du serveur).

### `operator_actions`
Journal des actions sensibles : suppression de photo, purge, lancement ou annulation de job, changement de réglage. Colonnes : `event_id`, `action`, `target_id`, `created_at`. Ne contient aucune photo ni donnée personnelle.

## Règles d'accès (RLS)

À écrire dans la même migration que chaque table. Principe :

| Acteur | Droits |
|---|---|
| Invité (session anonyme) | Lit l'événement de son token ; crée et lit **ses propres** photos et jobs ; lit les photos **publiées** de son événement si la galerie est visible ; aucun accès aux autres événements |
| Opérateur | Lit et agit sur son événement : jobs, photos, réglages, export, suppression |
| Agent | Lit les jobs autorisés de son événement, met à jour leur statut, écrit son heartbeat ; ne lit jamais d'autres événements |
| Anonyme sans token | Aucun accès |

Points à faire relire par Germain : isolation entre événements, visibilité de la galerie, accès aux fichiers du Storage (URLs signées, durée de vie), droits de l'agent.

## Stockage

- Bucket privé ; accès par URL signée de courte durée
- Vignettes générées pour la galerie
- Hypothèse (question ouverte) : seule l'image compressée est conservée
- La suppression d'une photo supprime le fichier, les vignettes et l'enregistrement de façon cohérente

## Fonctions serveur (RPC) attendues

- `create_print_job` : vérifie le quota de l'événement et crée le job de façon atomique, avec la clé d'idempotence
- `transition_print_job` : seule voie de changement de statut, avec contrôle des transitions (rôle service uniquement)
- `claim_print_job` : verrouille un job pour un agent
- `mark_stuck_jobs` : appelée par `pg_cron` toutes les 10 s, passe en `STUCK` les jobs sans activité depuis 60 s
- `record_agent_heartbeat` : signal de vie de l'agent et de son job en cours (rôle service uniquement)
- `get_printer_status` : vrai si un agent de l'événement a donné signe de vie depuis moins de 60 s
- `delete_photo`, `purge_event` : suppressions cohérentes, avec trace

## Rétention

Événement accessible environ 6 mois après clôture, puis suppression. Purge manuelle en v1 (SCRUM-35), après export (SCRUM-33). Aucune collecte d'email ni de compte au salon.
