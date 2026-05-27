/**
 * Envoie un exemple rendu de chacun des 6 templates email à une adresse de test.
 * Usage :
 *   npx ts-node src/scripts/send-email-samples.ts [destinataire] [provider]
 *   provider = 'ghl' (défaut) ou 'smtp'.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Si on utilise SMTP, on force les credentials Gmail (les .env ne sont pas valides)
if (process.argv[3] === 'smtp') {
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'true';
  process.env.SMTP_USER = 'nick@darkhorseads.com';
  process.env.SMTP_PASSWORD = 'kjaqmxuewwzkxcif';
  process.env.EMAIL_FROM = 'nick@darkhorseads.com';
}

import { sendEmail, renderTemplate } from '../services/email.service';
import { sendEmailViaGhl } from '../services/ghl-email.service';

const APP_URL = process.env.FRONTEND_URL || 'https://talentsecure.xguard.ca';

interface Sample {
  template: string;
  subject: string;
  vars: Record<string, unknown>;
}

const SAMPLES: Sample[] = [
  {
    template: 'uniform-return-due-soon',
    subject: '[Exemple] ⏰ Rappel — Retour d\'uniforme dans 24h ouvrables — Jean Tremblay',
    vars: {
      employeeName: 'Jean Tremblay',
      employeeId: 'demo-emp-001',
      issuedAt: '2026-05-01',
      dueReturnAt: '2026-06-01',
      totalLoanCost: '235.00',
      appUrl: APP_URL,
      lines: [
        { itemName: 'Chemise grise (ML)', size: 'L', quantity: 2, unitCost: '40.00' },
        { itemName: 'Pantalon noir (militaire)', size: '34', quantity: 2, unitCost: '65.00' },
        { itemName: 'Ceinture', size: 'M', quantity: 1, unitCost: '25.00' },
      ],
    },
  },
  {
    template: 'uniform-return-overdue',
    subject: '[Exemple] ⚠️ Uniforme NON retourné — Prélèvement requis — Marie Côté',
    vars: {
      employeeName: 'Marie Côté',
      employeeId: 'demo-emp-002',
      dueReturnAt: '2026-05-20',
      daysOverdue: '3',
      totalLoanCost: '275.00',
      appUrl: APP_URL,
      lines: [
        { itemName: 'Chemise blanche (ML)', size: 'M', quantity: 3, lineTotal: '120.00' },
        { itemName: 'Pantalon noir (militaire)', size: '32', quantity: 2, lineTotal: '130.00' },
        { itemName: 'Ceinture', size: 'S', quantity: 1, lineTotal: '25.00' },
      ],
    },
  },
  {
    template: 'uniform-termination-closed',
    subject: '[Exemple] Fin d\'emploi clôturée — Dette uniforme — Karim Diallo',
    vars: {
      employeeName: 'Karim Diallo',
      employeeId: 'demo-emp-003',
      closedAt: '2026-05-27',
      amountOwed: '170.00',
      appUrl: APP_URL,
      lines: [
        { itemName: 'Chemise grise (MC)', size: 'L', quantity: 1, lineTotal: '40.00' },
        { itemName: 'Chemise grise (ML)', size: 'L', quantity: 1, lineTotal: '40.00' },
        { itemName: 'Pantalon noir (militaire)', size: '36', quantity: 1, lineTotal: '65.00' },
        { itemName: 'Ceinture', size: 'L', quantity: 1, lineTotal: '25.00' },
      ],
    },
  },
  {
    template: 'uniform-wash-batch-stagnant',
    subject: '[Exemple] 🧺 Lot de lavage bloqué chez "Buanderie ABC"',
    vars: {
      batchId: 'a1b2c3d4-1234-5678-9abc-def012345678',
      batchShortId: 'a1b2c3d4',
      status: 'SENT_TO_LAUNDRY',
      statusLabel: 'Envoyé au lavage',
      vendor: 'Buanderie ABC',
      sentAt: '2026-05-18',
      returnedAt: '—',
      itemCount: 12,
      daysSince: 9,
      isSent: true,
      isReturned: false,
      appUrl: APP_URL,
    },
  },
  {
    template: 'uniform-low-stock',
    subject: '[Exemple] 📦 Stock bas — Chemise grise (ML) taille L',
    vars: {
      itemName: 'Chemise grise (ML)',
      size: 'L',
      emplacement: 'B4 — Étagère 2',
      quantityOnHand: 3,
      reorderThreshold: 10,
      appUrl: APP_URL,
    },
  },
  {
    template: 'uniform-debt-aging',
    subject: '[Exemple] 💰 Dette uniforme > 30 jours — Sophie Lavoie',
    vars: {
      employeeName: 'Sophie Lavoie',
      employeeId: 'demo-emp-004',
      debtDate: '2026-04-20',
      owed: '170.00',
      settled: '0.00',
      appUrl: APP_URL,
    },
  },
];

async function main() {
  const to = process.argv[2] || 'nicolas@xguard.ca';
  const provider = (process.argv[3] || 'ghl').toLowerCase();
  console.log(`Envoi de ${SAMPLES.length} exemples vers ${to} via ${provider.toUpperCase()}…\n`);

  let ok = 0;
  let fail = 0;

  for (const sample of SAMPLES) {
    try {
      const { html, text } = renderTemplate(sample.template, sample.vars);
      let messageId: string | undefined;
      if (provider === 'ghl') {
        const r = await sendEmailViaGhl({ to, subject: sample.subject, html });
        messageId = r.messageId;
      } else {
        const r = await sendEmail({ to, subject: sample.subject, html, text });
        messageId = r.messageId;
      }
      console.log(`✓ ${sample.template.padEnd(35)} → ${messageId}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${sample.template.padEnd(35)} : ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\nTerminé : ${ok}/${SAMPLES.length} envoyés${fail > 0 ? ` · ${fail} échec(s)` : ''}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
