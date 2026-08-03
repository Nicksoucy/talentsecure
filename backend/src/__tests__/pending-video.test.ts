import { prisma, cleanDatabase } from './setup';
import {
  claimForProspect,
  listOrphanUploads,
  recordUpload,
  sweepUnclaimed,
} from '../services/pending-video.service';

/**
 * Rattachement des vidéos téléversées sur /ma-video —
 * src/services/pending-video.service.ts
 *
 * Ce service existe à cause d'une course : la redirection du formulaire GHL est
 * instantanée, alors que le webhook qui crée le ProspectCandidate arrive après.
 * Le candidat peut donc terminer sa vidéo AVANT que sa fiche existe.
 *
 * Couvre :
 *  - rattachement par courriel et par téléphone (formats E.164 vs local) ;
 *  - aucun rattachement quand rien ne correspond (l'upload reste orphelin) ;
 *  - une vidéo déjà présente sur le prospect n'est JAMAIS écrasée ;
 *  - upsert par contact GHL : un renvoi remplace, il n'empile pas ;
 *  - balayage de rattrapage et liste des orphelins (filtre d'ancienneté).
 */

const CONTACT = 'ghlContactPending1';

const upload = (over: Record<string, any> = {}) => ({
  ghlContactId: CONTACT,
  email: 'candidat@example.com',
  phone: '+15145559876',
  storagePath: `videos/inbox/${CONTACT}/video.mp4`,
  originalName: 'presentation.mp4',
  contentType: 'video/mp4',
  sizeBytes: 12_345_678,
  ...over,
});

describe('Vidéos publiques en attente — pending-video.service', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('recordUpload — rattachement immédiat', () => {
    it('le prospect existe déjà → la vidéo lui est posée tout de suite', async () => {
      const prospect = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'Tremblay', email: 'candidat@example.com', phone: '5145559876' },
      });

      const result = await recordUpload(upload());

      expect(result.claimed).toBe(true);
      expect(result.prospectId).toBe(prospect.id);
      const updated = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updated?.videoStoragePath).toBe(`videos/inbox/${CONTACT}/video.mp4`);
    });

    it("aucun prospect correspondant → l'upload reste en attente", async () => {
      const result = await recordUpload(upload());

      expect(result.claimed).toBe(false);
      const pending = await prisma.pendingVideoUpload.findUnique({ where: { ghlContactId: CONTACT } });
      expect(pending?.claimedAt).toBeNull();
    });

    it('un renvoi remplace la ligne du même contact (pas de doublon orphelin)', async () => {
      await recordUpload(upload());
      await recordUpload(upload({ storagePath: `videos/inbox/${CONTACT}/reprise.mp4` }));

      const rows = await prisma.pendingVideoUpload.findMany({ where: { ghlContactId: CONTACT } });
      expect(rows).toHaveLength(1);
      expect(rows[0].storagePath).toBe(`videos/inbox/${CONTACT}/reprise.mp4`);
    });
  });

  describe('claimForProspect — à la création du prospect', () => {
    it('rattache par courriel (insensible à la casse)', async () => {
      await recordUpload(upload({ phone: null }));
      const prospect = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'T', email: 'CANDIDAT@example.com', phone: '' },
      });

      const claimedId = await claimForProspect({ ...prospect });

      expect(claimedId).toBeTruthy();
      const updated = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updated?.videoStoragePath).toBe(`videos/inbox/${CONTACT}/video.mp4`);
    });

    it('rattache par téléphone malgré des formats différents (E.164 côté GHL)', async () => {
      // GHL stocke +15145559876, le webhook du formulaire livre « 514-555-9876 ».
      await recordUpload(upload({ email: null }));
      const prospect = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'T', email: null, phone: '514-555-9876' },
      });

      const claimedId = await claimForProspect({ ...prospect });

      expect(claimedId).toBeTruthy();
      const updated = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updated?.videoStoragePath).toBeTruthy();
    });

    it('aucune correspondance → null, et l’upload reste disponible pour plus tard', async () => {
      await recordUpload(upload());
      const other = await prisma.prospectCandidate.create({
        data: { firstName: 'Autre', lastName: 'Personne', email: 'rien@example.com', phone: '4185551111' },
      });

      expect(await claimForProspect({ ...other })).toBeNull();
      const pending = await prisma.pendingVideoUpload.findUnique({ where: { ghlContactId: CONTACT } });
      expect(pending?.claimedAt).toBeNull();
    });

    it("n'écrase JAMAIS une vidéo déjà présente sur le prospect", async () => {
      await recordUpload(upload());
      const prospect = await prisma.prospectCandidate.create({
        data: {
          firstName: 'Léa',
          lastName: 'T',
          email: 'candidat@example.com',
          phone: '5145559876',
          videoStoragePath: 'videos/prospects/deja-la.mp4',
        },
      });

      await claimForProspect({ ...prospect });

      const updated = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updated?.videoStoragePath).toBe('videos/prospects/deja-la.mp4');

      // L'upload est quand même marqué réclamé : on sait à qui il appartient,
      // il n'a donc rien à faire dans la liste des orphelins.
      const pending = await prisma.pendingVideoUpload.findUnique({ where: { ghlContactId: CONTACT } });
      expect(pending?.claimedAt).toBeTruthy();
      expect(pending?.claimedByProspectId).toBe(prospect.id);
    });

    it('un upload déjà réclamé n’est pas repris par un autre prospect', async () => {
      await recordUpload(upload());
      const first = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'T', email: 'candidat@example.com', phone: '5145559876' },
      });
      await claimForProspect({ ...first });

      const second = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'Bis', email: 'candidat@example.com', phone: '5145559876' },
      });
      expect(await claimForProspect({ ...second })).toBeNull();
    });
  });

  describe('sweepUnclaimed — filet de rattrapage', () => {
    it('rattache les uploads dont le prospect est apparu entre-temps', async () => {
      await recordUpload(upload());
      // Le prospect arrive APRÈS l'upload, sans passer par claimForProspect
      // (webhook perdu, import manuel…).
      const prospect = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'T', email: 'candidat@example.com', phone: '5145559876' },
      });

      const result = await sweepUnclaimed();

      expect(result).toEqual({ scanned: 1, claimed: 1 });
      const updated = await prisma.prospectCandidate.findUnique({ where: { id: prospect.id } });
      expect(updated?.videoStoragePath).toBeTruthy();
    });

    it('sans prospect correspondant, rien n’est réclamé (et rien ne casse)', async () => {
      await recordUpload(upload());
      expect(await sweepUnclaimed()).toEqual({ scanned: 1, claimed: 0 });
    });
  });

  describe('listOrphanUploads — écran staff', () => {
    it("n'inclut pas les uploads trop récents (le rattachement peut encore arriver)", async () => {
      await recordUpload(upload());
      expect(await listOrphanUploads(60)).toHaveLength(0);
    });

    it('inclut les uploads anciens et jamais réclamés', async () => {
      await recordUpload(upload());
      await prisma.pendingVideoUpload.update({
        where: { ghlContactId: CONTACT },
        data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      });

      const orphans = await listOrphanUploads(60);
      expect(orphans).toHaveLength(1);
      expect(orphans[0].ghlContactId).toBe(CONTACT);
    });

    it('exclut les uploads réclamés, même anciens', async () => {
      await recordUpload(upload());
      const prospect = await prisma.prospectCandidate.create({
        data: { firstName: 'Léa', lastName: 'T', email: 'candidat@example.com', phone: '5145559876' },
      });
      await claimForProspect({ ...prospect });
      await prisma.pendingVideoUpload.update({
        where: { ghlContactId: CONTACT },
        data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      });

      expect(await listOrphanUploads(60)).toHaveLength(0);
    });
  });
});
