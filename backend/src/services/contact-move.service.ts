import { prisma } from '../config/database';
import { ContactSection } from '../utils/candidateMatch';
import { canonicalCity } from '../utils/cityNormalize';
import { createCandidateVideoTx } from './candidate-video.service';

/**
 * Déplace un contact d'une section à une autre (les 6 sens).
 * Lit la source, crée la cible avec mapping des champs, soft-delete la source.
 * Réversible (soft-delete). Conserve email/nom/adresse/CV/vidéo quand présents.
 */

interface Normalized {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  address: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
  cvUrl: string | null;
  cvStoragePath: string | null;
  videoUrl: string | null;
  videoStoragePath: string | null;
  videoUploadedAt: Date | null;
  hasBSP: boolean;
  bspNumber: string | null;
  hasVehicle: boolean;
  notes: string | null;
  surveyAnswers: any;
}

function normalize(r: any): Normalized {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email ?? null,
    phone: r.phone || '',
    address: r.address ?? r.streetAddress ?? r.fullAddress ?? null,
    city: r.city ?? null,
    province: r.province ?? 'QC',
    postalCode: r.postalCode ?? null,
    cvUrl: r.cvUrl ?? null,
    cvStoragePath: r.cvStoragePath ?? null,
    videoUrl: r.videoUrl ?? null,
    videoStoragePath: r.videoStoragePath ?? null,
    videoUploadedAt: r.videoUploadedAt ?? null,
    hasBSP: r.hasBSP ?? false,
    bspNumber: r.bspNumber ?? null,
    hasVehicle: r.hasVehicle ?? false,
    notes: r.hrNotes ?? r.notes ?? null,
    surveyAnswers: r.surveyAnswers ?? null,
  };
}

async function loadSource(section: ContactSection, id: string): Promise<any | null> {
  if (section === 'candidate') return prisma.candidate.findUnique({ where: { id } });
  if (section === 'prospect') return prisma.prospectCandidate.findUnique({ where: { id } });
  return prisma.employee.findUnique({ where: { id } });
}

export interface MoveResult {
  section: ContactSection;
  id: string;
  firstName: string;
  lastName: string;
}

export async function moveContact(opts: {
  fromSection: ContactSection;
  fromId: string;
  toSection: ContactSection;
  createdById: string;
  fromCandidateId?: string; // pour le lien employé.convertedFromCandidateId
}): Promise<MoveResult> {
  const { fromSection, fromId, toSection, createdById } = opts;

  if (fromSection === toSection) {
    throw Object.assign(new Error('La source et la destination sont identiques.'), { status: 400 });
  }

  const source = await loadSource(fromSection, fromId);
  if (!source || source.isDeleted) {
    throw Object.assign(new Error('Contact source introuvable.'), { status: 404 });
  }

  const n = normalize(source);

  const result = await prisma.$transaction(async (tx) => {
    let created: { id: string; firstName: string; lastName: string };

    if (toSection === 'candidate') {
      created = await tx.candidate.create({
        data: {
          firstName: n.firstName,
          lastName: n.lastName,
          email: n.email,
          phone: n.phone || 'N/A',
          address: n.address,
          city: n.city ? canonicalCity(n.city) : 'Non spécifié',
          province: n.province,
          postalCode: n.postalCode,
          status: 'EN_ATTENTE',
          hasBSP: n.hasBSP,
          bspNumber: n.bspNumber,
          hasVehicle: n.hasVehicle,
          cvUrl: n.cvUrl,
          cvStoragePath: n.cvStoragePath,
          videoUrl: n.videoUrl,
          videoStoragePath: n.videoStoragePath,
          videoUploadedAt: n.videoUploadedAt,
          hrNotes: n.notes,
          createdById,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      // Vidéo de présentation reprise → enregistrée aussi comme vidéo typée
      // PRESENTATION (les colonnes video* du candidat = miroir, déjà posées).
      if (n.videoStoragePath || n.videoUrl) {
        await createCandidateVideoTx(tx, {
          candidateId: created.id,
          type: 'PRESENTATION',
          videoUrl: n.videoUrl,
          videoStoragePath: n.videoStoragePath,
          videoSourceUrl: n.videoUrl,
          videoUploadedAt: n.videoUploadedAt,
        });
      }
    } else if (toSection === 'prospect') {
      created = await tx.prospectCandidate.create({
        data: {
          firstName: n.firstName,
          lastName: n.lastName,
          email: n.email,
          phone: n.phone,
          streetAddress: n.address,
          fullAddress: n.address,
          city: n.city ? canonicalCity(n.city) : n.city,
          province: n.province,
          postalCode: n.postalCode,
          cvUrl: n.cvUrl,
          cvStoragePath: n.cvStoragePath,
          videoUrl: n.videoUrl,
          videoStoragePath: n.videoStoragePath,
          videoUploadedAt: n.videoUploadedAt,
          surveyAnswers: n.surveyAnswers ?? undefined,
          notes: n.notes,
          source: 'move',
          isContacted: false,
          isConverted: false,
        },
        select: { id: true, firstName: true, lastName: true },
      });
    } else {
      created = await tx.employee.create({
        data: {
          firstName: n.firstName,
          lastName: n.lastName,
          email: n.email,
          phone: n.phone,
          address: n.address,
          city: n.city ? canonicalCity(n.city) : n.city,
          province: n.province,
          postalCode: n.postalCode,
          status: 'ACTIF',
          hasBSP: n.hasBSP,
          bspNumber: n.bspNumber,
          hasVehicle: n.hasVehicle,
          cvUrl: n.cvUrl,
          cvStoragePath: n.cvStoragePath,
          videoUrl: n.videoUrl,
          videoStoragePath: n.videoStoragePath,
          notes: n.notes,
          convertedFromCandidateId: fromSection === 'candidate' ? fromId : null,
        },
        select: { id: true, firstName: true, lastName: true },
      });
    }

    // Soft-delete la source
    if (fromSection === 'candidate') {
      await tx.candidate.update({ where: { id: fromId }, data: { isDeleted: true, deletedAt: new Date() } });
    } else if (fromSection === 'prospect') {
      await tx.prospectCandidate.update({ where: { id: fromId }, data: { isDeleted: true, deletedAt: new Date() } });
    } else {
      await tx.employee.update({ where: { id: fromId }, data: { isDeleted: true, deletedAt: new Date() } });
    }

    return created;
  });

  return { section: toSection, id: result.id, firstName: result.firstName, lastName: result.lastName };
}
