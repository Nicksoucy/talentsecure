/**
 * Rattrape les CV du formulaire GHL refusés faute de téléphone.
 *
 * Cas visé : GHL a la personne en double (une fiche au courriel, une autre au
 * téléphone). Le numéro écrit dans le formulaire reste sur l'autre fiche, le
 * workflow envoie un téléphone vide et le webhook refusait le CV (400).
 * Signature : la soumission a un téléphone, le contact GHL n'en a pas.
 *
 * Chaque CV retenu passe par ingestGhlProspect — exactement les règles du
 * webhook (employé / candidat / doublon / mise à jour du CV / géocodage).
 *
 * DRY-RUN PAR DÉFAUT — rien n'est écrit sans --apply (et la base n'est même
 * pas lue : le rapport ne dépend que de GHL).
 *
 *   npm run replay:ghl-cvs
 *   npm run replay:ghl-cvs -- --apply
 *   npm run replay:ghl-cvs -- --contacts <id>,<id> --apply
 *
 * Options :
 *   --since AAAA-MM-JJ  début de la fenêtre (défaut : il y a 30 jours)
 *   --form <id>         formulaire GHL (défaut : « Renseignements étudiants »)
 *   --contacts a,b      seulement ces contacts GHL, téléphone ou pas
 *   --apply             écrit réellement (sinon simple rapport)
 */
import 'dotenv/config';
import { prisma } from '../config/database';
import { ghlRequest, getGhlLocationId, getContactById } from '../services/ghl.client';
import { ingestGhlProspect, readGhlWebhookBody } from '../services/ghl-prospect-intake.service';
import { findCvFile } from '../services/survey-sync.service';
import { findGhlAvailabilityAnswer } from '../utils/availability';

const INTAKE_FORM_ID = 'xKO9CwgDoDC8l876Giwr'; // « Renseignements étudiants »

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { timeZone: 'America/Toronto' });

async function fetchSubmissions(formId: string, since: string): Promise<any[]> {
  const endAt = ymd(new Date(Date.now() + 24 * 3600 * 1000));
  const all: any[] = [];
  for (let page = 1; ; page++) {
    const data = await ghlRequest<{ submissions?: any[] }>('/forms/submissions', {
      query: { locationId: getGhlLocationId(), formId, startAt: since, endAt, limit: 100, page },
    });
    const subs = data?.submissions || [];
    all.push(...subs);
    if (subs.length < 100) return all;
  }
}

/** Même charge utile que celle du workflow « Nouveau Prospect - TalentSecure ». */
function toWebhookBody(sub: any) {
  const o = sub.others || {};
  return {
    first_name: o.first_name,
    last_name: o.last_name,
    email: o.email || sub.email,
    phone: o.phone,
    city: o.city,
    street_address: o.address,
    state: o.state,
    postal_code: o.postal_code,
    country: o.country,
    cv_url: findCvFile(o)?.url,
    disponibilites: findGhlAvailabilityAnswer(o),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const formId = arg('form') || INTAKE_FORM_ID;
  const since = arg('since') || ymd(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const onlyContacts = arg('contacts')?.split(',').map((s) => s.trim()).filter(Boolean);

  const subs = await fetchSubmissions(formId, since);
  // Dernière soumission par contact : c'est celle que le webhook a reçue en dernier.
  const latest = new Map<string, any>();
  for (const s of [...subs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
    if (s.contactId && !latest.has(s.contactId)) latest.set(s.contactId, s);
  }
  console.log(`Formulaire ${formId} depuis le ${since} : ${subs.length} soumission(s), ${latest.size} personne(s).`);

  const toReplay: any[] = [];
  for (const [contactId, sub] of latest) {
    if (onlyContacts) {
      if (onlyContacts.includes(contactId)) toReplay.push(sub);
      continue;
    }
    if (!String(sub.others?.phone || '').trim()) continue;
    const contact = await getContactById(contactId);
    if (contact && !String(contact.phone || '').trim()) toReplay.push(sub);
  }

  if (toReplay.length === 0) {
    console.log('\nAucun CV à rattraper.');
    return;
  }

  console.log(`\n${toReplay.length} CV refusé(s) faute de téléphone sur le contact GHL :`);
  for (const sub of toReplay) {
    const input = readGhlWebhookBody(toWebhookBody(sub));
    console.log(
      `  ${when(sub.createdAt)} | ${input.firstName} ${input.lastName.slice(0, 1)}. | contact ${sub.contactId}` +
        ` | CV : ${input.cvUrl ? 'oui' : 'NON'} | téléphone dans la soumission : ${input.phone ? 'oui' : 'NON'}`
    );
  }

  if (!apply) {
    console.log('\nDRY-RUN — rien n’a été écrit. Relancer avec --apply pour les faire entrer dans TalentSecure.');
    return;
  }

  console.log('\nRattrapage :');
  for (const sub of toReplay) {
    const input = readGhlWebhookBody(toWebhookBody(sub));
    const { status, body } = await ingestGhlProspect(input);
    console.log(`  ${input.firstName} ${input.lastName.slice(0, 1)}. → ${status} ${body.message || body.error}`);
  }
}

main()
  .catch((e) => {
    console.error('ERREUR :', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
