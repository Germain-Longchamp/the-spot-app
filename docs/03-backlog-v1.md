# Backlog v1 « Salon » — clés Jira

Site Jira : `glongchamp8.atlassian.net` · Projet : **SCRUM** · Version : **v1 Salon**
Priorités : High / Medium / Low · Criticité : 🟢 faible, 🟡 moyenne, 🔴 forte (relecture approfondie par Germain).

## Epics

| Clé | Epic | Version |
|---|---|---|
| SCRUM-5 | EPIC 1 — Accès & onboarding | v1 puis v2 |
| SCRUM-6 | EPIC 2 — Événements | v1 puis v2 |
| SCRUM-7 | EPIC 3 — Capture / import photo | v1 |
| SCRUM-8 | EPIC 4 — Galerie | v1 puis v2 |
| SCRUM-9 | EPIC 5 — Impression salon (contrôle manuel) | v1 |
| SCRUM-10 | EPIC 6 — Impression mariage (file d'attente) | **v2, hors périmètre actuel** |
| SCRUM-11 | EPIC 7 — Admin & export | v1 minimal, v2 |
| SCRUM-12 | EPIC 8 — Rétention & suppression des données | v1 minimal, v2 |
| SCRUM-13 | EPIC 9 — Identité visuelle & UI kit | v1 |
| SCRUM-38 | EPIC 10 — Socle technique & qualité | v1 |

## Stories

### EPIC 10 — Socle technique & qualité (SCRUM-38)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-39 | Mettre en place le squelette du projet et les environnements | High | 🟡 |
| SCRUM-40 | Mettre en place l'intégration continue (tests, lint, build) | Medium | 🟡 |
| SCRUM-41 | Journaliser les erreurs de l'application et de l'agent | Medium | 🟡 |
| SCRUM-42 | Préparer l'ordinateur du salon (agent, démarrage auto, connexion de secours) | High | 🔴 |
| SCRUM-43 | Tester la charge d'envoi de photos et d'accès simultanés | High | 🟡 |
| SCRUM-44 | Réaliser une répétition générale avec de vrais appareils | High | 🟡 |

### EPIC 2 — Événements (SCRUM-6)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-14 | Créer l'événement de démo du salon et générer son QR direct | High | 🟡 |
| SCRUM-32 | Régler les paramètres de l'événement pendant le salon | Medium | 🟡 |

### EPIC 1 — Accès & onboarding (SCRUM-5)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-15 | Entrer dans l'événement salon via le QR, sans compte ni code | High | 🔴 |
| SCRUM-16 | Conserver l'identité anonyme de l'invité sur son appareil | High | 🟡 |

### EPIC 3 — Capture / import photo (SCRUM-7)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-27 | Afficher l'accueil de l'événement avec les actions principales | High | 🟢 |
| SCRUM-17 | Prendre une photo avec la caméra du téléphone | Medium | 🟡 |
| SCRUM-18 | Importer une photo depuis la galerie du téléphone | Medium | 🟡 |
| SCRUM-19 | Prévisualiser la photo et choisir imprimer / ajouter à la galerie | Medium | 🟡 |
| SCRUM-20 | Envoyer la photo de façon robuste (compression, reprise sur échec) | Medium | 🟡 |

### EPIC 5 — Impression salon (SCRUM-9)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-21 | Créer une demande d'impression depuis l'application | High | 🔴 |
| SCRUM-22 | Gérer le cycle de vie du job d'impression et ses statuts | High | 🔴 |
| SCRUM-23 | Traiter les jobs avec un agent d'impression et une imprimante simulée | High | 🔴 |
| SCRUM-24 | Afficher en permanence le statut de l'agent d'impression (heartbeat) | High | 🔴 |
| SCRUM-25 | Piloter les impressions depuis un panneau opérateur (une à la fois) | High | 🔴 |
| SCRUM-31 | Suivre l'état de ma demande d'impression (côté invité) | High | 🟡 |
| SCRUM-26 | Brancher la vraie imprimante photo à l'agent (**bloquée : modèle inconnu**) | High | 🔴 |

### EPIC 4 — Galerie (SCRUM-8)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-28 | Ajouter sa photo à la galerie de l'événement | Medium | 🟡 |
| SCRUM-29 | Consulter la galerie de l'événement | Medium | 🔴 |
| SCRUM-30 | Supprimer une photo de la galerie (administrateur) | Medium | 🔴 |

### EPIC 7 — Admin & export (SCRUM-11)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-33 | Exporter toutes les photos de l'événement en zip | Medium | 🔴 |

### EPIC 8 — Rétention & suppression (SCRUM-12)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-34 | Informer les invités de l'usage de leurs photos | Medium | 🟡 |
| SCRUM-35 | Supprimer toutes les données d'un événement (purge manuelle) | Medium | 🔴 |

### EPIC 9 — Identité visuelle & UI kit (SCRUM-13)
| Clé | Story | Priorité | Crit. |
|---|---|---|---|
| SCRUM-36 | Poser les fondations visuelles (couleurs, typographie, composants de base) | Medium | 🟢 |
| SCRUM-37 | Ajuster le logo The Spot (boucle du S) et l'intégrer à l'application | Low | 🟢 |

## Étiquettes

`v1-salon` sur tout le lot. En plus : `acces` (SCRUM-14, 15, 16), `capture` (SCRUM-17 à 20, 27), `impression` (SCRUM-21 à 26, 31), `galerie` (SCRUM-28 à 30), `admin` (SCRUM-30, 32, 33, 35), `design` (SCRUM-36, 37).

## Dépendances principales

```
SCRUM-39 (squelette) ──► tout le reste
SCRUM-36 (fondations visuelles) ──► écrans des stories invité et opérateur

SCRUM-14 (événement + token) ──► SCRUM-15 (entrée QR) ──► SCRUM-16 (identité) ──► SCRUM-27 (accueil)
SCRUM-27 ──► SCRUM-17 / SCRUM-18 ──► SCRUM-19 (preview) ──► SCRUM-20 (envoi)

SCRUM-20 ──► SCRUM-21 (demande d'impression) ──► SCRUM-22 (statuts)
SCRUM-22 ──► SCRUM-23 (agent simulé) ──► SCRUM-24 (heartbeat) ──► SCRUM-25 (opérateur)
SCRUM-22 + SCRUM-24 ──► SCRUM-31 (suivi côté invité)
SCRUM-23 ──► SCRUM-26 (vraie imprimante) ──► SCRUM-42 (poste du salon)

SCRUM-19 + SCRUM-20 ──► SCRUM-28 (publier) ──► SCRUM-29 (consulter) ──► SCRUM-30 (supprimer)
SCRUM-25 ──► SCRUM-30, SCRUM-32, SCRUM-33, SCRUM-35 (droits opérateur)
SCRUM-33 (export) ──► SCRUM-35 (purge)

Tout le parcours ──► SCRUM-43 (charge) ──► SCRUM-44 (répétition générale)
```

## Ordre de construction recommandé

1. **SCRUM-39, 40** — squelette, intégration continue
2. **SCRUM-36** — fondations visuelles (en parallèle)
3. **SCRUM-14, 15, 16** — événement et accès
4. **SCRUM-21, 22, 23, 24** — pipeline d'impression avec imprimante simulée (avant l'interface)
5. **SCRUM-27, 17, 18, 19, 20** — accueil, capture, import, envoi
6. **SCRUM-25, 31, 32** — opérateur, suivi côté invité, réglages
7. **SCRUM-41** — journalisation
8. **SCRUM-26, 42** — vraie imprimante et poste du salon, **dès que le modèle est connu** (le spike peut commencer plus tôt avec les informations disponibles)
9. **SCRUM-28, 29, 30, 33, 34, 35, 37** — galerie, export, information, purge, logo
10. **SCRUM-43, 44** — test de charge puis répétition générale en début de janvier

## Tickets à ignorer

SCRUM-1 à SCRUM-4 : tickets vides de démarrage du projet, à supprimer dans Jira.
