# Vidéo de présentation du candidat — hors du plafond 50 Mo de GoHighLevel

## Le problème

Les candidats entraient dans TalentSecure via le formulaire GHL
`xKO9CwgDoDC8l876Giwr` (location `dfkLurZY2ADWAUZl4zYc`). Son champ « vidéo de
présentation » est plafonné à **50 Mo par GoHighLevel**. Résultat : les
candidats qui prenaient la peine de faire une bonne vidéo ne pouvaient pas la
soumettre — exactement ceux qu'on veut.

**Un champ custom dans le formulaire GHL ne pouvait pas régler ça.** Les champs
d'un form GHL sont rendus et traités par GHL ; un champ fichier écrit toujours
dans le stockage GHL, avec le plafond GHL. Le Private Integration Token est une
clé serveur-à-serveur : il permet à TalentSecure de *lire* GHL, pas de changer
le comportement du formulaire dans le navigateur du candidat.

## La solution

TalentSecure héberge lui-même l'étape vidéo, et GHL passe le relais.

```
Formulaire GHL (sans champ vidéo)
   ├─→ webhook  POST /api/webhooks/gohighlevel/prospect  → crée ProspectCandidate
   └─→ redirect https://<frontend>/ma-video?c=<ghlContactId>
                    │
                    ├─ GET  /api/public/video/session   → valide, prénom, déjà-fait ?
                    ├─ POST /api/public/video/initiate  → URL présignée R2 (15 min, taille figée)
                    │        navigateur ──PUT jusqu'à 500 Mo──→ R2
                    └─ POST /api/public/video/complete  → vérifie, rattache OU met en attente
```

Les octets vont **navigateur → R2 directement**. La limite de 32 Mio par requête
de Cloud Run et le `express.json({ limit: '10mb' })` ne sont jamais rencontrés.

La page offre deux modes : **téléverser un fichier** (jusqu'à 500 Mo) ou
**enregistrer directement dans le navigateur** (MediaRecorder — ~20-50 Mo pour
2-3 min, ce qui change tout sur données cellulaires).

## La course, et comment elle est absorbée

La redirection est instantanée ; le webhook qui crée le `ProspectCandidate`
arrive quelques secondes — parfois minutes — plus tard. Le candidat peut donc
terminer sa vidéo **avant que sa fiche existe**.

L'upload est donc garé dans `pending_video_uploads`, puis « réclamé » à trois
moments (`services/pending-video.service.ts`) :

1. immédiatement, si le prospect existait déjà ;
2. à la création du prospect — webhook (`webhook.controller.ts`) et synchro
   survey (`survey-sync.service.ts`) ;
3. par balayage cron toutes les 15 min (`jobs/scheduler.ts`), filet pour tout ce
   qui a raté 1 et 2.

Ce qui échappe aux trois est visible sur `GET /api/prospects/pending-videos`
(ADMIN / RH_RECRUITER). Sans cet écran, une vidéo dont le webhook n'est jamais
arrivé dormirait dans R2 sans que personne le sache.

**Priorité :** le téléversement direct l'emporte toujours sur l'ancien champ
vidéo de GHL. Une vidéo déjà présente sur un prospect n'est jamais écrasée.

## Sécurité (endpoints non authentifiés — le candidat n'a pas de compte)

- Le lien porte le `contactId` GHL, chaîne opaque non devinable.
- Chaque appel le **revalide contre l'API GHL** : le contact existe, il est dans
  notre location, et il date de moins de 72 h.
- La clé R2 est construite entièrement côté serveur (`videos/inbox/{contactId}/{uuid}{ext}`) :
  aucun fragment fourni par le client n'atterrit dans le chemin.
- L'URL présignée fige `ContentType` **et** `ContentLength` — R2 refuse tout
  autre corps.
- Après coup : `HEAD` pour confirmer l'objet, puis vérification des **magic
  bytes** sur les 4 premiers Ko (jamais 500 Mo en mémoire). Ce qui n'est pas une
  vidéo est supprimé de R2.
- Rate limit dédié : 10 req/min/IP (`videoUploadLimiter`).

## Configuration GoHighLevel (à faire dans l'UI)

À faire **après** le déploiement, une fois la page vérifiée en production.

1. **Créer le custom field contact** `video_recue` (texte ou booléen).
   TalentSecure y écrit `true` à la réception ; c'est la condition d'arrêt du
   rappel. La clé est configurable via `GHL_VIDEO_RECEIVED_FIELD_KEY`.

2. **Rediriger après l'envoi** du formulaire `xKO9CwgDoDC8l876Giwr` vers
   `https://<frontend-prod>/ma-video`, en transmettant l'identifiant de contact.

   > La façon exacte dont form-builder-v2 transmet le contact id au redirect
   > (toggle dédié ou merge field `{{contact.id}}`) est à confirmer dans l'UI.
   > La page accepte **`?c=` et `?contact_id=`** pour couvrir les deux formes.
   > Si aucune ne fonctionne, le rappel de l'étape 3 reste le chemin garanti.

3. **Workflow de rappel** : trigger « Form Submitted = xKO9CwgDoDC8l876Giwr »
   → Wait 2 h → If/Else `video_recue` vide → SMS + courriel contenant
   `https://<frontend-prod>/ma-video?c={{contact.id}}`. Relance optionnelle à 24 h.

4. **Retirer le champ vidéo 50 Mo** du formulaire — **en dernier**. Garder le
   champ CV (PDF, largement sous la limite) et le reste.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `GHL_PIT_TOKEN`, `GHL_LOCATION_ID` | Requis. Validation des liens et marquage `video_recue`. Plus aucun fallback en dur (voir `services/ghl.client.ts`). |
| `GHL_VIDEO_RECEIVED_FIELD_KEY` | Clé du custom field GHL. Défaut : `video_recue`. |
| `USE_R2`, `R2_*` | Requis. Sans eux, `POST /initiate` répond 503 avec un message explicite. |

## Release

1. Appliquer le SQL sur Neon **avant** le merge — jamais `prisma migrate deploy`
   (historique divergent) :
   ```bash
   npx prisma db execute --file prisma/sql/add_pending_video_uploads.sql --schema prisma/schema.prisma
   ```
2. Déployer backend + frontend.
3. Configurer GHL (section ci-dessus), le retrait du champ 50 Mo en dernier.

## À vérifier en production

- **CORS du bucket R2** : il doit autoriser `PUT` depuis l'origine du frontend.
  Les téléversements staff font déjà du PUT direct depuis cette même origine,
  donc c'est probablement déjà en place — à confirmer avant de déclarer la
  fonctionnalité livrée.
- Une vraie soumission de bout en bout depuis un téléphone, sur données
  cellulaires, avec une vidéo > 50 Mo. C'est le scénario qui a motivé tout ça.
