import {
  normalizeAvailability,
  hasAvailabilityInput,
  availabilityRowsFrom,
  flagsFromAvailabilityRows,
  parseGhlAvailability,
  findGhlAvailabilityAnswer,
} from '../availability';

/**
 * Disponibilités — règle centrale : 24/7 implique les 4 quarts. Sans elle, un
 * candidat marqué 24/7 ne ressortirait pas d'un filtre « jour », puisque la
 * recherche avancée et le portail client testent chaque colonne isolément.
 */
describe('normalizeAvailability', () => {
  it('sans entrée → les 5 drapeaux à faux', () => {
    expect(normalizeAvailability(undefined)).toEqual({
      available24_7: false,
      availableDays: false,
      availableEvenings: false,
      availableNights: false,
      availableWeekends: false,
    });
  });

  it('24/7 implique jour, soir, nuit et fin de semaine', () => {
    expect(normalizeAvailability({ available24_7: true })).toEqual({
      available24_7: true,
      availableDays: true,
      availableEvenings: true,
      availableNights: true,
      availableWeekends: true,
    });
  });

  it('conserve le détail des quarts quand 24/7 n\'est pas coché', () => {
    const flags = normalizeAvailability({ availableEvenings: true, availableWeekends: true });
    expect(flags).toEqual({
      available24_7: false,
      availableDays: false,
      availableEvenings: true,
      availableNights: false,
      availableWeekends: true,
    });
  });

  it('ne retient que le booléen `true` (une chaîne « true » ne compte pas)', () => {
    const flags = normalizeAvailability({ availableDays: 'true', availableNights: 1 });
    expect(flags.availableDays).toBe(false);
    expect(flags.availableNights).toBe(false);
  });
});

describe('hasAvailabilityInput', () => {
  it('vrai dès qu\'un drapeau est présent, même à faux', () => {
    expect(hasAvailabilityInput({ availableDays: false })).toBe(true);
  });

  it('faux quand le corps ne parle pas de disponibilités', () => {
    expect(hasAvailabilityInput({})).toBe(false);
    expect(hasAvailabilityInput(null)).toBe(false);
  });
});

describe('availabilityRowsFrom', () => {
  it('produit une ligne par quart coché, sans ligne pour 24/7', () => {
    const rows = availabilityRowsFrom(normalizeAvailability({ available24_7: true }));
    expect(rows.map((r) => r.type)).toEqual(['JOUR', 'SOIR', 'NUIT', 'FIN_DE_SEMAINE']);
  });

  it('aucun quart coché → aucune ligne', () => {
    expect(availabilityRowsFrom(normalizeAvailability({}))).toEqual([]);
  });
});

describe('flagsFromAvailabilityRows', () => {
  it('reconstruit les drapeaux depuis les lignes historiques', () => {
    const flags = flagsFromAvailabilityRows([
      { type: 'JOUR', isAvailable: true },
      { type: 'SOIR', isAvailable: true },
    ]);
    expect(flags.availableDays).toBe(true);
    expect(flags.availableEvenings).toBe(true);
    expect(flags.availableNights).toBe(false);
    expect(flags.available24_7).toBe(false);
  });

  it('les 4 quarts présents → 24/7 déduit', () => {
    const flags = flagsFromAvailabilityRows([
      { type: 'JOUR' },
      { type: 'SOIR' },
      { type: 'NUIT' },
      { type: 'FIN_DE_SEMAINE' },
    ]);
    expect(flags.available24_7).toBe(true);
  });

  it('ignore une ligne explicitement indisponible', () => {
    const flags = flagsFromAvailabilityRows([{ type: 'NUIT', isAvailable: false }]);
    expect(flags.availableNights).toBe(false);
  });

  it('aucune ligne → tout à faux (on n\'invente rien)', () => {
    expect(flagsFromAvailabilityRows([]).availableDays).toBe(false);
    expect(flagsFromAvailabilityRows(null).availableDays).toBe(false);
  });
});

/**
 * Ingestion GHL. Le champ « Disponibilités » du formulaire « Renseignements
 * étudiants » peut arriver sous plusieurs formes selon le type de champ, et son
 * identifiant n'est pas stable dans le temps → détection par la valeur.
 */
describe('parseGhlAvailability', () => {
  it('décode un tableau de cases', () => {
    const f = parseGhlAvailability(['jour', 'soir']);
    expect(f).toMatchObject({ availableDays: true, availableEvenings: true, availableNights: false });
  });

  it('décode une chaîne jointe par des virgules', () => {
    const f = parseGhlAvailability('jour, Fin de semaine');
    expect(f).toMatchObject({ availableDays: true, availableWeekends: true });
  });

  it('décode un objet indexé et un objet de cases cochées', () => {
    expect(parseGhlAvailability({ '0': 'nuit' })).toMatchObject({ availableNights: true });
    expect(parseGhlAvailability({ jour: true, soir: false })).toMatchObject({
      availableDays: true,
      availableEvenings: false,
    });
  });

  it('décode l\'enveloppe { name } de GHL', () => {
    expect(parseGhlAvailability({ name: 'Soir' })).toMatchObject({ availableEvenings: true });
  });

  it('tolère accents, casse et tirets', () => {
    expect(parseGhlAvailability('FIN-DE-SEMAINE')).toMatchObject({ availableWeekends: true });
    expect(parseGhlAvailability('Soirée')).toMatchObject({ availableEvenings: true });
  });

  it('« 24/7 » et ses variantes posent 24/7 et impliquent les 4 quarts', () => {
    for (const v of ['24/7', '24-7', '24h sur 24']) {
      const f = parseGhlAvailability(v);
      expect(f).toMatchObject({ available24_7: true, availableDays: true, availableNights: true });
    }
  });

  it('ne confond pas « toujours » avec « jour »', () => {
    expect(parseGhlAvailability('toujours')).toBeNull();
  });

  it('retourne null quand le champ est absent ou indécodable', () => {
    expect(parseGhlAvailability(null)).toBeNull();
    expect(parseGhlAvailability('')).toBeNull();
    expect(parseGhlAvailability('peu importe')).toBeNull();
  });
});

describe('findGhlAvailabilityAnswer', () => {
  it('repère la réponse par son libellé', () => {
    const found = findGhlAvailabilityAnswer({ 'Disponibilités': ['nuit'], Véhicule: 'Oui' });
    expect(found).toEqual(['nuit']);
  });

  it('repère la réponse par sa valeur quand la clé est un code GHL opaque', () => {
    const found = findGhlAvailabilityAnswer({ aB3xYz: 'jour, soir', Courriel: 'a@b.ca' });
    expect(found).toBe('jour, soir');
  });

  it('écarte un champ libre qui contient « jour » sans être une disponibilité', () => {
    expect(findGhlAvailabilityAnswer({ notes: 'je prefere de jour mais je suis flexible' })).toBeNull();
  });

  it('retourne null quand rien ne ressemble à une disponibilité', () => {
    expect(findGhlAvailabilityAnswer({ Courriel: 'a@b.ca' })).toBeNull();
    expect(findGhlAvailabilityAnswer(null)).toBeNull();
  });
});
