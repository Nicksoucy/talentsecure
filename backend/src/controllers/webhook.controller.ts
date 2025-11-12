import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

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
  if (!city) return null;

  const normalized = city
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return CITY_MAPPINGS[normalized] || city.trim();
}

/**
 * Webhook handler pour les soumissions GoHighLevel
 */
export const handleGoHighLevelWebhook = async (req: Request, res: Response) => {
  try {
    console.log('📥 Webhook GoHighLevel reçu:', JSON.stringify(req.body, null, 2));

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
    const province = bodyData.state || formData.state || contactData.state || 'QC';
    const postalCode = bodyData.postal_code || formData.postal_code || contactData.postal_code || null;
    const country = bodyData.country || formData.country || contactData.country || 'CA';
    const cvUrl = bodyData.cv_url || formData.cv_url || contactData.svp_joindre_votre_cv || null;

    // Valider les champs requis
    if (!firstName || !phone) {
      console.error('❌ Champs requis manquants:', { firstName, phone });
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
        submissionDate: new Date(),
        isContacted: false,
        isConverted: false,
        notes: cvUrl
          ? 'Ajouté automatiquement via GoHighLevel avec CV'
          : 'Ajouté automatiquement via GoHighLevel',
      },
    });

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
 * Test endpoint pour vérifier que le webhook fonctionne
 */
export const testWebhook = async (req: Request, res: Response) => {
  return res.status(200).json({
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString(),
  });
};
