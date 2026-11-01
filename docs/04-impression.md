# Pipeline d'impression

Ce document décrit la **v1** (contrôle manuel par l'équipe). Stories : SCRUM-21 à 26, 31, 42.

## Vue d'ensemble

```
Téléphone invité ──► Supabase (photo + job PENDING)
                         ▲   │
        heartbeat, statut│   │ jobs autorisés (connexion sortante)
                         │   ▼
              Agent Node.js (PM2) ──► imprimante (via pilote / file système)
                         ▲
              Panneau opérateur (écran de l'équipe)
```

- L'agent tourne sur l'ordinateur branché à l'imprimante.
- Il ne s'expose pas sur le réseau : il interroge ou écoute Supabase, jamais l'inverse.
- Un opérateur est présent à l'ordinateur pendant l'événement (mitigation validée de la fragilité de l'agent local).

## Cycle de vie d'un job

Statuts : `PENDING → PRINTING → DONE / STUCK / FAILED`

| De | Vers | Déclencheur |
|---|---|---|
| (création) | PENDING | L'invité demande une impression (SCRUM-21) |
| PENDING | PRINTING | L'agent prend le job (après autorisation de l'opérateur, voir ci-dessous) |
| PRINTING | DONE | L'impression se termine |
| PRINTING | FAILED | Erreur d'impression avec un motif |
| PRINTING | STUCK | Plus de signe de vie de l'agent depuis 60 s (`pg_cron`) |
| STUCK | PENDING | Réessai manuel par l'opérateur |
| STUCK | DONE | L'agent revient et confirme sa tentative, sans réessai entre-temps |
| FAILED | PENDING | Réessai manuel par l'opérateur |

Interdit : toute transition depuis `DONE`. Les transitions passent par une **fonction serveur unique et atomique** (`transition_print_job`). L'historique de chaque transition est conservé, avec l'heure du serveur, ainsi que les demandes refusées.

Chaque prise de job incrémente un numéro de tentative, que l'agent doit rappeler dans ses comptes rendus.

Cas à traiter explicitement :
- deux agents tentent de prendre le même job → un seul réussit (verrou) ;
- l'agent plante en plein `PRINTING` → le job passe en `STUCK` ; la photo est peut-être déjà sortie, l'opérateur décide du réessai ;
- réponse `DONE` tardive après un passage en `STUCK` → **acceptée** si le job est encore `STUCK` sur la même tentative : la photo est sortie, et un réessai l'imprimerait deux fois. Après un réessai, l'annonce est ignorée et tracée (décision de Germain, SCRUM-22).

## Contrôle manuel en v1

Pas de file automatisée. Règles :
- un seul job en `PRINTING` à la fois ;
- l'opérateur lance, réessaie ou annule un job ; il peut mettre toutes les impressions en pause ;
- chaque action opérateur est tracée.

**Question ouverte** (SCRUM-21 et SCRUM-25) : l'opérateur valide-t-il chaque job avant son passage en impression, ou autorise-t-il « la prochaine » ? Dans les deux cas, la solution simple est un horodatage d'autorisation sur le job que l'agent exige avant de le prendre. À confirmer avec Germain avant d'implémenter.

## Quota

- Quota d'impressions par invité (défaut à fixer : 2 ou 3), réglable par l'opérateur
- Le décompte est **atomique** (deux demandes simultanées ne dépassent pas le quota)
- Un changement de quota s'applique aux demandes suivantes, sans effet rétroactif (hypothèse)
- Question ouverte : un job en échec consomme-t-il le quota ?

## Idempotence

- Chaque demande d'impression porte une clé d'idempotence ; une contrainte d'unicité empêche deux jobs pour la même demande
- Un redémarrage de l'agent ne doit jamais provoquer deux impressions de la même photo

## Agent d'impression

Responsabilités (SCRUM-23) :
1. Récupérer les jobs autorisés
2. Verrouiller le job
3. Télécharger l'image via une URL signée
4. Préparer l'image (dimensions, marges, format du papier)
5. Appeler l'imprimante via `print(image, options)`
6. Mettre à jour le statut du job
7. Envoyer le heartbeat

Interface unique :

```ts
interface Printer {
  print(image: Buffer, options: PrintOptions): Promise<PrintResult>;
}
```

Deux implémentations : `SimulatedPrinter` (délai configurable, succès, échec, lenteur) et l'implémentation réelle pour le modèle choisi (SCRUM-26). **Seule cette interface change** entre le simulateur et le matériel.

Configuration : démarrage et redémarrage automatiques via PM2 (`apps/print-agent/ecosystem.config.cjs`), journal local avec rotation (`pm2-logrotate`), aucun secret dans le dépôt.

L'agent exige Node 22 : il plante au démarrage sous Node 20. Il interroge Supabase toutes les 2 s : c'est une connexion sortante uniquement. Trois règles protègent contre une double impression :
- après un redémarrage, l'agent ne reprend jamais seul un job commencé : celui-ci passe en `STUCK` et l'opérateur décide ;
- juste avant d'imprimer, l'agent vérifie que le job est toujours à lui sur la même tentative ; en cas de doute, il n'imprime pas ;
- le téléchargement est limité à 3 essais, pour rester sous le seuil de 60 s.

## Heartbeat et statut visible

- L'agent envoie un signal de vie régulier ; l'heure du serveur fait foi (pas celle de l'ordinateur du salon)
- Au-delà de 60 s sans signal : agent « hors ligne » ; les jobs en `PRINTING` passent en `STUCK`
- L'indicateur d'état est **toujours visible** sur l'écran d'impression de l'invité et sur le panneau opérateur
- Il ne doit pas clignoter pour un retard bref (tolérance à la latence)
- Textes : « L'imprimante est connectée » / « L'imprimante n'est pas connectée pour le moment »
- Couleurs : teal pour en ligne, rouge pour hors ligne ou erreur

## Côté invité (SCRUM-31)

| Statut interne | Texte affiché (indicatif) |
|---|---|
| PENDING | En attente de validation par l'équipe |
| PRINTING | Impression en cours |
| DONE | Votre photo est prête, à récupérer près de l'imprimante |
| STUCK / FAILED | Un souci est survenu, rendez-vous auprès de l'équipe |

Aucun statut brut n'est jamais affiché. En v2, le texte de position deviendra « N photos avant la vôtre ».

## Imprimante réelle (SCRUM-26) — en attente d'informations

Imprimante photo professionnelle fournie par le client. À obtenir : modèle, connexion (USB, réseau, Wi-Fi), système de l'ordinateur (Windows ou Mac), formats de papier, consommables et coût par tirage, retour d'état disponible via le pilote.

Principe d'intégration : préparer une image au bon format, puis la passer au pilote via la file d'impression du système. Le cadre et le numéro de la v2 se feront par composition d'image dans notre code, sans dépendre de l'imprimante.

Le **spike** à réaliser dès que possible : photo envoyée depuis un téléphone → job → agent → tirage sur le matériel réel, avec le statut visible. Mesurer le débit réel sur une série d'au moins dix tirages (l'estimation d'environ 1 min 30 par tirage est à vérifier).
