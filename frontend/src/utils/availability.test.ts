import { describe, it, expect } from 'vitest';
import { buildAvailabilityPayload, availabilityLabels } from './availability';

/**
 * Charge utile des disponibilités envoyée par le formulaire d'entrevue.
 * Deux invariants : 24/7 implique les 4 quarts, et `availabilities` est
 * TOUJOURS un tableau — envoyer `undefined` empêchait le serveur de distinguer
 * « tout décoché » de « on n'en parle pas », donc décocher n'effaçait rien.
 */
describe('buildAvailabilityPayload', () => {
  it('aucune case cochée → 5 drapeaux à faux et un tableau vide (pas undefined)', () => {
    const payload = buildAvailabilityPayload({});

    expect(payload.availabilities).toEqual([]);
    expect(payload).toMatchObject({
      available24_7: false,
      availableDays: false,
      availableEvenings: false,
      availableNights: false,
      availableWeekends: false,
    });
  });

  it('24/7 implique jour, soir, nuit et fin de semaine', () => {
    const payload = buildAvailabilityPayload({ available24_7: true });

    expect(payload.available24_7).toBe(true);
    expect(payload.availableDays).toBe(true);
    expect(payload.availableEvenings).toBe(true);
    expect(payload.availableNights).toBe(true);
    expect(payload.availableWeekends).toBe(true);
    expect(payload.availabilities.map((a) => a.type)).toEqual([
      'JOUR',
      'SOIR',
      'NUIT',
      'FIN_DE_SEMAINE',
    ]);
  });

  it('traduit les cases du formulaire (singulier) vers les colonnes (pluriel)', () => {
    const payload = buildAvailabilityPayload({ availableEvening: true, availableWeekend: true });

    expect(payload.availableEvenings).toBe(true);
    expect(payload.availableWeekends).toBe(true);
    expect(payload.availableDays).toBe(false);
    expect(payload.availabilities.map((a) => a.type)).toEqual(['SOIR', 'FIN_DE_SEMAINE']);
  });
});

describe('availabilityLabels', () => {
  it('24/7 remplace la liste détaillée', () => {
    expect(availabilityLabels({ available24_7: true, availableDays: true })).toEqual(['24/7']);
  });

  it('liste les quarts dans l\'ordre jour → soir → nuit → FDS', () => {
    expect(
      availabilityLabels({ availableWeekends: true, availableEvenings: true, availableDays: true })
    ).toEqual(['Jour', 'Soir', 'FDS']);
  });

  it('rien de coché → liste vide', () => {
    expect(availabilityLabels({})).toEqual([]);
  });
});
