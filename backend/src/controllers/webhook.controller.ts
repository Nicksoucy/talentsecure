import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { findMatchingCandidate, findMatchingEmployee } from '../utils/candidateMatch';
import { canonicalCity, resolveProvince } from '../utils/cityNormalize';

const prisma = new PrismaClient();

// Mapping des noms de villes pour normalisation
const CITY_MAPPINGS: Record<string, string> = {
  'montreal': 'Montréal',
  'montréal': 'Montréal',
  'mtl': 'Montréal',
  'quebec': 'Québec',
  'québec': 'Québec',
  'qc': 'Québec',
  'laval': 'Laval',
  'gatineau': 'Gatineau',
  'longueuil': 'Longueuil',
  'sherbrooke': 'Sherbrooke',
  'trois-rivieres': 'Trois-Rivières',
  'trois-rivières': 'Trois-Rivières',
  'saguenay': 'Saguenay',
  'levis': 'Lévis',
  'lévis': 'Lévis',
  'terrebonne': 'Terrebonne',
  'saint-jerome': 'Saint-Jérôme',
  'saint-jérôme': 'Saint-Jérôme',
  'st-jerome': 'Saint-Jérôme',
  'st-jérôme': 'Saint-Jérôme',
  'repentigny': 'Repentigny',
  'brossard': 'Brossard',
  'drummondville': 'Drummondville',
  'saint-jean-sur-richelieu': 'Saint-Jean-sur-Richelieu',
  'st-jean-sur-richelieu': 'Saint-Jean-sur-Richelieu',
  'granby': 'Granby',
  'blainville': 'Blainville',
  'shawinigan': 'Shawinigan',
  'dollard-des-ormeaux': 'Dollard-des-Ormeaux',
  'saint-hyacinthe': 'Saint-Hyacinthe',
  'st-hyacinthe': 'Saint-Hyacinthe',
};

/**
 * Normalise le nom d'une ville
 */
function normalizeCity(city: string | null | undefined): string | null {
  if (!city || !city.trim()) return null;
  return canonicalCity(city);
}

/**
 * Webhook handler pour les soumissions GoHighLevel
 */
export const handleGoHighLevelWebhook = async (req: Request, res: Response) => {
  try {
    // S7 — ne pas logger le body complet (contient nom/email/tél/adresse = PII).
    // On logge seulement la structure (clés présentes) pour le debug.
    console.log('📥 Webhook GoHighLevel reçu', { keys: Object.keys(req.body || {}) });

    // Vérifier la clé secrète (sécurité)
    const webhookSecret = req.headers['x-webhook-secret'];
    if (webhookSecret !== process.env.GOHIGHLEVEL_WEBHOOK_SECRET) {
      console.error('❌ Webhook secret invalide');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extraire les données du formulaire GoHighLevel
    const { contact, form_data } = req.body;

    // GoHighLevel envoie les données dans différents formats
    // On essaie de supporter les trois formats courants
    const formData = form_data || {};
    const contactData = contact || {};
    const bodyData = req.body || {};  // Ajout: données directes dans body

    // Extraire les champs (priorité: bodyData direct, puis form_data, puis contact)
    const firstName = bodyData.first_name || formData.first_name || contactData.first_name || '';
    const lastName = bodyData.last_name || formData.last_name || contactData.last_name || '';
    const email = bodyData.email || formData.email || contactData.email || null;
    const phone = bodyData.phone || formData.phone || contactData.phone || '';
    const city = bodyData.city || formData.city || contactData.city || null;
    const streetAddress = bodyData.street_address || bodyData.stret_addess || formData.street_address || contactData.address1 || null;
    const provinceRaw = bodyData.state || formData.state || contactData.state || null;
    const postalCode = bodyData.postal_code || formData.postal_code || contactData.postal_code || null;
    // Province d'après le code postal (le plus fiable), sinon la valeur fournie, sinon QC.
    const province = resolveProvince({ postalCode, province: provinceRaw });
    const country = bodyData.country || formData.country || contactData.country || 'CA';
    const cvUrl = bodyData.cv_url || formData.cv_url || contactData.svp_joindre_votre_cv || null;
    const videoUrl =
      bodyData.video_url || formData.video_url ||
      contactData.video_de_presentation || contactData.video_presentation || null;

    // Valider les champs requis
    if (!firstName || !phone) {
      // S7 — pas de PII : on logge la présence, pas les valeurs.
      console.error('❌ Champs requis manquants:', { hasFirstName: !!firstName, hasPhone: !!phone });
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['first_name', 'phone'],
        received: { firstName, phone }
      });
    }

    // Vérifier les doublons (par email OU téléphone)
    const existingProspect = await prisma.prospectCandidate.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          { phone }
        ],
        isDeleted: false,
      }
    });

    // L'EMPLOYÉ GAGNE SUR TOUT : déjà employé → non ajouté aux Candidats Potentiels.
    const matchingEmployee = await findMatchingEmployee(prisma, email, phone);
    if (matchingEmployee) {
      console.log('ℹ️ Déjà Employé — non ajouté aux Candidats Potentiels:', {
        employeeId: matchingEmployee.id, email, phone,
      });
      return res.status(200).json({
        message: 'Cette personne est déjà un Employé. Non ajoutée aux Candidats Potentiels.',
        employeeId: matchingEmployee.id,
      });
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
        email,
        phone,
      });
      return res.status(200).json({
        message: 'Cette personne est déjà un Candidat. Non ajoutée aux Candidats Potentiels.',
        candidateId: matchingCandidate.id,
      });
    }

    if (existingProspect) {
      console.log('⚠️ Prospect déjà existant:', {
        id: existingProspect.id,
        email: existingProspect.email,
        phone: existingProspect.phone
      });
      return res.status(409).json({
        error: 'Duplicate prospect',
        message: 'Un prospect avec cet email ou téléphone existe déjà',
        existingProspectId: existingProspect.id,
        matchedBy: existingProspect.email === email ? 'email' : 'phone'
      });
    }

    // Normaliser la ville
    const normalizedCity = normalizeCity(city);

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
        fullAddress: streetAddress ? `${streetAddress}, ${normalizedCity || city || ''}, ${province}, ${country}` : null,
        cvUrl,
        videoUrl: videoUrl || null,
        source: 'form-cv',
        submissionDate: new Date(),
        isContacted: false,
        isConverted: false,
        notes: cvUrl
          ? 'Ajouté automatiquement via GoHighLevel avec CV'
          : 'Ajouté automatiquement via GoHighLevel',
      },
    });

    // Si une vidéo de présentation est fournie, on la télécharge dans R2
    // (best-effort : un échec vidéo ne doit pas faire échouer la création).
    if (videoUrl) {
      try {
        const { downloadGhlFile, detectExtension, isLikelyVideo } = require('../utils/ghlFetch');
        const { uploadBufferToR2 } = require('../services/r2.service');
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

    console.log('✅ Prospect créé avec succès:', {
      id: prospect.id,
      name: `${firstName} ${lastName}`,
      email,
      phone,
      cvUrl: cvUrl || 'Non fourni',
    });

    return res.status(201).json({
      success: true,
      message: 'Prospect créé avec succès',
      prospectId: prospect.id,
      normalizedCity,
      cvUrl: cvUrl || null,
    });

  } catch (error) {
    console.error('❌ Erreur lors du traitement du webhook:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Webhook pour le survey vidéo GHL.
 * Le payload GHL ne contient pas les fichiers de façon fiable → on retrouve
 * la soumission via l'API GHL (par email/téléphone du contact) puis on la
 * synchronise (télécharge CV + vidéo dans R2, capte les réponses, upsert).
 */
export const handleSurveyWebhook = async (req: Request, res: Response) => {
  try {
    const webhookSecret = req.headers['x-webhook-secret'];
    if (webhookSecret !== process.env.GOHIGHLEVEL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};
    const contact = body.contact || {};
    const email = (body.email || body.form_data?.email || contact.email || '').trim() || null;
    const phone = (body.phone || body.form_data?.phone || contact.phone || '').trim() || null;

    if (!email && !phone) {
      return res.status(400).json({ error: 'email ou téléphone requis' });
    }

    const { findSubmissionByContact, syncOneSubmission } = require('../services/survey-sync.service');
    const submission = await findSubmissionByContact(email, phone);
    if (!submission) {
      // La soumission n'est peut-être pas encore disponible côté API.
      return res.status(202).json({
        message: 'Soumission introuvable pour le moment (sera rattrapée par la synchro planifiée).',
        email, phone,
      });
    }

    const result = await syncOneSubmission(submission);
    return res.status(200).json({ message: 'Survey synchronisé', result });
  } catch (error) {
    console.error('❌ Erreur webhook survey:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Test endpoint pour vérifier que le webhook fonctionne
 */
export const testWebhook = async (req: Request, res: Response) => {
  return res.status(200).json({
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString(),
  });
};
