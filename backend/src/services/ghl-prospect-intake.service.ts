import { prisma } from '../config/database';
import { findMatchingCandidate, findMatchingEmployee } from '../utils/candidateMatch';
import { canonicalCity, resolveProvince } from '../utils/cityNormalize';
import { parseGhlAvailability, findGhlAvailabilityAnswer, AvailabilityFlags } from '../utils/availability';
import { claimForProspect } from './pending-video.service';
import { resolveProspectCoordinates } from './cityGeocode.service';
import { findSubmittedPhoneByEmail, isGhlConfigured } from './ghl.client';

/**
 * Entrée d'un CV venu du formulaire GHL dans les Candidats Potentiels.
 *
 * Partagé par le webhook (`POST /api/webhooks/gohighlevel/prospect`) et le
 * script de rattrapage `replay:ghl-cvs`, pour qu'un CV rejoué à la main passe
 * exactement par les mêmes règles qu'un CV reçu en direct.
 */

export interface GhlProspectInput {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  city: string | null;
  streetAddress: string | null;
  provinceRaw: string | null;
  postalCode: string | null;
  country: string;
  cvUrl: string | null;
  videoUrl: string | null;
  disponibilites: AvailabilityFlags | null;
}

export interface GhlIntakeResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Normalise le nom d'une ville
 */
function normalizeCity(city: string | null | undefined): string | null {
  if (!city || !city.trim()) return null;
  return canonicalCity(city);
}

/**
 * Lit la charge utile du webhook. GoHighLevel envoie les données dans
 * différents formats ; on supporte les trois formats courants
 * (priorité : body direct, puis form_data, puis contact).
 */
export function readGhlWebhookBody(body: any): GhlProspectInput {
  const bodyData = body || {};
  const formData = bodyData.form_data || {};
  const contactData = bodyData.contact || {};

  return {
    // Le formulaire garde l'espace tapée en fin de nom (« Olson ») : on la retire.
    firstName: String(bodyData.first_name || formData.first_name || contactData.first_name || '').trim(),
    lastName: String(bodyData.last_name || formData.last_name || contactData.last_name || '').trim(),
    email: bodyData.email || formData.email || contactData.email || null,
    phone: bodyData.phone || formData.phone || contactData.phone || '',
    city: bodyData.city || formData.city || contactData.city || null,
    streetAddress: bodyData.street_address || bodyData.stret_addess || formData.street_address || contactData.address1 || null,
    provinceRaw: bodyData.state || formData.state || contactData.state || null,
    postalCode: bodyData.postal_code || formData.postal_code || contactData.postal_code || null,
    country: bodyData.country || formData.country || contactData.country || 'CA',
    cvUrl: bodyData.cv_url || formData.cv_url || contactData.svp_joindre_votre_cv || null,
    videoUrl:
      bodyData.video_url || formData.video_url ||
      contactData.video_de_presentation || contactData.video_presentation || null,
    // Disponibilités du formulaire « Renseignements étudiants ». Le webhook ne
    // transporte qu'une liste FIXE de champs et jetait donc tout champ custom.
    // Repérage par la valeur (les clés GHL ne sont pas stables) sur les trois
    // formats de charge utile ; rien de reconnu → aucune écriture.
    disponibilites: parseGhlAvailability(
      findGhlAvailabilityAnswer(bodyData) ??
      findGhlAvailabilityAnswer(formData) ??
      findGhlAvailabilityAnswer(contactData)
    ),
  };
}

export async function ingestGhlProspect(input: GhlProspectInput): Promise<GhlIntakeResult> {
  const {
    firstName, lastName, email, city, streetAddress, provinceRaw, postalCode, country,
    cvUrl, videoUrl, disponibilites,
  } = input;
  let { phone } = input;
  // Province d'après le code postal (le plus fiable), sinon la valeur fournie, sinon QC.
  const province = resolveProvince({ postalCode, province: provinceRaw });

  // Contact GHL en double : le numéro est resté sur l'autre fiche et arrive
  // vide. On le reprend dans la soumission du formulaire plutôt que de perdre
  // le CV (4 personnes refusées ainsi en octobre 2026). Best-effort : GHL
  // indisponible → on retombe sur le refus habituel.
  if (!phone && email && firstName && isGhlConfigured()) {
    try {
      phone = (await findSubmittedPhoneByEmail(email)) || '';
      if (phone) console.log('📞 Téléphone absent du contact GHL — repris de la soumission du formulaire');
    } catch (e: any) {
      console.error('⚠️ Recherche du téléphone dans la soumission GHL impossible:', e.message);
    }
  }

  // Valider les champs requis
  if (!firstName || !phone) {
    // S7 — pas de PII : on logge la présence, pas les valeurs.
    console.error('❌ Champs requis manquants:', { hasFirstName: !!firstName, hasPhone: !!phone });
    // S12 — pas de PII en réponse : on indique seulement la présence des champs.
    return {
      status: 400,
      body: {
        error: 'Missing required fields',
        required: ['first_name', 'phone'],
        received: { hasFirstName: !!firstName, hasPhone: !!phone },
      },
    };
  }

  // Vérifier les doublons (par email OU téléphone).
  // F4 — ne JAMAIS mettre un objet vide dans le OR : Prisma le ferait matcher
  // TOUTES les lignes (→ faux « doublon » quand l'email est absent). Le
  // téléphone est requis (validé plus haut) ; l'email est optionnel.
  const duplicateOr: any[] = [{ phone }];
  if (email) duplicateOr.push({ email });
  const existingProspect = await prisma.prospectCandidate.findFirst({
    where: {
      OR: duplicateOr,
      isDeleted: false,
    },
  });

  // L'EMPLOYÉ GAGNE SUR TOUT : déjà employé → non ajouté aux Candidats Potentiels.
  const matchingEmployee = await findMatchingEmployee(prisma, email, phone);
  if (matchingEmployee) {
    console.log('ℹ️ Déjà Employé — non ajouté aux Candidats Potentiels:', {
      employeeId: matchingEmployee.id,
    });
    return {
      status: 200,
      body: {
        message: 'Cette personne est déjà un Employé. Non ajoutée aux Candidats Potentiels.',
        employeeId: matchingEmployee.id,
      },
    };
  }

  // LE CANDIDAT GAGNE TOUJOURS : si cette personne est déjà un Candidat,
  // on ne l'ajoute pas aux Candidats Potentiels. Si une fiche prospect
  // existe déjà, on la lie au candidat (converti) pour qu'elle disparaisse
  // de la liste.
  const matchingCandidate = await findMatchingCandidate(prisma, email, phone);
  if (matchingCandidate) {
    if (existingProspect && !existingProspect.isConverted) {
      await prisma.prospectCandidate.update({
        where: { id: existingProspect.id },
        data: {
          isConverted: true,
          convertedAt: new Date(),
          convertedToId: matchingCandidate.id,
        },
      });
    }
    console.log('ℹ️ Déjà Candidat — non ajouté aux Candidats Potentiels:', {
      candidateId: matchingCandidate.id,
    });
    return {
      status: 200,
      body: {
        message: 'Cette personne est déjà un Candidat. Non ajoutée aux Candidats Potentiels.',
        candidateId: matchingCandidate.id,
      },
    };
  }

  if (existingProspect) {
    // La personne renvoie le formulaire avec un AUTRE CV : c'est sa version à
    // jour, on la garde (avant, le renvoi tombait en 409 et le CV était jeté).
    // La copie R2 passe avant cvUrl à l'affichage (getProspectCvUrl) → on la
    // retire, sinon l'ancien CV resterait affiché. La date de soumission
    // avance pour que la fiche remonte en tête de liste.
    if (cvUrl && cvUrl !== existingProspect.cvUrl && !existingProspect.isConverted) {
      await prisma.prospectCandidate.update({
        where: { id: existingProspect.id },
        data: {
          cvUrl,
          cvStoragePath: null,
          submissionDate: new Date(),
          ...(disponibilites ?? {}),
        },
      });
      console.log('🔄 CV mis à jour sur un prospect existant:', { id: existingProspect.id });
      return {
        status: 200,
        body: {
          success: true,
          message: 'CV mis à jour sur le prospect existant',
          prospectId: existingProspect.id,
        },
      };
    }

    console.log('⚠️ Prospect déjà existant:', {
      id: existingProspect.id,
    });
    return {
      status: 409,
      body: {
        error: 'Duplicate prospect',
        message: 'Un prospect avec cet email ou téléphone existe déjà',
        existingProspectId: existingProspect.id,
        matchedBy: existingProspect.email === email ? 'email' : 'phone',
      },
    };
  }

  // Normaliser la ville
  const normalizedCity = normalizeCity(city);

  // Géocodage à la saisie — code postal (FSA) d'abord, sinon centre-ville.
  // C'est LA porte d'entrée de la majorité des CV : sans ça, la fiche n'a
  // aucune coordonnée et reste invisible sur la carte des Candidats Potentiels
  // jusqu'à ce que quelqu'un pense à lancer backfillProspectGeocodes à la main.
  // Best-effort : Nominatim indisponible ne doit JAMAIS faire perdre un CV —
  // la fiche est créée sans position et le backfill la rattrapera.
  let geo: Awaited<ReturnType<typeof resolveProspectCoordinates>> = null;
  try {
    geo = await resolveProspectCoordinates({ postalCode, city: normalizedCity });
  } catch (e: any) {
    console.error('⚠️ Géocodage impossible (prospect créé sans position):', e.message);
  }

  // Créer le prospect dans la base de données
  const prospect = await prisma.prospectCandidate.create({
    data: {
      firstName,
      lastName: lastName || '',
      email,
      phone,
      city: normalizedCity,
      streetAddress,
      province,
      postalCode,
      country,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      geocodedAt: geo ? new Date() : null,
      geocodeSource: geo?.source ?? null,
      fullAddress: streetAddress ? `${streetAddress}, ${normalizedCity || city || ''}, ${province}, ${country}` : null,
      cvUrl,
      videoUrl: videoUrl || null,
      source: 'form-cv',
      submissionDate: new Date(),
      isContacted: false,
      isConverted: false,
      ...(disponibilites ?? {}),
      notes: cvUrl
        ? 'Ajouté automatiquement via GoHighLevel avec CV'
        : 'Ajouté automatiquement via GoHighLevel',
    },
  });

  // Le candidat a pu terminer son téléversement sur /ma-video AVANT que ce
  // webhook n'arrive : on réclame l'upload garé en attente. Best-effort — un
  // échec ici ne doit jamais faire échouer la création du prospect.
  let claimedPublicVideo = false;
  try {
    claimedPublicVideo = Boolean(
      await claimForProspect({ id: prospect.id, email, phone, videoStoragePath: null })
    );
  } catch (e: any) {
    console.error('⚠️ Réclamation vidéo publique échouée (prospect créé quand même):', e.message);
  }

  // Ancien champ vidéo du formulaire GHL (plafonné à 50 Mo). Ne s'exécute que
  // si le candidat n'a pas déjà envoyé sa vidéo par /ma-video : le
  // téléversement direct l'emporte toujours sur le fichier passé par GHL.
  // Best-effort : un échec vidéo ne doit pas faire échouer la création.
  if (videoUrl && !claimedPublicVideo) {
    try {
      const { downloadGhlFile, detectExtension, isLikelyVideo } = require('../utils/ghlFetch');
      const { uploadBufferToR2 } = require('./r2.service');
      const file = await downloadGhlFile(videoUrl);
      if (file.buffer.length > 100 && isLikelyVideo(file.buffer)) {
        const ext = detectExtension(file, '');
        const safe = `${firstName}_${lastName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'video';
        const key = `videos/prospects/${prospect.id}_${safe}${ext}`;
        await uploadBufferToR2(file.buffer, key, file.contentType);
        await prisma.prospectCandidate.update({
          where: { id: prospect.id },
          data: { videoStoragePath: key, videoUploadedAt: new Date() },
        });
        console.log('🎥 Vidéo de présentation stockée dans R2:', key);
      } else {
        console.warn('⚠️ Fichier vidéo invalide (ignoré) pour', `${firstName} ${lastName}`);
      }
    } catch (e: any) {
      console.error('⚠️ Échec téléchargement vidéo (prospect créé quand même):', e.message);
    }
  }

  // S12 — pas de PII dans les logs : seulement l'id et la présence des fichiers.
  console.log('✅ Prospect créé avec succès:', {
    id: prospect.id,
    hasCv: !!cvUrl,
    hasVideo: !!videoUrl || claimedPublicVideo,
    videoSource: claimedPublicVideo ? 'upload-public' : videoUrl ? 'champ-ghl' : null,
  });

  return {
    status: 201,
    body: {
      success: true,
      message: 'Prospect créé avec succès',
      prospectId: prospect.id,
      normalizedCity,
      cvUrl: cvUrl || null,
    },
  };
}
