/**
 * Géocodage (rattrapage) des personnes taguées sur un contrat.
 *
 * Repart de l'état RÉEL de la base — toute personne taguée sans coordonnées —
 * et non d'une liste produite par un run précédent. Rejouable sans risque :
 * - après un import interrompu (réseau, Redis, Ctrl-C) ;
 * - après que les RH ont complété à la main les adresses manquantes.
 *
 *   npm run backfill:geocode-contract -- --code PSB
 *   npm run backfill:geocode-contract -- --code PSB --all   (retente aussi les
 *                                                            positions approx.)
 *
 * ~1,1 s par adresse (throttle Nominatim). N'écrit QUE lat/lng/geocodedAt/
 * geocodeSource ; aucune autre colonne n'est touchée.
 */
import { prisma } from '../config/database';
import {
  findContractPeopleNeedingGeocode,
  geocodeContractPeople,
} from '../services/contractGeocode.service';

const argv = process.argv.slice(2);
const value = (name: string): string | undefined => {
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const CODE_RAW = value('code');
const ALL = argv.includes('--all');

if (!CODE_RAW) {
  console.error('Usage : npm run backfill:geocode-contract -- --code <CONTRAT> [--all]');
  process.exit(1);
}

const CODE = CODE_RAW.trim().toUpperCase();

async function main() {
  const people = await findContractPeopleNeedingGeocode(CODE, ALL);
  console.log(`Contrat ${CODE} — ${people.length} personne(s) à géocoder${ALL ? ' (dont approximatives)' : ''}.`);
  if (people.length === 0) return;

  console.log(`Environ ${Math.ceil((people.length * 1.1) / 60)} min (throttle Nominatim).`);
  const tally = await geocodeContractPeople(people, (done, total) => console.log(`  … ${done}/${total}`));

  console.log(
    `\nRésultat — rue : ${tally.address} · secteur postal : ${tally.postal} · ville : ${tally.city} · non résolus : ${tally.unresolved}`
  );
  if (tally.unresolved > 0) {
    console.log('Les non résolus n\'auront pas de pin : adresse absente ou non reconnue.');
  }
}

main()
  .catch((e) => {
    console.error('Rattrapage interrompu :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
