/**
 * Précision du géocodage : FSA RURALE vs URBAINE (cityGeocode.service).
 *
 * Une FSA rurale (2ᵉ caractère « 0 ») couvre des centaines de km² et plusieurs
 * municipalités : son centroïde ne doit PAS l'emporter sur le centre-ville.
 * Une FSA urbaine (quelques km²) reste au contraire plus précise que la ville.
 *
 * Aucun appel réseau réel : axios est mocké — les chemins testés passent par le
 * seed statique (offline) et le cache DB city_geocodes.
 */
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: [] }) },
}));

import { prisma, cleanDatabase } from './setup';
import {
  isRuralFSA,
  resolvePostalCoordinates,
  resolveProspectCoordinates,
} from '../services/cityGeocode.service';
import { haversineKm } from '../utils/geo';

// Centroïde de la FSA rurale J0J — celui qui écrasait 4 villages en un point.
const J0J = { lat: 45.1529, lng: -73.1636 };
// Île-aux-Noix est dans le seed statique (data/quebecCities.ts).
const ILE_AUX_NOIX = { lat: 45.1238, lng: -73.2637 };

describe('resolveProspectCoordinates — FSA urbaine : le code postal reste prioritaire', () => {
  it('H2X + ville → source postal, aux coordonnées du secteur (pas celles de la ville)', async () => {
    const geo = await resolveProspectCoordinates({
      postalCode: 'H2X 1Y4',
      city: 'Laval',
    });

    expect(geo).not.toBeNull();
    expect(geo!.source).toBe('postal');
    expect(geo).toMatchObject(resolvePostalCoordinates('H2X 1Y4')!);
  });

  it('sans code postal → repli sur le centre-ville', async () => {
    const geo = await resolveProspectCoordinates({ postalCode: null, city: 'Île-aux-Noix' });

    expect(geo!.source).toBe('city');
    expect(geo!.lat).toBeCloseTo(ILE_AUX_NOIX.lat, 3);
  });
});

describe('resolveProspectCoordinates — FSA rurale : la ville l’emporte', () => {
  it('J0J + ville connue → source city, et la fiche BOUGE loin du centroïde J0J', async () => {
    const geo = await resolveProspectCoordinates({
      postalCode: 'J0J 1V0',
      city: 'Île-aux-Noix',
    });

    expect(geo!.source).toBe('city');
    expect(geo!.lat).toBeCloseTo(ILE_AUX_NOIX.lat, 3);
    expect(geo!.lng).toBeCloseTo(ILE_AUX_NOIX.lng, 3);
    // C'est tout l'intérêt du correctif : le point n'est plus au centre de la FSA.
    expect(haversineKm(geo!, J0J)).toBeGreaterThan(5);
  });

  it('J0J + ville INCONNUE → repli sur le centroïde FSA (on ne perd pas la fiche)', async () => {
    const geo = await resolveProspectCoordinates({
      postalCode: 'J0J 1V0',
      city: 'ZzzVilleQuiNExistePas',
    });

    expect(geo!.source).toBe('postal');
    expect(geo!.lat).toBeCloseTo(J0J.lat, 3);
  });

  it('J0J sans ville du tout → repli sur le centroïde FSA', async () => {
    const geo = await resolveProspectCoordinates({ postalCode: 'J0J 1V0', city: null });

    expect(geo!.source).toBe('postal');
    expect(geo!.lat).toBeCloseTo(J0J.lat, 3);
  });

  it('ville résolue depuis le CACHE DB (pas le seed) → source city', async () => {
    // Napierville n'est pas dans le seed statique : elle vient de city_geocodes,
    // alimenté par le pré-chauffage. Prouve que le cache nourrit bien la règle.
    await cleanDatabase();
    await prisma.cityGeocode.create({
      data: {
        cityKey: 'napierville',
        city: 'Napierville',
        lat: 45.1875,
        lng: -73.4045,
        found: true,
        source: 'nominatim',
      },
    });

    const geo = await resolveProspectCoordinates({
      postalCode: 'J0J 1V0',
      city: 'Napierville',
    });

    expect(geo!.source).toBe('city');
    expect(geo!.lat).toBeCloseTo(45.1875, 3);
    expect(haversineKm(geo!, J0J)).toBeGreaterThan(15);
  });

  it('ville en cache NÉGATIF (found=false) → repli sur le centroïde FSA', async () => {
    await cleanDatabase();
    await prisma.cityGeocode.create({
      data: {
        cityKey: 'ville introuvable',
        city: 'Ville Introuvable',
        lat: null,
        lng: null,
        found: false,
        source: 'nominatim',
      },
    });

    const geo = await resolveProspectCoordinates({
      postalCode: 'J0J 1V0',
      city: 'Ville Introuvable',
    });

    expect(geo!.source).toBe('postal');
  });
});

describe('H0H — le code postal du père Noël ne place plus personne', () => {
  it('resolvePostalCoordinates rejette H0H', () => {
    expect(resolvePostalCoordinates('H0H 0H0')).toBeNull();
  });

  it('H0H + ville connue → la fiche est placée par la VILLE, pas au pôle Nord', async () => {
    // H0H a un « 0 » en 2ᵉ position : il est traité comme rural, donc la ville
    // passe d'abord — et le repli FSA ne donne rien puisque l'entrée a été purgée.
    expect(isRuralFSA('H0H 0H0')).toBe(true);

    const geo = await resolveProspectCoordinates({
      postalCode: 'H0H 0H0',
      city: 'Montréal',
    });

    expect(geo!.source).toBe('city');
    expect(geo!.lat).toBeLessThan(50); // plus jamais lat 90
  });

  it('H0H sans ville exploitable → aucune coordonnée (plutôt qu’un point aberrant)', async () => {
    const geo = await resolveProspectCoordinates({
      postalCode: 'H0H 0H0',
      city: 'ZzzVilleQuiNExistePas',
    });

    expect(geo).toBeNull();
  });
});

describe('resolveProspectCoordinates ne produit JAMAIS de précision « adresse »', () => {
  // Garde-fou documentaire du bug survenu le 2026-08-05 : un backfill --all sur
  // prospects/candidats a écrasé 65 fiches géocodées à la RUE (posées par
  // contractGeocode.service) avec un centroïde de secteur ou de ville. Les
  // scripts excluent désormais geocodeSource='address' en mode --all ; ce test
  // rappelle POURQUOI cette exclusion est nécessaire.
  it.each([
    { postalCode: 'H2X 1Y4', city: 'Montréal' },
    { postalCode: 'J0J 1V0', city: 'Île-aux-Noix' },
    { postalCode: null, city: 'Québec' },
  ])('source ∈ {postal, city} pour %o', async (input) => {
    const geo = await resolveProspectCoordinates(input);
    expect(geo).not.toBeNull();
    expect(['postal', 'city']).toContain(geo!.source);
    expect(geo!.source).not.toBe('address');
  });
});
