/**
 * Jumelage candidat ↔ mandat — tests purs (aucune base de données).
 *
 * L'enjeu couvert ici : ne jamais exclure quelqu'un à tort. Chaque blocage
 * retire un candidat de la liste d'un répartiteur, donc un faux positif de
 * blocage coûte une embauche. Les cas « donnée manquante » sont donc testés
 * aussi soigneusement que les cas « exigence non remplie ».
 */
import {
  matchCandidateToMandate,
  missingShifts,
  normalizeLanguageCode,
  usableLanguageCodes,
  compareMatches,
  summarizeBlockers,
  CandidateForMatch,
  MandateRequirements,
} from '../utils/mandateMatch';

const NOW = new Date('2026-08-11T12:00:00Z');

// Montréal centre-ville, et un point ~9 km au nord-est.
const SITE = { lat: 45.5019, lng: -73.5674 };
const NEARBY = { lat: 45.5619, lng: -73.5074 };

function makeMandate(overrides: Partial<MandateRequirements> = {}): MandateRequirements {
  return {
    requiresBSP: true,
    requiresDriverLicense: false,
    requiresVehicle: false,
    requiredLanguages: [],
    shiftDays: false,
    shiftEvenings: false,
    shiftNights: false,
    shiftWeekends: false,
    lat: SITE.lat,
    lng: SITE.lng,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateForMatch> = {}): CandidateForMatch {
  return {
    id: 'c1',
    hasBSP: true,
    bspExpiryDate: new Date('2027-01-01T00:00:00Z'),
    hasDriverLicense: true,
    hasVehicle: true,
    languages: [{ language: 'Français', level: 'LANGUE_MATERNELLE' }],
    available24_7: false,
    availableDays: true,
    availableEvenings: false,
    availableNights: false,
    availableWeekends: false,
    canTravelKm: null,
    lat: NEARBY.lat,
    lng: NEARBY.lng,
    ...overrides,
  };
}

describe('normalizeLanguageCode', () => {
  it('ramène les variantes courantes à un code court', () => {
    expect(normalizeLanguageCode('Français')).toBe('FR');
    expect(normalizeLanguageCode('francais')).toBe('FR');
    expect(normalizeLanguageCode('FR')).toBe('FR');
    expect(normalizeLanguageCode('Anglais')).toBe('EN');
    expect(normalizeLanguageCode('English')).toBe('EN');
    expect(normalizeLanguageCode('Espagnol')).toBe('ES');
  });

  it('conserve une langue inconnue plutôt que de la perdre', () => {
    // Une exigence qui ne matche pas est visible ; une exigence effacée ne l'est pas.
    expect(normalizeLanguageCode('Mandarin')).toBe('MANDARIN');
    expect(normalizeLanguageCode('')).toBe('');
    expect(normalizeLanguageCode(null)).toBe('');
  });
});

describe('usableLanguageCodes', () => {
  it('écarte le niveau débutant', () => {
    const codes = usableLanguageCodes([
      { language: 'Français', level: 'LANGUE_MATERNELLE' },
      { language: 'Anglais', level: 'DEBUTANT' },
    ]);
    expect([...codes]).toEqual(['FR']);
  });

  it('accepte un niveau absent (donnée non saisie ≠ niveau faible)', () => {
    const codes = usableLanguageCodes([{ language: 'Anglais', level: null }]);
    expect(codes.has('EN')).toBe(true);
  });
});

describe('missingShifts', () => {
  it('ne signale que les quarts réellement exigés', () => {
    const gaps = missingShifts(
      { shiftDays: true, shiftEvenings: false, shiftNights: true, shiftWeekends: false },
      {
        available24_7: false,
        availableDays: true,
        availableEvenings: false,
        availableNights: false,
        availableWeekends: false,
      }
    );
    expect(gaps).toEqual(['nuit']);
  });

  it('un mandat sans quart coché n exclut personne', () => {
    const gaps = missingShifts(
      { shiftDays: false, shiftEvenings: false, shiftNights: false, shiftWeekends: false },
      {
        available24_7: false,
        availableDays: false,
        availableEvenings: false,
        availableNights: false,
        availableWeekends: false,
      }
    );
    expect(gaps).toEqual([]);
  });

  it('24/7 couvre tout, même si les 4 drapeaux n ont pas été normalisés', () => {
    // Filet pour les fiches écrites avant normalizeAvailability.
    const gaps = missingShifts(
      { shiftDays: true, shiftEvenings: true, shiftNights: true, shiftWeekends: true },
      {
        available24_7: true,
        availableDays: false,
        availableEvenings: false,
        availableNights: false,
        availableWeekends: false,
      }
    );
    expect(gaps).toEqual([]);
  });
});

describe('matchCandidateToMandate', () => {
  it('accepte un candidat qui remplit toutes les exigences', () => {
    const m = matchCandidateToMandate(makeCandidate(), makeMandate({ shiftDays: true }), NOW);
    expect(m.eligible).toBe(true);
    expect(m.blockers).toEqual([]);
    expect(m.reasons).toContain('BSP valide');
  });

  it('bloque sur BSP manquant ou expiré', () => {
    const sans = matchCandidateToMandate(makeCandidate({ hasBSP: false }), makeMandate(), NOW);
    expect(sans.eligible).toBe(false);
    expect(sans.blockers).toContain('BSP manquant');

    const expire = matchCandidateToMandate(
      makeCandidate({ bspExpiryDate: new Date('2026-01-01T00:00:00Z') }),
      makeMandate(),
      NOW
    );
    expect(expire.blockers).toContain('BSP expiré');
  });

  it('avertit sans bloquer quand le BSP expire bientôt', () => {
    const m = matchCandidateToMandate(
      makeCandidate({ bspExpiryDate: new Date('2026-09-05T12:00:00Z') }),
      makeMandate(),
      NOW
    );
    expect(m.eligible).toBe(true);
    expect(m.reasons.some((r) => r.startsWith('BSP à renouveler'))).toBe(true);
  });

  it('ignore le BSP quand le mandat ne l exige pas', () => {
    const m = matchCandidateToMandate(
      makeCandidate({ hasBSP: false }),
      makeMandate({ requiresBSP: false }),
      NOW
    );
    expect(m.eligible).toBe(true);
  });

  it('bloque sur permis et véhicule manquants', () => {
    const m = matchCandidateToMandate(
      makeCandidate({ hasDriverLicense: false, hasVehicle: false }),
      makeMandate({ requiresDriverLicense: true, requiresVehicle: true }),
      NOW
    );
    expect(m.blockers).toEqual(
      expect.arrayContaining(['Permis de conduire requis', 'Véhicule requis'])
    );
  });

  it('bloque quand une langue exigée manque, et nomme laquelle', () => {
    const m = matchCandidateToMandate(
      makeCandidate(),
      makeMandate({ requiredLanguages: ['FR', 'EN'] }),
      NOW
    );
    expect(m.eligible).toBe(false);
    expect(m.blockers).toContain('Langue requise : EN');
  });

  it('accepte quand la langue exigée est écrite autrement que dans le mandat', () => {
    const m = matchCandidateToMandate(
      makeCandidate({
        languages: [
          { language: 'Français', level: 'LANGUE_MATERNELLE' },
          { language: 'English', level: 'AVANCE' },
        ],
      }),
      makeMandate({ requiredLanguages: ['Anglais'] }),
      NOW
    );
    expect(m.eligible).toBe(true);
  });

  it('bloque sur un quart non couvert', () => {
    const m = matchCandidateToMandate(makeCandidate(), makeMandate({ shiftNights: true }), NOW);
    expect(m.blockers).toContain('Non disponible : nuit');
  });

  it('calcule la distance et l arrondit au dixième', () => {
    const m = matchCandidateToMandate(makeCandidate(), makeMandate(), NOW);
    expect(m.distanceKm).toBeGreaterThan(7);
    expect(m.distanceKm).toBeLessThan(11);
    expect(m.distanceKm).toBe(Math.round((m.distanceKm as number) * 10) / 10);
  });

  it('bloque au-delà du rayon que le candidat a lui-même déclaré', () => {
    const m = matchCandidateToMandate(makeCandidate({ canTravelKm: 5 }), makeMandate(), NOW);
    expect(m.eligible).toBe(false);
    expect(m.blockers).toContain('Hors du rayon accepté (5 km)');
  });

  it('ne bloque pas quand le rayon déclaré englobe le site', () => {
    const m = matchCandidateToMandate(makeCandidate({ canTravelKm: 50 }), makeMandate(), NOW);
    expect(m.eligible).toBe(true);
  });

  it('signale une distance inconnue sans exclure le candidat', () => {
    const sansCoords = matchCandidateToMandate(
      makeCandidate({ lat: null, lng: null }),
      makeMandate(),
      NOW
    );
    expect(sansCoords.eligible).toBe(true);
    expect(sansCoords.distanceKm).toBeNull();
    expect(sansCoords.reasons).toContain('Distance inconnue');

    // Symétrique : un mandat non géocodé ne doit pas non plus exclure.
    const siteSansCoords = matchCandidateToMandate(
      makeCandidate(),
      makeMandate({ lat: null, lng: null }),
      NOW
    );
    expect(siteSansCoords.eligible).toBe(true);
    expect(siteSansCoords.distanceKm).toBeNull();
  });

  it('accumule tous les blocages plutôt que de s arrêter au premier', () => {
    const m = matchCandidateToMandate(
      makeCandidate({ hasBSP: false, hasVehicle: false }),
      makeMandate({ requiresVehicle: true, shiftNights: true }),
      NOW
    );
    expect(m.blockers).toHaveLength(3);
  });
});

describe('compareMatches', () => {
  it('classe les plus proches d abord et les distances inconnues en dernier', () => {
    const mk = (candidateId: string, distanceKm: number | null) => ({
      candidateId,
      eligible: true,
      blockers: [],
      reasons: [],
      distanceKm,
    });
    const sorted = [mk('c-loin', 40), mk('c-inconnu', null), mk('c-proche', 3)].sort(compareMatches);
    expect(sorted.map((m) => m.candidateId)).toEqual(['c-proche', 'c-loin', 'c-inconnu']);
  });

  it('produit un ordre stable à distance égale', () => {
    const mk = (candidateId: string) => ({
      candidateId,
      eligible: true,
      blockers: [],
      reasons: [],
      distanceKm: 10,
    });
    expect([mk('b'), mk('a')].sort(compareMatches).map((m) => m.candidateId)).toEqual(['a', 'b']);
  });
});

describe('summarizeBlockers', () => {
  it('compte par motif et regroupe les rayons de valeurs différentes', () => {
    const counts = summarizeBlockers([
      { candidateId: '1', eligible: false, blockers: ['BSP manquant'], reasons: [], distanceKm: 1 },
      { candidateId: '2', eligible: false, blockers: ['BSP manquant'], reasons: [], distanceKm: 2 },
      {
        candidateId: '3',
        eligible: false,
        blockers: ['Hors du rayon accepté (5 km)'],
        reasons: [],
        distanceKm: 9,
      },
      {
        candidateId: '4',
        eligible: false,
        blockers: ['Hors du rayon accepté (20 km)'],
        reasons: [],
        distanceKm: 30,
      },
    ]);
    expect(counts).toEqual({ 'BSP manquant': 2, 'Hors du rayon accepté': 2 });
  });
});
