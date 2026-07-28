import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';
import { carryOverTags, tagPerson, untagPerson } from '../services/contractLeads.service';

/**
 * Leads de contrat — /api/contracts/:code/map-points (couche colorée des cartes).
 *
 * L'endpoint agrège les TROIS sections (prospect/candidat/employé) : un lead de
 * contrat peut vivre à n'importe quelle étape du cycle de vie. Il renvoie des
 * NOMS DE PERSONNES → la garde d'auth staff est testée explicitement.
 */
describe('Contrats — /api/contracts', () => {
  let app: Express;
  let salesToken: string;
  let clientToken: string;
  let prospectId: string;
  let candidateId: string;
  let employeeId: string;
  let deletedProspectId: string;
  let convertedProspectId: string;
  let unplacedId: string;
  let untaggedId: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const sales = await prisma.user.create({
      data: { email: 'sales.contract@test.com', password: pw, firstName: 'S', lastName: 'C', role: 'SALES', isActive: true },
    });
    const admin = await prisma.user.create({
      data: { email: 'admin.contract@test.com', password: pw, firstName: 'A', lastName: 'C', role: 'ADMIN', isActive: true },
    });
    const client = await prisma.client.create({
      data: { name: 'Client C', email: 'client.contract@test.com', password: pw },
    });
    salesToken = generateAccessToken({ userId: sales.id, email: sales.email!, role: sales.role });
    clientToken = generateAccessToken({ userId: client.id, email: client.email, role: 'CLIENT' });

    // Deux personnes de sections DIFFÉRENTES à la MÊME adresse → 1 point, count 2.
    const prospect = await prisma.prospectCandidate.create({
      data: { firstName: 'Marie', lastName: 'Tremblay', phone: '5145550001', lat: 45.5, lng: -73.6, geocodeSource: 'address', city: 'Montréal' },
    });
    const candidate = await prisma.candidate.create({
      data: { firstName: 'Jean', lastName: 'Côté', phone: '5145550002', city: 'Montréal', lat: 45.5, lng: -73.6, geocodeSource: 'address', createdById: admin.id },
    });
    // Un employé ailleurs, placé au secteur postal → doit être nommé quand même.
    const employee = await prisma.employee.create({
      data: { firstName: 'Ali', lastName: 'Benali', phone: '5145550003', lat: 45.6, lng: -73.7, geocodeSource: 'postal', postalCode: 'H2X 1Y4', city: 'Laval' },
    });
    // Tag périmé : la fiche est soft-supprimée → aucun pin fantôme.
    const deleted = await prisma.prospectCandidate.create({
      data: { firstName: 'Ghost', lastName: 'Deleted', phone: '5145550004', lat: 45.1, lng: -73.1, geocodeSource: 'address', isDeleted: true, deletedAt: new Date() },
    });
    // Prospect converti → exclu lui aussi (sa fiche candidat prend le relais).
    const converted = await prisma.prospectCandidate.create({
      data: { firstName: 'Ghost', lastName: 'Converted', phone: '5145550005', lat: 45.2, lng: -73.2, geocodeSource: 'address', isConverted: true, convertedAt: new Date() },
    });
    // Tagué mais sans coordonnées → compté dans unplaced.
    const unplaced = await prisma.prospectCandidate.create({
      data: { firstName: 'Sans', lastName: 'Adresse', phone: '5145550006' },
    });
    // Non tagué, aux mêmes coordonnées que Marie → ne doit PAS apparaître.
    const untagged = await prisma.prospectCandidate.create({
      data: { firstName: 'Hors', lastName: 'Contrat', phone: '5145550007', lat: 45.5, lng: -73.6, geocodeSource: 'address', city: 'Montréal' },
    });

    prospectId = prospect.id;
    candidateId = candidate.id;
    employeeId = employee.id;
    deletedProspectId = deleted.id;
    convertedProspectId = converted.id;
    unplacedId = unplaced.id;
    untaggedId = untagged.id;

    for (const [personType, personId] of [
      ['prospect', prospectId],
      ['candidate', candidateId],
      ['employee', employeeId],
      ['prospect', deletedProspectId],
      ['prospect', convertedProspectId],
      ['prospect', unplacedId],
    ] as const) {
      await tagPerson({ contractCode: 'PSB', personType, personId });
    }
  });

  it('sans token → 401', async () => {
    const res = await request(app).get('/api/contracts/PSB/map-points');
    expect(res.status).toBe(401);
  });

  it('token CLIENT → 403 (l\'endpoint renvoie des noms de personnes)', async () => {
    const res = await request(app)
      .get('/api/contracts/PSB/map-points')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('code de contrat invalide → 400', async () => {
    const res = await request(app)
      .get('/api/contracts/a/map-points')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(400);
  });

  it('SALES → 200 : les 3 sections dans une seule couche, regroupées, nommées', async () => {
    const res = await request(app)
      .get('/api/contracts/PSB/map-points')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const points = res.body.data.points as Array<{ lat: number; lng: number; count: number; source: string; label: string }>;

    // Prospect + candidat aux mêmes coordonnées → 1 point, count 2, les 2 noms.
    const shared = points.find((p) => p.lat === 45.5 && p.lng === -73.6)!;
    expect(shared).toBeDefined();
    expect(shared.count).toBe(2);
    expect(shared.label.split(', ').sort()).toEqual(['Jean Côté', 'Marie Tremblay']);

    // L'employé au secteur postal est nommé lui aussi (nameLabelSources = 3 sources).
    const emp = points.find((p) => p.lat === 45.6)!;
    expect(emp.label).toBe('Ali Benali');
    expect(emp.source).toBe('postal');

    // Tags périmés : fiche supprimée et prospect converti → aucun point.
    expect(points.some((p) => p.lat === 45.1)).toBe(false);
    expect(points.some((p) => p.lat === 45.2)).toBe(false);

    // Le tagué sans coordonnées est compté comme non placé.
    expect(res.body.data.unplaced).toBe(1);
  });

  it('une personne non taguée aux mêmes coordonnées reste hors de la couche', async () => {
    const res = await request(app)
      .get('/api/contracts/PSB/map-points')
      .set('Authorization', `Bearer ${salesToken}`);
    const shared = (res.body.data.points as any[]).find((p) => p.lat === 45.5)!;
    expect(shared.count).toBe(2); // et non 3
    expect(shared.label).not.toContain('Hors Contrat');
    expect(untaggedId).toBeTruthy();
  });

  it('un contrat inconnu renvoie une couche vide, pas une erreur', async () => {
    const res = await request(app)
      .get('/api/contracts/INEXISTANT/map-points')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.points).toEqual([]);
    expect(res.body.data.unplaced).toBe(0);
  });

  it('GET /api/contracts liste les contrats avec les décomptes par section', async () => {
    const res = await request(app).get('/api/contracts').set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    const psb = (res.body.data.contracts as any[]).find((c) => c.code === 'PSB')!;
    expect(psb.total).toBe(6);
    expect(psb.byType.candidate).toBe(1);
    expect(psb.byType.employee).toBe(1);
  });
});

/**
 * Cycle de vie du tag : idempotence, dé-tag réversible, report lors d'un
 * déplacement de section.
 */
describe('Leads de contrat — service', () => {
  let personId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const p = await prisma.prospectCandidate.create({
      data: { firstName: 'Idem', lastName: 'Potent', phone: '5145559999' },
    });
    personId = p.id;
  });

  it('taguer deux fois ne crée pas de doublon (import rejouable)', async () => {
    const first = await tagPerson({ contractCode: 'psb', personType: 'prospect', personId, email: 'A@B.CA' });
    const second = await tagPerson({ contractCode: 'PSB', personType: 'prospect', personId });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const rows = await prisma.contractLead.findMany({ where: { personId } });
    expect(rows).toHaveLength(1);
    // Le code est normalisé en majuscules, le courriel en minuscules.
    expect(rows[0].contractCode).toBe('PSB');
  });

  it('dé-taguer pose removedAt sans supprimer, et re-taguer réactive', async () => {
    await untagPerson('PSB', 'prospect', personId);
    let row = await prisma.contractLead.findFirst({ where: { personId } });
    expect(row!.removedAt).not.toBeNull();

    await tagPerson({ contractCode: 'PSB', personType: 'prospect', personId });
    row = await prisma.contractLead.findFirst({ where: { personId } });
    expect(row!.removedAt).toBeNull();
  });

  it('carryOverTags déplace le tag vers la nouvelle fiche et retire l\'ancien', async () => {
    const target = await prisma.candidate.create({
      data: {
        firstName: 'Idem', lastName: 'Potent', phone: '5145559999', city: 'Montréal',
        createdById: (await prisma.user.create({
          data: { email: 'u.carry@test.com', firstName: 'U', lastName: 'C', role: 'ADMIN', isActive: true },
        })).id,
      },
    });

    await carryOverTags({ section: 'prospect', id: personId }, { section: 'candidate', id: target.id });

    const oldTag = await prisma.contractLead.findFirst({ where: { personType: 'prospect', personId } });
    const newTag = await prisma.contractLead.findFirst({ where: { personType: 'candidate', personId: target.id } });
    expect(oldTag!.removedAt).not.toBeNull();
    expect(newTag).not.toBeNull();
    expect(newTag!.removedAt).toBeNull();
  });
});
