/**
 * Upload les PDFs originaux des remises historiques vers R2 via l'API de production.
 *
 * Astuce : on ne peut pas appeler R2 directement depuis le local (pas de creds),
 * mais le serveur Cloud Run a accès à R2. On génère donc un JWT admin localement
 * (en utilisant JWT_SECRET partagé) puis on POST /api/uniforms/issuances/:id/upload-pdf.
 */
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'https://talentsecure-572017163659.northamerica-northeast1.run.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@xguard.ca';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

interface PdfReport {
  file: string;
  match: boolean;
}

async function login(): Promise<string> {
  const res = await axios.post(`${API_URL}/api/auth/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { timeout: 30000 });
  // Token peut être renvoyé sous différents formats
  const token = res.data?.accessToken || res.data?.token || res.data?.data?.accessToken || res.data?.data?.token;
  if (!token) throw new Error(`Token introuvable dans la réponse: ${JSON.stringify(res.data).slice(0, 200)}`);
  return token;
}

async function main() {
  if (!ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD env requise');
  }
  const token = await login();
  console.log(`Login OK (${ADMIN_EMAIL})`);

  // 2) Charge les rapports parsed (pour ne traiter que les match)
  const jsonPath = path.join(__dirname, 'parsed-pdfs.json');
  if (!fs.existsSync(jsonPath)) throw new Error('parsed-pdfs.json absent. Lance parse-historical-pdfs.ts d\'abord.');
  const reports: PdfReport[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  // Upload TOUS les PDFs (même ceux où le parser n'a pas fully match — le PDF reste utile)
  const usable = reports;
  console.log(`${usable.length} PDFs à uploader.\n`);

  let ok = 0, fail = 0;
  for (const r of usable) {
    const file = r.file;
    const base = path.basename(file);
    const date = base.match(/^(\d{4})(\d{2})(\d{2})/);
    const name = base.replace(/^\d{8}[\s-]*/, '').replace(/\.pdf$/i, '');
    if (!date) { console.log(`✗ ${base}: date introuvable`); fail++; continue; }
    const dateStr = `${date[1]}-${date[2]}-${date[3]}`;

    // Trouve la remise correspondante (même méthode que apply-parsed-pdfs.ts)
    const tokens = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    const all = await prisma.employee.findMany({ where: { status: 'ACTIF' }, select: { id: true, firstName: true, lastName: true } });
    let emp: any = null;
    for (const e of all) {
      const full = `${e.firstName} ${e.lastName}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (tokens.every((t) => full.includes(t))) { emp = e; break; }
    }
    if (!emp) { console.log(`✗ ${base}: employé introuvable`); fail++; continue; }

    const issuance = await prisma.uniformIssuance.findFirst({
      where: {
        employeeId: emp.id,
        issuedAt: { gte: new Date(`${dateStr}T00:00:00`), lt: new Date(`${dateStr}T23:59:59`) },
      },
    });
    if (!issuance) { console.log(`✗ ${base}: remise introuvable`); fail++; continue; }

    // Upload via API prod
    try {
      const fd = new FormData();
      fd.append('pdf', fs.createReadStream(file), { filename: base, contentType: 'application/pdf' });
      const res = await axios.post(
        `${API_URL}/api/uniforms/issuances/${issuance.id}/upload-pdf`,
        fd,
        {
          headers: { ...fd.getHeaders(), Authorization: `Bearer ${token}` },
          maxBodyLength: 20 * 1024 * 1024,
          maxContentLength: 20 * 1024 * 1024,
          timeout: 60000,
        },
      );
      console.log(`✓ ${emp.firstName} ${emp.lastName} | ${base} → ${res.data?.data?.formPdfStoragePath || 'OK'}`);
      ok++;
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'erreur inconnue';
      console.log(`✗ ${base}: ${msg}`);
      fail++;
    }
  }

  console.log(`\n=== STATS ===`);
  console.log(`Upload OK : ${ok}`);
  console.log(`Échecs    : ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
