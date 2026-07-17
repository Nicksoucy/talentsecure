/**
 * Géocodage NIVEAU ADRESSE des employés (addressGeocode.service).
 *
 * Aucun appel réseau réel : axios est mocké. On vérifie la stratégie
 * structurée→free-form, la borne Québec, et la chaîne de repli
 * adresse → centroïde FSA (offline) → centre-ville (seed statique).
 * Note : le throttle Nominatim partagé (~1,1 s entre appels) rend cette suite
 * volontairement « lente » de quelques secondes — c'est le vrai code.
 */
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import axios from 'axios';
import { prisma, cleanDatabase } from './setup';
import {
  fillMissingContactFieldsFromCoords,
  geocodeStreetAddress,
  resolveEmployeeCoordinates,
} from '../services/addressGeocode.service';

const axiosGet = axios.get as unknown as jest.Mock;

const MTL_HIT = { lat: '45.5019', lon: '-73.5674', class: 'place' };
const TORONTO_HIT = { lat: '43.6532', lon: '-79.3832', class: 'place' }; // hors bornes QC

describe('addressGeocode — geocodeStreetAddress', () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ data: [] });
  });

  it('requête STRUCTURÉE (street/city/postalcode, country=Canada) → coordonnées', async () => {
    axiosGet.mockResolvedValueOnce({ data: [MTL_HIT] });

    const geo = await geocodeStreetAddress({
      address: '2675 Bd Pie-IX',
      city: 'Montréal',
      postalCode: 'H1V 2E8',
    });

    expect(geo).toEqual({ lat: 45.5019, lng: -73.5674 });
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const params = axiosGet.mock.calls[0][1].params;
    expect(params).toMatchObject({
      street: '2675 Bd Pie-IX',
      city: 'Montréal',
      postalcode: 'H1V 2E8',
      country: 'Canada',
    });
  });

  it('repli FREE-FORM (q="adresse, ville, Québec, Canada") si la structurée ne trouve rien', async () => {
    axiosGet
      .mockResolvedValueOnce({ data: [] }) // structurée : rien
      .mockResolvedValueOnce({ data: [MTL_HIT] }); // free-form : trouvé

    const geo = await geocodeStreetAddress({ address: '350 rue evangeline', city: "L'Assomption" });

    expect(geo).toEqual({ lat: 45.5019, lng: -73.5674 });
    expect(axiosGet).toHaveBeenCalledTimes(2);
    const q = axiosGet.mock.calls[1][1].params.q;
    expect(q).toContain('350 rue evangeline');
    expect(q).toContain('Québec, Canada');
  }, 15000);

  it('résultat HORS Québec (Toronto) → rejeté → null', async () => {
    axiosGet
      .mockResolvedValueOnce({ data: [TORONTO_HIT] })
      .mockResolvedValueOnce({ data: [TORONTO_HIT] });

    const geo = await geocodeStreetAddress({ address: '1 Yonge St', city: 'Toronto' });
    expect(geo).toBeNull();
  }, 15000);

  it('adresse vide → null sans appel réseau', async () => {
    const geo = await geocodeStreetAddress({ address: '   ' });
    expect(geo).toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });
});

describe('addressGeocode — resolveEmployeeCoordinates (chaîne de repli)', () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ data: [] });
  });

  it("adresse trouvée → source 'address'", async () => {
    axiosGet.mockResolvedValueOnce({ data: [MTL_HIT] });
    const geo = await resolveEmployeeCoordinates({
      address: '2675 Bd Pie-IX',
      city: 'Montréal',
      postalCode: 'H1V 2E8',
    });
    expect(geo).toEqual({ lat: 45.5019, lng: -73.5674, source: 'address' });
  }, 15000);

  it("sans adresse : code postal → centroïde FSA offline, source 'postal', AUCUN appel réseau", async () => {
    const geo = await resolveEmployeeCoordinates({ postalCode: 'H2X 1Y4', city: 'Montréal' });
    expect(geo?.source).toBe('postal');
    expect(typeof geo?.lat).toBe('number');
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("adresse introuvable + pas de code postal : ville du seed → source 'city'", async () => {
    // structurée + free-form ne trouvent rien → repli sur le centre de Laval (seed statique).
    const geo = await resolveEmployeeCoordinates({ address: '9999 Rue Inconnue', city: 'Laval' });
    expect(geo?.source).toBe('city');
    expect(typeof geo?.lat).toBe('number');
  }, 15000);

  it('rien ne résout (ni adresse, ni code postal, ni ville) → null', async () => {
    const geo = await resolveEmployeeCoordinates({});
    expect(geo).toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });
});

describe('addressGeocode — fillMissingContactFieldsFromCoords (géocodage inverse)', () => {
  const REVERSE_HIT = {
    address: { city: 'Québec', postcode: 'g1e4z3' },
  };

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(() => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ data: REVERSE_HIT });
  });

  it('complète ville ET code postal manquants (CP normalisé « G1E 4Z3 »)', async () => {
    const emp = await prisma.employee.create({
      data: { firstName: 'Sans', lastName: 'Ville', phone: '4185551001', lat: 46.86, lng: -71.2, geocodeSource: 'address' },
    });
    const res = await fillMissingContactFieldsFromCoords(emp.id);
    expect(res).toEqual({ city: 'Québec', postalCode: 'G1E 4Z3' });
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.city).toBe('Québec');
    expect(after?.postalCode).toBe('G1E 4Z3');
    // Le reverse est bien parti vers l'endpoint /reverse.
    expect(String(axiosGet.mock.calls[0][0])).toContain('/reverse');
  }, 15000);

  it("n'écrase JAMAIS une valeur existante (ville présente → seul le CP est ajouté)", async () => {
    const emp = await prisma.employee.create({
      data: { firstName: 'Ville', lastName: 'Presente', phone: '4185551002', city: 'Lévis', lat: 46.8, lng: -71.18, geocodeSource: 'address' },
    });
    const res = await fillMissingContactFieldsFromCoords(emp.id);
    expect(res).toEqual({ postalCode: 'G1E 4Z3' });
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.city).toBe('Lévis'); // conservée
  }, 15000);

  it('fiche complète → null sans appel réseau', async () => {
    const emp = await prisma.employee.create({
      data: { firstName: 'Deja', lastName: 'Complet', phone: '4185551003', city: 'Québec', postalCode: 'G1E 4Z3', lat: 46.8, lng: -71.2 },
    });
    expect(await fillMissingContactFieldsFromCoords(emp.id)).toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('sans coordonnées → null sans appel réseau', async () => {
    const emp = await prisma.employee.create({
      data: { firstName: 'Pas', lastName: 'Place', phone: '4185551004' },
    });
    expect(await fillMissingContactFieldsFromCoords(emp.id)).toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('reverse sans résultat exploitable → null, fiche intacte', async () => {
    axiosGet.mockResolvedValue({ data: {} });
    const emp = await prisma.employee.create({
      data: { firstName: 'Rien', lastName: 'Trouve', phone: '4185551005', lat: 46.8, lng: -71.2 },
    });
    expect(await fillMissingContactFieldsFromCoords(emp.id)).toBeNull();
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after?.city).toBeNull();
  }, 15000);
});
