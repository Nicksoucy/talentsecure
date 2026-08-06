import request from 'supertest';
import type { Express } from 'express';
import { prisma, cleanDatabase } from './setup';
import { createApp } from '../app';
import { generateAccessToken } from '../utils/jwt';
import { buildGeoMapPoints, haversineKm } from '../utils/geo';
import {
  isInQuebecBounds,
  isRuralFSA,
  resolvePostalCoordinates,
} from '../services/cityGeocode.service';
import { quebecFSACentroids } from '../data/quebecFSACentroids';

// Filet anti-réseau : pour une ville INCONNUE, le service déclenche un géocodage
// Nominatim EN ARRIÈRE-PLAN (non awaité). On mocke axios pour qu'aucun appel
// réel ne parte, même en tâche de fond. Les chemins testés ici (code postal via
// centroïdes FSA offline + ville du seed statique) n'appellent jamais axios.
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: [] }) },
}));

/**
 * Couche HTTP de /api/geo/resolve : garde d'authentification staff (401/403),
 * validation des paramètres (400), 404 quand rien ne résout, et les chemins
 * heureux 100% OFFLINE — code postal (centroïde FSA QC) et ville (seed statique).
 * Aucun appel réseau réel (géocodage Nominatim mocké).
 */
describe('Routes géo — /api/geo/resolve', () => {
  let app: Express;
  let staffToken: string;
  let clientToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanDatabase();

    // Utilisateur staff (rôle autorisé) — un token suffit, la route ne lit pas
    // l'utilisateur en base (passport décode le JWT signé avec JWT_SECRET de test).
    const staff = await prisma.user.create({
      data: {
        email: 'staff.geo@test.com',
        password: 'x',
        firstName: 'Staff',
        lastName: 'Geo',
        role: 'SALES',
        isActive: true,
      },
    });
    staffToken = generateAccessToken({ userId: staff.id, email: staff.email!, role: staff.role });

    // Compte CLIENT — rejeté par authenticateStaff (403) même avec un JWT valide.
    // La stratégie passport résout un token role:'CLIENT' via la table `clients`
    // (pas `users`) : on crée donc un vrai Client et on signe le token sur son id.
    const client = await prisma.client.create({
      data: {
        name: 'Client Geo',
        email: 'client.geo@test.com',
        isActive: true,
      },
    });
    clientToken = generateAccessToken({ userId: client.id, email: client.email!, role: 'CLIENT' });
  });

  it('401 sans token', async () => {
    const res = await request(app).get('/api/geo/resolve?q=H2X1Y4');
    expect(res.status).toBe(401);
  });

  it('403 pour un token CLIENT (endpoint staff)', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?q=H2X1Y4')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(res.status).toBe(403);
  });

  it('400 si aucun paramètre (ni q, ni postalCode, ni city)', async () => {
    const res = await request(app)
      .get('/api/geo/resolve')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/q, postalCode ou city/i);
  });

  it('résout un code postal (q) → source "postal" + coordonnées QC', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?q=H2X 1Y4')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('postal');
    expect(typeof res.body.data.lat).toBe('number');
    expect(typeof res.body.data.lng).toBe('number');
    // Borne grossière du Québec : la résolution doit tomber dans la province.
    expect(res.body.data.lat).toBeGreaterThan(44);
    expect(res.body.data.lat).toBeLessThan(63);
    expect(res.body.data.lng).toBeLessThan(-57);
  });

  it('résout un code postal explicite (postalCode) → source "postal"', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?postalCode=H3A0G4')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('postal');
  });

  it('résout une ville du seed (city) → source "city"', async () => {
    const res = await request(app)
      .get('/api/geo/resolve?city=Laval')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('city');
    expect(typeof res.body.data.lat).toBe('number');
    expect(typeof res.body.data.lng).toBe('number');
  });

  it('404 pour une localisation introuvable au Québec', async () => {
    // Ville inexistante du seed → null synchrone (le géocodage de fond est mocké
    // et de toute façon non awaité) → 404.
    const res = await request(app)
      .get('/api/geo/resolve?city=ZzzVilleQuiNexistePas')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/introuvable/i);
  });
});

/**
 * buildGeoMapPoints — libellés par NOMS pour les sources listées dans
 * opts.nameLabelSources (carte des agents : pins à l'adresse exacte nommés).
 * Le comportement historique (sans opts) reste inchangé pour candidats/prospects.
 */
describe('buildGeoMapPoints — libellés par noms (agents)', () => {
  const at = (lat: number, lng: number, source: string, name?: string, postalCode: string | null = null) => ({
    lat, lng, geocodeSource: source, postalCode, city: 'Montréal', name,
  });

  it('sans opts : libellés historiques (Secteur FSA / centre-ville), noms ignorés', () => {
    const { points } = buildGeoMapPoints([
      at(45.5, -73.55, 'postal', 'Jean Tremblay', 'H1V 2E8'),
      at(45.6, -73.6, 'city', 'Marie Roy'),
    ]);
    const postal = points.find((p) => p.source === 'postal')!;
    const city = points.find((p) => p.source === 'city')!;
    expect(postal.label).toBe('Secteur H1V · Montréal');
    expect(city.label).toBe('Montréal (centre-ville approx.)');
  });

  it("source 'address' + nameLabelSources : libellé = noms, plafonné à 3 puis « +N »", () => {
    const rows = [
      at(45.5, -73.55, 'address', 'Jean Tremblay'),
      at(45.5, -73.55, 'address', 'Marie Roy'),
      at(45.5, -73.55, 'address', 'Luc Bélanger'),
      at(45.5, -73.55, 'address', 'Anne Côté'),
      at(45.51, -73.56, 'address', 'Seul Agent'),
    ];
    const { points, unplaced } = buildGeoMapPoints(rows, { nameLabelSources: ['address'] });
    expect(unplaced).toBe(0);
    const grouped = points.find((p) => p.count === 4)!;
    expect(grouped.source).toBe('address');
    expect(grouped.label).toBe('Jean Tremblay, Marie Roy, Luc Bélanger +1');
    const solo = points.find((p) => p.count === 1)!;
    expect(solo.label).toBe('Seul Agent');
  });

  it("mixte : avec opts ['address'], les points 'postal' gardent le libellé secteur", () => {
    const { points } = buildGeoMapPoints(
      [
        at(45.5, -73.55, 'address', 'Jean Tremblay'),
        at(45.6, -73.6, 'postal', 'Marie Roy', 'H2X 1Y4'),
      ],
      { nameLabelSources: ['address'] }
    );
    expect(points.find((p) => p.source === 'address')!.label).toBe('Jean Tremblay');
    expect(points.find((p) => p.source === 'postal')!.label).toBe('Secteur H2X · Montréal');
  });

  it("source 'address' SANS noms fournis → libellé « Adresse exacte · ville »", () => {
    const { points } = buildGeoMapPoints([at(45.5, -73.55, 'address')], {
      nameLabelSources: ['address'],
    });
    expect(points[0].label).toBe('Adresse exacte · Montréal');
  });

  it('personnes sans coordonnées comptées dans unplaced', () => {
    const { points, unplaced } = buildGeoMapPoints([
      at(45.5, -73.55, 'address', 'Jean Tremblay'),
      { lat: null, lng: null, geocodeSource: null, postalCode: null, city: 'Montréal', name: 'Non Placé' },
    ]);
    expect(points).toHaveLength(1);
    expect(unplaced).toBe(1);
  });
});

/**
 * Intégrité des données de géocodage postal. Ces tests ne touchent ni le réseau
 * ni la base : ils verrouillent le contenu de quebecFSACentroids et la règle
 * FSA rurale/urbaine de Postes Canada.
 */
describe('Centroïdes FSA — intégrité des données', () => {
  const entries = Object.entries(quebecFSACentroids);

  it('aucun centroïde FSA hors des bornes du Québec', () => {
    // VERROU ANTI-RÉGRESSION. Le dump GeoNames livre H0H — le code postal de
    // fantaisie du père Noël — à { lat: 90, lng: 0 }, soit le pôle Nord, à
    // ~4 900 km du Québec. L'entrée a été retirée de quebecFSACentroids.ts ;
    // ce test empêche toute régénération de la réintroduire.
    const horsQuebec = entries.filter(([, c]) => !isInQuebecBounds(c.lat, c.lng));
    expect(horsQuebec).toEqual([]);
  });

  it('H0H (père Noël) est absent du fichier ET non résolvable', () => {
    expect(quebecFSACentroids.H0H).toBeUndefined();
    expect(resolvePostalCoordinates('H0H 0H0')).toBeNull();
  });

  it('toutes les clés respectent le motif FSA (lettre-chiffre-lettre)', () => {
    const invalides = entries.filter(([fsa]) => !/^[A-Z]\d[A-Z]$/.test(fsa));
    expect(invalides).toEqual([]);
  });
});

describe('isRuralFSA — 2ᵉ caractère « 0 » = FSA rurale', () => {
  it.each(['J0J 1V0', 'J0J', 'G0A 1B0', 'J0K 2X0', 'g0a1b0'])(
    'FSA rurale : %s',
    (pc) => expect(isRuralFSA(pc)).toBe(true)
  );

  it.each(['H2X 1Y4', 'H2X', 'J4B 5X9', 'G1E 3M2'])('FSA urbaine : %s', (pc) =>
    expect(isRuralFSA(pc)).toBe(false)
  );

  it.each([null, undefined, '', '12345', 'NOTAPC'])(
    'entrée non exploitable → false : %s',
    (pc) => expect(isRuralFSA(pc as string | null | undefined)).toBe(false)
  );
});

describe('Le symptôme signalé — une FSA rurale fusionne plusieurs villages', () => {
  // Les 4 villages de la capture d'écran sont tous dans la FSA J0J. Avec le
  // placement « code postal d'abord » ils reçoivent des coordonnées IDENTIQUES.
  const J0J = { lat: 45.1529, lng: -73.1636 };
  const villages = ['Saint-Bernard-de-Lacolle', 'Napierville', 'Sabrevois', 'Île-aux-Noix'];

  it('4 villages distincts au centroïde J0J → UNE SEULE épingle', () => {
    const { points } = buildGeoMapPoints(
      villages.map((city) => ({
        lat: J0J.lat,
        lng: J0J.lng,
        geocodeSource: 'postal',
        postalCode: 'J0J 1V0',
        city,
      }))
    );
    // Le regroupement par clé `lat|lng` exacte les écrase en un seul point :
    // 3 des 4 villes n'apparaissent nulle part sur la carte.
    expect(points).toHaveLength(1);
    expect(points[0].count).toBe(4);
    expect(points[0].label).toMatch(/^Secteur J0J · /);
  });

  it('les mêmes villages à leurs vraies coordonnées → 4 épingles distinctes', () => {
    const reels = [
      { city: 'Saint-Bernard-de-Lacolle', lat: 45.0803, lng: -73.4225 },
      { city: 'Napierville', lat: 45.1875, lng: -73.4045 },
      { city: 'Sabrevois', lat: 45.2333, lng: -73.2333 },
      { city: 'Île-aux-Noix', lat: 45.1238, lng: -73.2637 },
    ];
    const { points } = buildGeoMapPoints(
      reels.map((v) => ({
        lat: v.lat,
        lng: v.lng,
        geocodeSource: 'city',
        postalCode: 'J0J 1V0',
        city: v.city,
      }))
    );
    expect(points).toHaveLength(4);
    expect(points.every((p) => p.count === 1)).toBe(true);
  });

  it('chaque village est à plus de 8 km du centroïde J0J qui le représente', () => {
    const ecarts = [
      { lat: 45.0803, lng: -73.4225 },
      { lat: 45.1875, lng: -73.4045 },
      { lat: 45.2333, lng: -73.2333 },
      { lat: 45.1238, lng: -73.2637 },
    ].map((v) => haversineKm(J0J, v));
    expect(Math.min(...ecarts)).toBeGreaterThan(8);
    expect(Math.max(...ecarts)).toBeGreaterThan(20);
  });
});
