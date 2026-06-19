import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { setCandidateVideo, removeCandidateVideo } from '../services/candidate-video.service';
import { moveContact } from '../services/contact-move.service';
import { cvExtractionService } from '../services/cv-extraction.service';

/**
 * Tests de CARACTÉRISATION de la feature « vidéos multiples typées par candidat »
 * (PR #6, commit 55ba4fc). Objectif : verrouiller le comportement ACTUEL —
 * notamment la logique miroir subtile et déjà critique en prod (backfill de 185
 * vidéos sur Neon) — pas le redéfinir. Si l'un de ces tests casse lors d'un
 * refactor, c'est un changement de comportement observable à valider sciemment.
 *
 * Invariants couverts :
 *  1. Les colonnes miroir candidates.video* reflètent la vidéo de PRESENTATION
 *     (et UNIQUEMENT elle — une vidéo INTERVIEW ne touche pas le miroir).
 *  2. Le miroir ne pointe JAMAIS vers un fichier supprimé : reconcileMirrorIfDangling
 *     resynchronise sur la présentation (ou null) dès qu'on touche une vidéo
 *     non-présentation.
 *  3. Une conversion prospect→candidat crée bien une vidéo typée PRESENTATION
 *     (les trois chemins : moveContact, endpoint HTTP /convert, cv-extraction).
 */

// Un compteur suffit à garantir des chemins de stockage distincts sans dépendre
// de Date.now()/random (les vidéos ne sont jamais réellement écrites/lues ici).
let seq = 0;
const nextPath = (label: string) => `videos/${label}-${++seq}.mp4`;

describe('Vidéos typées candidat — caractérisation', () => {
  let app: Express;
  let adminUser: { id: string; email: string; role: string };
  let adminToken: string;

  /** Crée un candidat minimal (sans vidéo) et renvoie sa ligne. */
  async function createCandidate(overrides: Record<string, any> = {}) {
    return prisma.candidate.create({
      data: {
        createdById: adminUser.id,
        firstName: 'Vid',
        lastName: `Cand${++seq}`,
        email: `vid.cand.${seq}@example.com`,
        phone: '514-000-0000',
        city: 'Montréal',
        status: 'EN_ATTENTE',
        ...overrides,
      },
    });
  }

  /** Relit les colonnes miroir video* d'un candidat. */
  async function mirrorOf(candidateId: string) {
    const c = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { videoUrl: true, videoStoragePath: true, videoUploadedAt: true },
    });
    return c!;
  }

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();

    adminUser = await prisma.user.create({
      data: {
        email: 'video.admin@test.com',
        password: await hashPassword('Test123456'),
        firstName: 'Video',
        lastName: 'Admin',
        role: 'ADMIN',
        isActive: true,
      },
    });

    adminToken = generateAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1) Le miroir candidates.video* reflète la vidéo de PRESENTATION
  // ---------------------------------------------------------------------------
  describe('miroir candidates.video* ↔ vidéo PRESENTATION', () => {
    it('PRESENTATION : pose le miroir sur le fichier de présentation', async () => {
      const cand = await createCandidate();
      const presPath = nextPath('presentation');

      await setCandidateVideo({
        candidateId: cand.id,
        type: 'PRESENTATION',
        videoStoragePath: presPath,
      });

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBe(presPath);
      // Sans R2/Drive en test, getVideoUrl renvoie le chemin tel quel.
      expect(mirror.videoUrl).toBe(presPath);
      expect(mirror.videoUploadedAt).toBeInstanceOf(Date);

      // La ligne typée existe bien.
      const rows = await prisma.candidateVideo.findMany({
        where: { candidateId: cand.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('PRESENTATION');
      expect(rows[0].videoStoragePath).toBe(presPath);
    });

    it('INTERVIEW seule : ne touche PAS le miroir (reste null)', async () => {
      const cand = await createCandidate();

      await setCandidateVideo({
        candidateId: cand.id,
        type: 'INTERVIEW',
        videoStoragePath: nextPath('interview'),
      });

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBeNull();
      expect(mirror.videoUrl).toBeNull();
      expect(mirror.videoUploadedAt).toBeNull();

      // La vidéo d'entrevue est bien enregistrée, juste hors miroir.
      const rows = await prisma.candidateVideo.findMany({
        where: { candidateId: cand.id, type: 'INTERVIEW' },
      });
      expect(rows).toHaveLength(1);
    });

    it('PRESENTATION + INTERVIEW : le miroir suit la présentation, pas l’entrevue', async () => {
      const cand = await createCandidate();
      const presPath = nextPath('presentation');
      const intwPath = nextPath('interview');

      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presPath });
      await setCandidateVideo({ candidateId: cand.id, type: 'INTERVIEW', videoStoragePath: intwPath });

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBe(presPath);
      expect(mirror.videoStoragePath).not.toBe(intwPath);
    });

    it('remplacement de la PRESENTATION : le miroir suit le nouveau fichier (et une seule ligne PRESENTATION subsiste)', async () => {
      const cand = await createCandidate();
      const presV1 = nextPath('presentation');
      const presV2 = nextPath('presentation');

      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presV1 });
      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presV2 });

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBe(presV2);

      const rows = await prisma.candidateVideo.findMany({
        where: { candidateId: cand.id, type: 'PRESENTATION' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].videoStoragePath).toBe(presV2);
    });

    it('suppression de la PRESENTATION : remet le miroir à null', async () => {
      const cand = await createCandidate();
      const presPath = nextPath('presentation');

      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presPath });
      const removed = await removeCandidateVideo(cand.id, 'PRESENTATION');

      expect(removed).toBe(true);
      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBeNull();
      expect(mirror.videoUrl).toBeNull();
      expect(mirror.videoUploadedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 2) Le miroir ne pointe jamais vers un fichier supprimé (reconcileMirrorIfDangling)
  // ---------------------------------------------------------------------------
  describe('reconcileMirrorIfDangling — le miroir ne pointe jamais vers un fichier disparu', () => {
    it('suppression d’une INTERVIEW : un miroir orphelin est resynchronisé sur la PRESENTATION', async () => {
      const cand = await createCandidate();
      const presPath = nextPath('presentation');
      const intwPath = nextPath('interview');

      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presPath });
      await setCandidateVideo({ candidateId: cand.id, type: 'INTERVIEW', videoStoragePath: intwPath });

      // Corruption volontaire : le miroir pointe vers un fichier qui n'est plus
      // référencé par aucune ligne candidate_videos (cas hérité du backfill où une
      // entrevue occupait historiquement le miroir).
      const ghost = nextPath('ghost');
      await prisma.candidate.update({
        where: { id: cand.id },
        data: { videoStoragePath: ghost, videoUrl: ghost },
      });

      // Toucher une vidéo non-présentation déclenche reconcileMirrorIfDangling.
      await removeCandidateVideo(cand.id, 'INTERVIEW');

      const mirror = await mirrorOf(cand.id);
      // Le miroir est revenu sur la présentation, JAMAIS sur le fichier fantôme.
      expect(mirror.videoStoragePath).toBe(presPath);
      expect(mirror.videoStoragePath).not.toBe(ghost);
    });

    it('sans PRESENTATION de repli : un miroir orphelin est remis à null (jamais laissé pendant)', async () => {
      const cand = await createCandidate();
      const intwPath = nextPath('interview');

      await setCandidateVideo({ candidateId: cand.id, type: 'INTERVIEW', videoStoragePath: intwPath });

      // Le miroir pointe vers un fichier disparu, et il n'existe aucune présentation.
      const ghost = nextPath('ghost');
      await prisma.candidate.update({
        where: { id: cand.id },
        data: { videoStoragePath: ghost, videoUrl: ghost },
      });

      await removeCandidateVideo(cand.id, 'INTERVIEW');

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBeNull();
      expect(mirror.videoUrl).toBeNull();
    });

    it('ajout d’une INTERVIEW : un miroir orphelin est aussi réconcilié (chemin setCandidateVideo)', async () => {
      const cand = await createCandidate();
      const presPath = nextPath('presentation');

      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presPath });

      const ghost = nextPath('ghost');
      await prisma.candidate.update({
        where: { id: cand.id },
        data: { videoStoragePath: ghost, videoUrl: ghost },
      });

      // L'ajout d'une vidéo non-présentation passe par la branche else → reconcile.
      await setCandidateVideo({ candidateId: cand.id, type: 'INTERVIEW', videoStoragePath: nextPath('interview') });

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBe(presPath);
      expect(mirror.videoStoragePath).not.toBe(ghost);
    });

    it('miroir valide : reconcile est un no-op (la présentation référencée n’est pas écrasée)', async () => {
      const cand = await createCandidate();
      const presPath = nextPath('presentation');

      await setCandidateVideo({ candidateId: cand.id, type: 'PRESENTATION', videoStoragePath: presPath });
      // Le miroir pointe sur presPath, toujours référencé → reconcile ne doit rien changer.
      await setCandidateVideo({ candidateId: cand.id, type: 'INTERVIEW', videoStoragePath: nextPath('interview') });
      await removeCandidateVideo(cand.id, 'INTERVIEW');

      const mirror = await mirrorOf(cand.id);
      expect(mirror.videoStoragePath).toBe(presPath);
    });
  });

  // ---------------------------------------------------------------------------
  // 3) Une conversion prospect→candidat crée une vidéo PRESENTATION
  // ---------------------------------------------------------------------------
  describe('conversion prospect→candidat → vidéo PRESENTATION', () => {
    /** Crée un prospect porteur d'une vidéo de présentation. */
    async function createProspectWithVideo() {
      const storagePath = nextPath('prospect-presentation');
      const sourceUrl = `https://ghl.example/recording/${seq}`;
      const uploadedAt = new Date('2026-01-15T12:00:00.000Z');
      const prospect = await prisma.prospectCandidate.create({
        data: {
          firstName: 'Pros',
          lastName: `Vidéo${seq}`,
          email: `pros.video.${seq}@example.com`,
          phone: '514-555-1212',
          city: 'Montréal',
          province: 'QC',
          // lat/lng posés → la conversion HTTP court-circuite le géocodage externe.
          lat: 45.5019,
          lng: -73.5674,
          geocodeSource: 'city',
          videoUrl: sourceUrl,
          videoStoragePath: storagePath,
          videoUploadedAt: uploadedAt,
        },
      });
      return { prospect, storagePath, sourceUrl, uploadedAt };
    }

    it('moveContact(prospect→candidate) crée une PRESENTATION et pose le miroir', async () => {
      const { prospect, storagePath, sourceUrl } = await createProspectWithVideo();

      const res = await moveContact({
        fromSection: 'prospect',
        fromId: prospect.id,
        toSection: 'candidate',
        createdById: adminUser.id,
      });

      const pres = await prisma.candidateVideo.findFirst({
        where: { candidateId: res.id, type: 'PRESENTATION' },
      });
      expect(pres).not.toBeNull();
      expect(pres!.videoStoragePath).toBe(storagePath);
      expect(pres!.videoSourceUrl).toBe(sourceUrl);

      const mirror = await mirrorOf(res.id);
      expect(mirror.videoStoragePath).toBe(storagePath);
    });

    it('POST /api/prospects/:id/convert crée une PRESENTATION et pose le miroir', async () => {
      const { prospect, storagePath, sourceUrl } = await createProspectWithVideo();

      const response = await request(app)
        .post(`/api/prospects/${prospect.id}/convert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(201);
      const candidateId = response.body.data.id as string;

      const pres = await prisma.candidateVideo.findFirst({
        where: { candidateId, type: 'PRESENTATION' },
      });
      expect(pres).not.toBeNull();
      expect(pres!.videoStoragePath).toBe(storagePath);
      expect(pres!.videoSourceUrl).toBe(sourceUrl);

      const mirror = await mirrorOf(candidateId);
      expect(mirror.videoStoragePath).toBe(storagePath);

      // Le prospect est marqué converti vers ce candidat.
      const updatedProspect = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updatedProspect!.isConverted).toBe(true);
      expect(updatedProspect!.convertedToId).toBe(candidateId);
    });

    it('cv-extraction.convertProspectToCandidate crée une PRESENTATION et pose le miroir', async () => {
      const { prospect, storagePath, sourceUrl } = await createProspectWithVideo();

      // Méthode privée du service (chemin d'auto-conversion) : on la caractérise
      // directement, c'est l'un des trois sites de conversion de la feature.
      await (cvExtractionService as any).convertProspectToCandidate(prospect.id, adminUser.id);

      // Ce chemin réutilise l'ID du prospect comme ID du candidat.
      const candidateId = prospect.id;

      const pres = await prisma.candidateVideo.findFirst({
        where: { candidateId, type: 'PRESENTATION' },
      });
      expect(pres).not.toBeNull();
      expect(pres!.videoStoragePath).toBe(storagePath);
      expect(pres!.videoSourceUrl).toBe(sourceUrl);

      const mirror = await mirrorOf(candidateId);
      expect(mirror.videoStoragePath).toBe(storagePath);
    });

    it('prospect SANS vidéo : la conversion ne crée aucune ligne candidate_videos', async () => {
      const prospect = await prisma.prospectCandidate.create({
        data: {
          firstName: 'Sans',
          lastName: `Vidéo${++seq}`,
          phone: '514-555-0000',
          city: 'Montréal',
          province: 'QC',
        },
      });

      const res = await moveContact({
        fromSection: 'prospect',
        fromId: prospect.id,
        toSection: 'candidate',
        createdById: adminUser.id,
      });

      const rows = await prisma.candidateVideo.findMany({ where: { candidateId: res.id } });
      expect(rows).toHaveLength(0);

      const mirror = await mirrorOf(res.id);
      expect(mirror.videoStoragePath).toBeNull();
    });
  });
});
