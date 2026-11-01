# Méthode de travail avec Claude Code

## Rôles

- **Germain** : Product Owner et relecteur. Il tranche les points ouverts, relit les parties sensibles, teste sur le matériel et les téléphones réels.
- **Claude Code** : implémente les stories, écrit les tests, documente, signale ses hypothèses.

## Boucle par story

1. Germain donne la clé : « implémente SCRUM-xx »
2. Claude lit la story dans Jira (description, panels, critères Gherkin, hypothèses)
3. Il identifie les hypothèses et points ouverts de la story. Il **pose la question** à Germain, ou implémente la solution la plus simple en le signalant
4. Création d'une branche dédiée à la story
5. Écriture des tests à partir des scénarios Gherkin, puis du code
6. Intégration continue : lint, types, tests, build
7. Pull request avec : résumé, scénarios couverts, hypothèses prises, points à relire
8. Relecture de Germain, puis fusion
9. Statut Jira : « En cours » au démarrage et « Test » à l'ouverture de la PR, par Claude ; « Terminé(e) » par Germain

## Panels de la charte Jira

Les stories suivent une charte de couleurs identique partout :

| Couleur | Section |
|---|---|
| Vert | Inclus |
| Rouge | Exclu (ne pas implémenter) |
| Bleu | Règles métier |
| Violet | Critères d'acceptation (Gherkin) |
| Orange | Cas limites / erreurs, étapes d'implémentation |

Le panel rouge est aussi important que le vert : ce qui est exclu appartient à une autre story ou à la v2.

## Ce qui exige une relecture attentive de Germain

- Politiques RLS et accès au Storage
- Verrou, idempotence et transitions des jobs d'impression
- Quota d'impressions (atomicité)
- Droits et accès opérateur
- Export et purge d'un événement
- Tout ce qui touche à l'agent d'impression et à l'imprimante réelle

## Tests

- Les critères Gherkin deviennent des tests (unitaires ou de bout en bout)
- Les tests sur appareils réels (iPhone et Android) restent manuels : caméra, import, envoi, lisibilité en forte lumière
- Test de charge avant le salon (SCRUM-43), répétition générale début janvier (SCRUM-44)
- Un spike sur la vraie imprimante dès que le modèle est connu : un seul tirage de bout en bout avant tout le reste du branchement matériel

## Calendrier à rebours depuis janvier 2027

- **Novembre** : squelette, base de données, pipeline d'impression avec imprimante simulée, premier tirage sur le vrai matériel dès que possible
- **Décembre** : accès, capture et import, panneau opérateur, galerie, tests terrain sur plusieurs téléphones
- **Début janvier** : test de charge, répétition générale avec un petit groupe, corrections
- **Deux dernières semaines avant le salon** : gel des fonctionnalités, corrections uniquement

## Mise à jour de la documentation

Quand une question ouverte est tranchée, on met à jour `02-decisions.md`, puis le document concerné (`04-impression.md`, `05-donnees.md`, etc.), puis `CLAUDE.md` si la règle change le travail quotidien. Les commandes de lancement, de test et de lint sont à renseigner dans `CLAUDE.md` une fois SCRUM-39 terminée.
