/**
 * Envoie le document d'architecture V2 par email pour partage équipe.
 * Email = HTML avec sommaire + lien GitHub + résumé.
 * En attachement-pseudo : le markdown brut, copiable.
 */
process.env.SMTP_HOST = 'smtp.gmail.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_SECURE = 'true';
process.env.SMTP_USER = 'nick@darkhorseads.com';
process.env.SMTP_PASSWORD = 'kjaqmxuewwzkxcif';
process.env.EMAIL_FROM = 'nick@darkhorseads.com';

import fs from 'fs';
import path from 'path';
import { sendEmail } from '../services/email.service';

async function main() {
  const to = process.argv[2] || 'nicolas@xguard.ca';
  const docPath = path.join(__dirname, '..', '..', '..', 'docs', 'UNIFORMES_ARCHITECTURE.md');
  const md = fs.readFileSync(docPath, 'utf-8');
  const githubUrl = 'https://github.com/Nicksoucy/talentsecure/blob/main/docs/UNIFORMES_ARCHITECTURE.md';

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; color: #1a1a1a;">

<h1 style="color: #2563eb;">📋 Architecture Module Uniformes — V2</h1>

<p>Bonjour l'équipe XGuard,</p>

<p>Voici le document d'architecture complet du module de gestion des uniformes V2.
Il décrit <strong>chaque étape</strong> du cycle de vie d'une pièce, de la remise jusqu'au
retour, avec <strong>toutes les notifications</strong> (SMS + email + cloche in-app)
et les escalations automatiques.</p>

<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0;">
  <strong>👉 Action demandée :</strong> lire le document et donner du feedback sur les
  <strong>workflows</strong>, les <strong>délais d'escalation</strong>, et les
  <strong>destinataires des notifications</strong>. Les points à valider sont dans la
  <a href="${githubUrl}#12-points-de-feedback-à-valider-avec-léquipe">section 12</a>.
</div>

<h2 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">Sommaire</h2>
<ol>
  <li><a href="${githubUrl}#1-vision">Vision</a></li>
  <li><a href="${githubUrl}#2-acteurs--responsabilités">Acteurs & responsabilités</a></li>
  <li><a href="${githubUrl}#3-stack-technique">Stack technique</a></li>
  <li><a href="${githubUrl}#4-modèle-de-données-prisma">Modèle de données</a></li>
  <li><a href="${githubUrl}#5-états-possibles-dune-pièce">États possibles d'une pièce</a></li>
  <li><a href="${githubUrl}#6-workflow-complet--étape-par-étape">Workflow complet</a> (7 étapes)
    <ul>
      <li>Setup catalogue → Remise → Surveillance → Retour avec triage → Lavage → Date butoir → Fin d'emploi</li>
    </ul>
  </li>
  <li><a href="${githubUrl}#7-matrice-complète-des-notifications-22-événements">Matrice complète des 22 notifications</a></li>
  <li><a href="${githubUrl}#8-architecture-des-notifications-technique">Architecture des notifications (technique)</a></li>
  <li><a href="${githubUrl}#9-cas-concrets--exemples">Cas concrets (3 scénarios)</a></li>
  <li><a href="${githubUrl}#10-décisions-techniques-clés-avec-rationale">Décisions techniques clés</a></li>
  <li><a href="${githubUrl}#11-limites-v1--roadmap-v2">Limites V1 / Roadmap V2</a></li>
  <li><a href="${githubUrl}#12-points-de-feedback-à-valider-avec-léquipe"><strong>Points de feedback ⭐</strong></a></li>
</ol>

<h2 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">TL;DR — Le cycle</h2>

<pre style="background: #f3f4f6; padding: 14px; border-radius: 6px; font-size: 13px; line-height: 1.5; overflow-x: auto;">
AVAILABLE ──remise──► ISSUED ──retour triage──┐
   ▲                                           │
   │             ┌─────────────────────────────┼─────────────────────────┐
   │             ▼ Bon                         ▼ Endommagé               ▼ Perdu
   │       IN_WASHING (lot lavage)        DISCARDED (poubelle)     (dette seule)
   │             │                              │                          │
   │             ▼ inspection                   ▼                          ▼
   │       Bon: WASH_OUT_GOOD                Dette                      Dette
   │       Endo: WASH_OUT_DAMAGED             agent                      agent
   │             │
   └─────────────┘ (re-stock automatique)
</pre>

<h2 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">Notifications-clés (matrice rapide)</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 14px;">
  <thead><tr style="background: #eff6ff;">
    <th style="text-align: left; padding: 8px; border: 1px solid #dbeafe;">Quand</th>
    <th style="text-align: left; padding: 8px; border: 1px solid #dbeafe;">Qui reçoit</th>
    <th style="text-align: left; padding: 8px; border: 1px solid #dbeafe;">Canal</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding: 8px; border: 1px solid #dbeafe;">T-24h ouvrables avant date butoir</td><td style="padding: 8px; border: 1px solid #dbeafe;"><strong>RH</strong></td><td style="padding: 8px; border: 1px solid #dbeafe;">Email + cloche</td></tr>
    <tr style="background: #fef2f2;"><td style="padding: 8px; border: 1px solid #fecaca;">Date butoir dépassée (overdue)</td><td style="padding: 8px; border: 1px solid #fecaca;"><strong>RH + PAIE</strong></td><td style="padding: 8px; border: 1px solid #fecaca;">Email + cloche</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #dbeafe;">Retour avec items endommagés</td><td style="padding: 8px; border: 1px solid #dbeafe;">Admin + RH</td><td style="padding: 8px; border: 1px solid #dbeafe;">Email + cloche</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #dbeafe;">Lot lavage revenu (à inspecter)</td><td style="padding: 8px; border: 1px solid #dbeafe;">Admin</td><td style="padding: 8px; border: 1px solid #dbeafe;">Email + cloche</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #dbeafe;">Lot bloqué chez fournisseur >7j</td><td style="padding: 8px; border: 1px solid #dbeafe;">Admin</td><td style="padding: 8px; border: 1px solid #dbeafe;">Email + cloche</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #dbeafe;">Stock variant sous seuil</td><td style="padding: 8px; border: 1px solid #dbeafe;">Admin</td><td style="padding: 8px; border: 1px solid #dbeafe;">Cloche</td></tr>
    <tr style="background: #fef2f2;"><td style="padding: 8px; border: 1px solid #fecaca;">Fin d'emploi clôturée avec dette</td><td style="padding: 8px; border: 1px solid #fecaca;"><strong>RH + PAIE</strong></td><td style="padding: 8px; border: 1px solid #fecaca;">Email + cloche</td></tr>
    <tr style="background: #fef2f2;"><td style="padding: 8px; border: 1px solid #fecaca;">Dette uniforme >30j non réglée</td><td style="padding: 8px; border: 1px solid #fecaca;"><strong>RH + PAIE</strong></td><td style="padding: 8px; border: 1px solid #fecaca;">Email + cloche</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #dbeafe;">Signature SMS lien public (agent)</td><td style="padding: 8px; border: 1px solid #dbeafe;">Agent</td><td style="padding: 8px; border: 1px solid #dbeafe;">SMS (GHL)</td></tr>
  </tbody>
</table>

<p style="margin-top: 16px; font-size: 13px; color: #6b7280;">+ 13 autres événements pour audit / anomalies — voir le document complet.</p>

<h2 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">⭐ Points à valider avec l'équipe</h2>

<ol style="line-height: 1.7;">
  <li><strong>Délais d'escalation</strong> : T-24h ouvrables, 30 jours pour dette ancienne, 7 jours pour lot bloqué — bons délais ?</li>
  <li><strong>Destinataires</strong> : <code>rh@xguard.ca</code> et <code>paie@xguard.ca</code> — bonnes boîtes ? Ajouter d'autres ?</li>
  <li><strong>Triage des pièces endommagées</strong> : décision immédiate au comptoir, ou parfois on veut mettre de côté pour un superviseur ?</li>
  <li><strong>Notification de l'agent</strong> : faut-il SMS rappel à l'agent (en + de RH) avant date butoir ?</li>
  <li><strong>Fin d'emploi</strong> : 1 clic suffit, ou workflow d'approbation ?</li>
  <li><strong>Lots de lavage</strong> : doit-on tracker le <strong>coût</strong> du lavage (V2) ?</li>
</ol>

<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; margin: 24px 0;">
  <strong>📎 Le document complet (606 lignes, diagrammes inclus) est sur GitHub :</strong><br>
  <a href="${githubUrl}" style="color: #059669; font-weight: 600;">${githubUrl}</a><br>
  <br>
  Vous pouvez aussi le télécharger en cliquant sur "Raw" puis l'enregistrer en .md, ou
  l'ouvrir directement dans n'importe quel éditeur Markdown (Obsidian, VS Code, Notion, etc.).
</div>

<p>Merci pour vos retours,<br>
<strong>Nicolas</strong></p>

<hr style="margin: 32px 0; border: 0; border-top: 1px solid #e5e7eb;">
<p style="font-size: 11px; color: #9ca3af;">
  Email envoyé via TalentSecure. Le module V2 est en prod. Pour tester en live : se connecter à l'app et vérifier la cloche 🔔 dans le header.
</p>

</body></html>
  `;

  console.log(`Envoi du document d'architecture vers ${to}…`);
  const result = await sendEmail({
    to,
    subject: '[XGuard] 📋 Architecture Module Uniformes V2 — pour feedback équipe',
    html,
  });
  console.log(`✓ Envoyé : ${result.messageId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
