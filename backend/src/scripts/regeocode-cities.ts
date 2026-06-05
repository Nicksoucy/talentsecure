/**
 * Re-évalue toutes les villes géocodées via Nominatim avec la logique STRICTE
 * (requête structurée + bornes Québec + filtre lieu). Corrige les anciens
 * faux-positifs hors-QC (Dakar/Regina/Moncton placés au Québec à tort).
 *
 * À lancer ponctuellement : npx ts-node src/scripts/regeocode-cities.ts
 */
import { refreshNominatimCache } from '../services/cityGeocode.service';
import { prisma } from '../config/database';

async function run() {
  console.log('🔄 Re-géocodage strict des villes en cache (1 req/s)...\n');
  const r = await refreshNominatimCache();
  console.log(`\n📊 ${r.rechecked} villes re-vérifiées : ${r.found} placées, ${r.unplaced} non placées.`);
  if (r.fixed.length > 0) {
    console.log(`\n🧹 ${r.fixed.length} faux-positifs corrigés (désormais non placées) :`);
    console.log('   ' + r.fixed.join(', '));
  }
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('❌ Erreur:', e);
  process.exit(1);
});
