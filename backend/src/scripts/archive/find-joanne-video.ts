import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { getGhlLocationId, getGhlToken } from '../../services/ghl.client';

const prisma = new PrismaClient();
const GHL_BASE = 'https://services.leadconnectorhq.com';
const TOKEN = getGhlToken();
const LOC = getGhlLocationId();
const H = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28' };

(async () => {
  const joanne = await prisma.prospectCandidate.findFirst({
    where: { firstName: { contains: 'Joanne', mode: 'insensitive' }, lastName: { contains: 'Kinal', mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, videoUrl: true, videoStoragePath: true },
  });
  if (!joanne) { console.log('Joanne Kinal introuvable dans la DB.'); await prisma.$disconnect(); return; }
  console.log('Joanne en DB:', joanne);

  // Chercher le contact GHL par email
  const email = (joanne.email || '').trim();
  if (!email) { console.log('Pas d\'email pour rechercher dans GHL.'); await prisma.$disconnect(); return; }
  const search = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, {
    params: { locationId: LOC, email },
    headers: H,
  }).then(r => r.data).catch(e => ({ error: e.response?.status }));
  const contactId = search?.contact?.id;
  console.log('GHL contact id:', contactId || '(introuvable)');
  if (!contactId) { await prisma.$disconnect(); return; }

  const full = await axios.get(`${GHL_BASE}/contacts/${contactId}`, { headers: H }).then(r => r.data?.contact);
  console.log('\nCustom fields (chercher la vidéo) :');
  for (const f of (full?.customFields || [])) {
    // Le champ vidéo peut être un objet avec uuids -> { url, meta }
    let preview = typeof f.value === 'string' ? f.value : JSON.stringify(f.value).slice(0, 150);
    console.log('  field id:', f.id, '| value:', preview);
  }
  await prisma.$disconnect();
})();
