import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { hashPassword } from '../utils/password';
import { generateAccessToken } from '../utils/jwt';

/**
 * Exports compétences — /api/exports (export.controller).
 *
 * Routes (export.routes.ts), toutes gardées par `authenticateStaff` (aucun
 * `authorizeRoles`, aucune validation de query, aucun service externe — la
 * génération CSV/XLSX/PDF est purement en mémoire via json2csv/exceljs/pdfkit) :
 *   - GET /api/exports/skills/csv
 *   - GET /api/exports/skills/excel
 *   - GET /api/exports/skills/pdf
 *
 * Couvre :
 *  - la garde d'auth (`authenticateStaff`) : 401 sans token, 403 pour un token
 *    CLIENT (signé sur un vrai prisma.client.create, sinon passport renvoie 401
 *    « client introuvable » et on ne testerait pas le 403 du garde) ;
 *  - les 3 chemins heureux (csv/excel/pdf) avec assertions réelles sur le
 *    Content-Type, le Content-Disposition (attachment + nom de fichier daté) et
 *    le contenu (en-têtes CSV, BOM UTF-8, signatures binaires XLSX/PDF) ;
 *  - le filtre `q` qui restreint les compétences retournées dans le CSV ;
 *  - le comportement « aucune donnée » (CSV en-têtes seuls, XLSX vide valide).
 *
 * Aucun mock : le controller n'appelle que Prisma (vraie base de test dédiée) et
 * des libs de génération de fichiers locales. Zéro réseau.
 */
describe('Exports compétences — /api/exports', () => {
  let app: Express;

  let staffToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();
    const pw = await hashPassword('Test1234');

    const staff = await prisma.user.create({
      data: {
        email: 'staff.export@test.com',
        password: pw,
        firstName: 'Staff',
        lastName: 'Export',
        role: 'ADMIN',
        isActive: true,
      },
    });
    staffToken = generateAccessToken({ userId: staff.id, email: staff.email!, role: staff.role });

    // PIÈGE connu : un token role:'CLIENT' est résolu par passport via la table
    // `clients`. Il faut donc un vrai client en base, sinon passport renvoie 401
    // (client introuvable) et on ne testerait pas le 403 du garde authenticateStaff.
    const clientAccount = await prisma.client.create({
      data: { name: 'Portail Export', email: 'portail.export@client.com', password: pw, isActive: true },
    });
    clientToken = generateAccessToken({ userId: clientAccount.id, email: clientAccount.email, role: 'CLIENT' });

    // Jeu de données : 2 compétences actives, l'une avec un candidat lié.
    const candidate = await prisma.candidate.create({
      data: {
        firstName: 'Jean',
        lastName: 'Tremblay',
        email: 'jean.tremblay@test.com',
        phone: '5145550001',
        city: 'Montréal',
        province: 'QC',
        status: 'BON',
        createdById: staff.id,
      },
    });

    const gardiennage = await prisma.skill.create({
      data: {
        name: 'Gardiennage',
        category: 'INDUSTRY',
        keywords: ['gardiennage', 'surveillance'],
        isActive: true,
      },
    });
    await prisma.skill.create({
      data: {
        name: 'Soudure',
        category: 'TECHNICAL',
        keywords: ['soudure', 'welding'],
        isActive: true,
      },
    });
    // Compétence inactive : ne doit jamais apparaître dans les exports
    // (le service filtre isActive: true).
    await prisma.skill.create({
      data: {
        name: 'Obsolete Skill',
        category: 'OTHER',
        keywords: ['obsolete'],
        isActive: false,
      },
    });

    await prisma.candidateSkill.create({
      data: {
        candidateId: candidate.id,
        skillId: gardiennage.id,
        level: 'ADVANCED',
        source: 'MANUAL_ENTRY',
        confidence: 0.92,
        yearsExperience: 4,
        isVerified: true,
      },
    });
  });

  describe("garde d'authentification (authenticateStaff)", () => {
    it('CSV sans token → 401', async () => {
      const res = await request(app).get('/api/exports/skills/csv');
      expect(res.status).toBe(401);
    });

    it('Excel sans token → 401', async () => {
      const res = await request(app).get('/api/exports/skills/excel');
      expect(res.status).toBe(401);
    });

    it('PDF sans token → 401', async () => {
      const res = await request(app).get('/api/exports/skills/pdf');
      expect(res.status).toBe(401);
    });

    it('token CLIENT → 403 (export back-office interdit aux comptes portail)', async () => {
      const res = await request(app)
        .get('/api/exports/skills/csv')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /skills/csv (exportSkillsCsv)', () => {
    it('staff → 200 CSV avec en-têtes, BOM UTF-8 et ligne candidat', async () => {
      const res = await request(app)
        .get('/api/exports/skills/csv')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      // attachment + nom de fichier daté (skills-export-YYYY-MM-DD.csv)
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="skills-export-\d{4}-\d{2}-\d{2}\.csv"/);

      const body = res.text;
      // BOM UTF-8 en tête (withBOM: true)
      expect(body.charCodeAt(0)).toBe(0xfeff);
      // En-têtes de colonnes (labels json2csv)
      expect(body).toContain('Skill Name');
      expect(body).toContain('Candidate Name');
      expect(body).toContain('Confidence');
      // Données réelles : compétences actives + le candidat lié
      expect(body).toContain('Gardiennage');
      expect(body).toContain('Soudure');
      expect(body).toContain('Jean Tremblay');
      // La compétence inactive ne doit pas apparaître (filtre isActive)
      expect(body).not.toContain('Obsolete Skill');
    });

    it('filtre q=soudure → ne renvoie que la compétence correspondante', async () => {
      const res = await request(app)
        .get('/api/exports/skills/csv')
        .query({ q: 'soudure' })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      const body = res.text;
      expect(body).toContain('Soudure');
      expect(body).not.toContain('Gardiennage');
    });
  });

  describe('GET /skills/excel (exportSkillsExcel)', () => {
    it('staff → 200 XLSX (signature ZIP) avec bon Content-Type et nom de fichier', async () => {
      const res = await request(app)
        .get('/api/exports/skills/excel')
        .set('Authorization', `Bearer ${staffToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
      );
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="skills-export-\d{4}-\d{2}-\d{2}\.xlsx"/
      );

      const buf = res.body as Buffer;
      expect(buf.length).toBeGreaterThan(0);
      // Un XLSX est un conteneur ZIP : signature « PK\x03\x04 ».
      expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
      expect(buf[2]).toBe(0x03);
      expect(buf[3]).toBe(0x04);
    });
  });

  describe('GET /skills/pdf (exportSkillsPdf)', () => {
    it('staff → 200 PDF (signature %PDF) avec bon Content-Type et nom de fichier', async () => {
      const res = await request(app)
        .get('/api/exports/skills/pdf')
        .set('Authorization', `Bearer ${staffToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="skills-export-\d{4}-\d{2}-\d{2}\.pdf"/
      );

      const buf = res.body as Buffer;
      expect(buf.length).toBeGreaterThan(0);
      // Tout fichier PDF commence par la signature « %PDF ».
      expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    });
  });

  describe('cas « aucune donnée » (export sans aucune compétence)', () => {
    // On supprime uniquement les compétences/candidats (PAS les users : sinon le
    // staff token pointerait vers un user inexistant → passport renvoie 401).
    // Ordre FK : candidate_skills → skills + candidates.
    beforeAll(async () => {
      await prisma.candidateSkill.deleteMany();
      await prisma.skill.deleteMany();
      await prisma.candidate.deleteMany();
    });

    it('CSV sans aucune compétence → 200 avec en-têtes seuls (aucune ligne de données)', async () => {
      const res = await request(app)
        .get('/api/exports/skills/csv')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      const body = res.text;
      expect(body).toContain('Skill Name');
      // Plus aucune donnée semée
      expect(body).not.toContain('Gardiennage');
      expect(body).not.toContain('Jean Tremblay');
    });

    it('Excel sans aucune compétence → 200 XLSX valide (feuille vide)', async () => {
      const res = await request(app)
        .get('/api/exports/skills/excel')
        .set('Authorization', `Bearer ${staffToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      const buf = res.body as Buffer;
      expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    });
  });
});
