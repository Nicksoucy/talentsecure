/**
 * Valide que le flux "vidéo de présentation du form" fonctionne en prod.
 * Regarde les prospects créés dans les dernières 24h.
 *   npx ts-node src/scripts/check-form-video-flow.ts
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const formCv = await p.prospectCandidate.count({
    where: { isDeleted: false, source: 'form-cv', createdAt: { gte: since } },
  });
  const formCvVideo = await p.prospectCandidate.count({
    where: { isDeleted: false, source: 'form-cv', videoStoragePath: { not: null }, createdAt: { gte: since } },
  });
  // form-cv avec une URL vidéo reçue mais PAS stockée (= téléchargement échoué)
  const formVideoUrlButNoR2 = await p.prospectCandidate.count({
    where: { isDeleted: false, source: 'form-cv', videoUrl: { not: null }, videoStoragePath: null, createdAt: { gte: since } },
  });
  const surveyVideo = await p.prospectCandidate.count({
    where: { isDeleted: false, source: 'survey-video', videoStoragePath: { not: null }, createdAt: { gte: since } },
  });

  const recent = await p.prospectCandidate.findMany({
    where: { isDeleted: false, source: 'form-cv', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { firstName: true, lastName: true, createdAt: true, videoUrl: true, videoStoragePath: true },
  });

  console.log('=== VALIDATION FLUX VIDÉO DU FORM (24 dernières heures) ===');
  console.log('Nouveaux prospects via form (source=form-cv) :', formCv);
  console.log('  dont avec vidéo stockée (R2)               :', formCvVideo);
  console.log('  avec URL vidéo reçue mais NON stockée (échec):', formVideoUrlButNoR2);
  console.log('Bonus — survey-vidéo avec vidéo (24h)         :', surveyVideo);
  if (recent.length) {
    console.log('\nDerniers prospects form (24h) :');
    for (const r of recent) {
      console.log(`  ${r.createdAt.toISOString().slice(0, 16)}  ${r.firstName} ${r.lastName}  vidéo=${r.videoStoragePath ? 'OUI (R2)' : (r.videoUrl ? 'URL reçue mais pas stockée' : 'aucune')}`);
    }
  }

  console.log('\n--- VERDICT ---');
  if (formCvVideo > 0) {
    console.log('✅ LE FLUX VIDÉO DU FORM FONCTIONNE : des prospects sont arrivés avec leur vidéo dans R2.');
  } else if (formVideoUrlButNoR2 > 0) {
    console.log('⚠️ Des vidéos ont été ENVOYÉES (video_url reçu) mais PAS stockées dans R2 → échec de téléchargement. Vérifier les logs du webhook.');
  } else if (formCv > 0) {
    console.log('⚠️ Des soumissions du form sont arrivées MAIS sans vidéo. Causes possibles : le workflow GHL n\'envoie pas encore `video_url`, ou les gens n\'ont pas mis de vidéo.');
  } else {
    console.log('ℹ️ Aucune nouvelle soumission du form en 24h — rien à valider. Refaire un test de soumission.');
  }

  await p.$disconnect();
})().catch((e) => { console.error('Erreur:', e.message); process.exit(1); });
