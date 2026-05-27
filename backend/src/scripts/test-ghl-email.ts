/**
 * Test isolé : envoie 1 email via GHL pour valider que l'intégration fonctionne.
 * Si OK → on peut basculer notification.service vers GHL en prod.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { sendEmailViaGhl, findContactByEmail } from '../services/ghl-email.service';

async function main() {
  const to = process.argv[2] || 'nicolas@xguard.ca';

  console.log(`Test : envoi GHL email vers ${to}…\n`);

  // Vérifie si le contact existe déjà
  const existing = await findContactByEmail(to);
  console.log(`Contact existant : ${existing || '(aucun — sera créé)'}`);

  try {
    const res = await sendEmailViaGhl({
      to,
      subject: '[TalentSecure V2] Test — email via GoHighLevel',
      contactName: 'Nicolas',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Test d'intégration GHL Email ✅</h2>
          <p>Ceci est un test d'envoi d'email via le canal <strong>GoHighLevel</strong>
          au lieu de SMTP standard.</p>
          <p>Si tu reçois ce message :</p>
          <ul>
            <li>✅ Le PIT token GHL a le scope <code>conversations/messages</code> write</li>
            <li>✅ Le contact a été créé/trouvé automatiquement</li>
            <li>✅ On peut basculer toutes les notifs uniforme vers GHL</li>
          </ul>
          <p style="color: #6b7280; font-size: 13px;">
            Envoyé via <code>/conversations/messages</code> avec <code>type: "Email"</code>.
            Tu devrais aussi le voir apparaître dans l'Inbox GHL côté admin.
          </p>
        </div>
      `,
    });

    console.log(`\n✓ Envoyé !`);
    console.log(`  Contact ID : ${res.contactId}`);
    console.log(`  Message ID : ${res.messageId || '(non retourné)'}`);
  } catch (e: any) {
    console.error(`\n✗ Échec : ${e.message}`);
    if (e.response?.data) console.error('  Détails API :', e.response.data);
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
