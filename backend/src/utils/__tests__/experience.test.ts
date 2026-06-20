import { computeExperienceMonths } from '../experience';

describe('computeExperienceMonths', () => {
  it('0 pour vide / null / undefined', () => {
    expect(computeExperienceMonths([])).toBe(0);
    expect(computeExperienceMonths(null)).toBe(0);
    expect(computeExperienceMonths(undefined)).toBe(0);
  });

  it('utilise durationMonths quand fourni (> 0)', () => {
    expect(computeExperienceMonths([{ durationMonths: 12 }])).toBe(12);
  });

  it('calcule la durée start→end quand durationMonths absent ou 0', () => {
    expect(computeExperienceMonths([{ startDate: '2020-01-15', endDate: '2022-01-15' }])).toBe(24);
    expect(computeExperienceMonths([{ durationMonths: 0, startDate: '2020-01-01', endDate: '2020-07-01' }])).toBe(6);
  });

  it('endDate < startDate → 0 (pas de durée négative)', () => {
    expect(computeExperienceMonths([{ startDate: '2020-06-01', endDate: '2020-03-01' }])).toBe(0);
  });

  it('expérience sans date ni durée → 0', () => {
    expect(computeExperienceMonths([{}])).toBe(0);
  });

  it('somme plusieurs expériences (durée + dates)', () => {
    expect(
      computeExperienceMonths([
        { durationMonths: 6 },
        { startDate: '2021-01-01', endDate: '2021-04-01' },
      ])
    ).toBe(9);
  });

  it('poste en cours (endDate absente) → compte jusqu\'à aujourd\'hui', () => {
    // startDate très ancienne → total largement positif (déterministe : > 200 mois).
    expect(computeExperienceMonths([{ startDate: '2000-01-01' }])).toBeGreaterThan(200);
  });
});
