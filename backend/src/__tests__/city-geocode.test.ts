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
  geocodeNominatim,
  isGeocodableCityName,
  isRuralFSA,
  prefersCityOverFSA,
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

describe('FSA urbaines au centroïde faux — la ville l’emporte quand même', () => {
  // Constaté par géocodage inverse le 2026-08-25 : le centroïde GeoNames de H8R
  // tombe sur la RIVE SUD (Kahnawake), pas à LaSalle. 27 fiches se retrouvaient
  // de l'autre côté du fleuve. Le test du « 2ᵉ caractère = 0 » ne l'attrape pas :
  // H8R est une FSA urbaine.
  const H8R_CENTROID = { lat: 45.3994, lng: -73.6506 }; // rive sud
  const LASALLE = { lat: 45.4333, lng: -73.6333 }; // seed statique

  it('H8R + LaSalle → placé par la VILLE, du bon côté du fleuve', async () => {
    expect(isRuralFSA('H8R 3M9')).toBe(false); // FSA « urbaine » au sens de Postes Canada
    expect(prefersCityOverFSA('H8R 3M9')).toBe(true); // …mais son centroïde est faux

    const geo = await resolveProspectCoordinates({ postalCode: 'H8R 3M9', city: 'LaSalle' });

    expect(geo!.source).toBe('city');
    expect(geo!.lat).toBeCloseTo(LASALLE.lat, 3);
    expect(haversineKm(geo!, H8R_CENTROID)).toBeGreaterThan(3);
  });

  it.each(['H8P 2S6', 'G4R 2T7', 'J5K 3C6', 'G3L 1Y1', 'G7X 9N5', 'J8V 1Z9'])(
    '%s est marqué comme centroïde non fiable',
    (postalCode) => {
      expect(prefersCityOverFSA(postalCode)).toBe(true);
    }
  );

  it('une FSA urbaine SAINE garde la priorité au code postal', async () => {
    // H8N couvre aussi LaSalle et son centroïde, lui, est juste : on ne dégrade pas.
    expect(prefersCityOverFSA('H8N 1A1')).toBe(false);

    const geo = await resolveProspectCoordinates({ postalCode: 'H8N 1A1', city: 'LaSalle' });
    expect(geo!.source).toBe('postal');
  });

  it('centroïde non fiable + ville introuvable → repli sur le centroïde (fiche jamais perdue)', async () => {
    const geo = await resolveProspectCoordinates({
      postalCode: 'H8R 3M9',
      city: 'ZzzVilleQuiNExistePas',
    });

    expect(geo!.source).toBe('postal');
    expect(geo!.lat).toBeCloseTo(H8R_CENTROID.lat, 3);
  });
});

describe('Un nom de ville trop court n’est jamais géocodé', () => {
  // « QC » avait été résolu par Nominatim en plein Eeyou Istchee Baie-James
  // (51.70, -76.81), à ~700 km de Montréal, puis MÉMORISÉ dans city_geocodes :
  // trois candidats y ont été épinglés et toute fiche suivante aurait suivi.
  it.each(['QC', 'Qc', 'qc', 'M', 'm', ' M ', ''])('« %s » est refusé', (city) => {
    expect(isGeocodableCityName(city)).toBe(false);
  });

  it.each(['Laval', 'Québec', 'LaSalle', 'Gatineau'])('« %s » reste géocodable', (city) => {
    expect(isGeocodableCityName(city)).toBe(true);
  });

  it('geocodeNominatim ne fait AUCUN appel réseau pour « QC »', async () => {
    const axios = require('axios').default;
    axios.get.mockClear();

    await expect(geocodeNominatim('QC')).resolves.toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('ville « QC » sans code postal → aucune coordonnée, plutôt qu’un point à 700 km', async () => {
    const geo = await resolveProspectCoordinates({ postalCode: null, city: 'QC' });
    expect(geo).toBeNull();
  });

  it('ville « QC » AVEC code postal → placé par le code postal', async () => {
    const geo = await resolveProspectCoordinates({ postalCode: 'H1T 2K5', city: 'QC' });
    expect(geo!.source).toBe('postal');
  });
});
