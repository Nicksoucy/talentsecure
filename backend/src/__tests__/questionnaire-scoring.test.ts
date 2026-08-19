/**
 * Calcul du questionnaire — tests purs (aucune base de données).
 *
 * Deux risques dominent et sont couverts en priorité :
 *  - marquer « bâclé » quelqu'un de sincère (un candidat écarté à tort) ;
 *  - inventer un signal à partir d'une donnée absente (site non coté, énoncé
 *    sans réponse) — le pire défaut possible pour un outil d'aide à la décision.
 */
import {
  computeQuestionnaireScores,
  computeFrictions,
  longestIdenticalRun,
  reverseValue,
  isComplete,
  missingItemIds,
  type RawAnswer,
  type MandateContext,
} from '../utils/questionnaireScoring';
import { ALL_ITEMS, TRAIT_ITEMS, PREFERENCE_ITEMS } from '../utils/questionnaireItems';

/** Réponses complètes, toutes à la même valeur brute. */
function allAt(value: number, elapsedMs = 4000): RawAnswer[] {
  return ALL_ITEMS.map((i) => ({ itemId: i.id, value, elapsedMs }));
}

/** Répondant cohérent : valeur haute sur les directs, basse sur les inversés. */
function coherent(high = 5, elapsedMs = 4000): RawAnswer[] {
  return ALL_ITEMS.map((i) => ({
    itemId: i.id,
    value: i.reverse ? reverseValue(high) : high,
    elapsedMs,
  }));
}

const EMPTY_CONTEXT: MandateContext = {
  conflictFrequency: null, publicContact: null, monotony: null,
  autonomy: null, outdoorExposure: null, physicalDemand: null,
};

describe('reverseValue', () => {
  it('renverse sur l échelle 1-5', () => {
    expect(reverseValue(1)).toBe(5);
    expect(reverseValue(3)).toBe(3);
    expect(reverseValue(5)).toBe(1);
  });
});

describe('computeQuestionnaireScores — traits', () => {
  it('remet les énoncés inversés dans le sens de la dimension', () => {
    const { traits } = computeQuestionnaireScores(coherent(5));
    // Directs à 5, inversés répondus 1 → 5 après renversement : moyenne 5.
    expect(traits.dependability).toBe(5);
    expect(traits.integrity).toBe(5);
    expect(traits.selfControl).toBe(5);
    expect(traits.stressTolerance).toBe(5);
  });

  it('un répondant qui coche 5 partout retombe vers le milieu, pas au sommet', () => {
    // C'est tout l'intérêt des énoncés inversés : le straight-lining se neutralise
    // largement. Chaque trait porte 3 énoncés directs et 2 inversés, donc la
    // valeur d'atterrissage est (5+5+5+1+1)/5 = 3,4 — proche du milieu, très loin
    // du 5 que le répondant croyait obtenir.
    const { traits } = computeQuestionnaireScores(allAt(5));
    expect(traits.dependability).toBe(3.4);
    expect(traits.integrity).toBe(3.4);
  });

  it('renvoie null pour un trait sans aucune réponse', () => {
    const seulementPreferences = PREFERENCE_ITEMS.map((i) => ({ itemId: i.id, value: 3 }));
    const { traits, preferences } = computeQuestionnaireScores(seulementPreferences);
    expect(traits.dependability).toBeNull();
    expect(preferences.conflictTolerance).toBe(3);
  });

  it('ignore les identifiants inconnus et les valeurs hors échelle', () => {
    const answers: RawAnswer[] = [
      ...coherent(4),
      { itemId: 'item_dune_version_precedente', value: 5 },
      { itemId: 'fia_1', value: 99 },
    ];
    const { traits, quality } = computeQuestionnaireScores(answers);
    expect(traits.dependability).not.toBeNull();
    // La valeur hors échelle n'écrase pas la réponse valide déjà enregistrée.
    expect(quality.answered).toBe(ALL_ITEMS.length);
  });
});

describe('computeQuestionnaireScores — contrôle qualité', () => {
  it('ne signale rien pour un répondant cohérent et posé', () => {
    const { quality } = computeQuestionnaireScores(coherent(4, 5000));
    expect(quality.careless).toBe(false);
    expect(quality.flags).toEqual([]);
    expect(quality.inconsistentTraits).toEqual([]);
  });

  it('repère une longue suite de réponses identiques', () => {
    const { quality } = computeQuestionnaireScores(allAt(3, 5000));
    expect(quality.longestIdenticalRun).toBe(TRAIT_ITEMS.length);
    expect(quality.careless).toBe(true);
    expect(quality.flags.some((f) => /identiques/.test(f))).toBe(true);
  });

  it('repère un remplissage trop rapide pour avoir été lu', () => {
    const { quality } = computeQuestionnaireScores(coherent(4, 800));
    expect(quality.careless).toBe(true);
    expect(quality.flags.some((f) => /par énoncé/.test(f))).toBe(true);
  });

  it('repère les contradictions entre énoncés directs et inversés', () => {
    // Répond 5 partout : les directs disent « très fiable », les inversés aussi
    // « peu fiable ». Contradiction sur les 4 traits.
    const { quality } = computeQuestionnaireScores(allAt(5, 5000));
    expect(quality.inconsistentTraits.length).toBe(4);
    expect(quality.flags.some((f) => /contradictoires/.test(f))).toBe(true);
  });

  it('tolère une seule contradiction sans crier au loup', () => {
    // Un seul trait contradictoire arrive chez des répondants sincères
    // (mauvaise lecture d'un énoncé) : ça ne doit pas condamner le questionnaire.
    const answers = coherent(5, 5000).map((a) =>
      a.itemId.startsWith('fia_') ? { ...a, value: 5 } : a
    );
    const { quality } = computeQuestionnaireScores(answers);
    expect(quality.inconsistentTraits).toEqual(['dependability']);
    expect(quality.flags.some((f) => /contradictoires/.test(f))).toBe(false);
  });

  it('ne signale pas la lenteur quand aucun temps n a été mesuré', () => {
    const sansTemps = coherent(4).map(({ itemId, value }) => ({ itemId, value }));
    const { quality } = computeQuestionnaireScores(sansTemps);
    expect(quality.medianMsPerItem).toBeNull();
    expect(quality.careless).toBe(false);
  });
});

describe('longestIdenticalRun', () => {
  it('repart de zéro sur un énoncé sans réponse', () => {
    const byId = new Map<string, number>();
    TRAIT_ITEMS.forEach((item, index) => {
      if (index !== 5) byId.set(item.id, 4);
    });
    // 5 avant le trou, 14 après → la suite ne traverse pas le trou.
    expect(longestIdenticalRun(byId)).toBe(TRAIT_ITEMS.length - 6);
  });
});

describe('isComplete / missingItemIds', () => {
  it('exige une réponse valide à chaque énoncé', () => {
    expect(isComplete(coherent(3))).toBe(true);
    const partiel = coherent(3).slice(0, 5);
    expect(isComplete(partiel)).toBe(false);
    expect(missingItemIds(partiel)).toHaveLength(ALL_ITEMS.length - 5);
  });

  it('une valeur hors échelle ne compte pas comme une réponse', () => {
    const answers = coherent(3).map((a) => (a.itemId === 'fia_1' ? { ...a, value: 0 } : a));
    expect(isComplete(answers)).toBe(false);
    expect(missingItemIds(answers)).toEqual(['fia_1']);
  });
});

describe('computeFrictions', () => {
  const preferences = {
    conflictTolerance: 2,
    publicContactPref: 5,
    monotonyTolerance: 1,
    autonomyPref: 3,
    outdoorTolerance: 4,
    physicalTolerance: 3,
  };

  it('ne signale que le déficit, jamais l excès', () => {
    const context: MandateContext = {
      conflictFrequency: 4, // exige 4, tolère 2 → écart 2
      publicContact: 1, // exige 1, tolère 5 → aucun écart
      monotony: 5, // exige 5, tolère 1 → écart 4
      autonomy: 3, // égal → aucun écart
      outdoorExposure: 2,
      physicalDemand: 3,
    };
    const frictions = computeFrictions(context, preferences);
    expect(frictions.map((f) => f.dimension)).toEqual(['monotonyTolerance', 'conflictTolerance']);
    expect(frictions[0]).toMatchObject({ siteRating: 5, tolerance: 1, gap: 4 });
  });

  it('un site non coté ne produit aucun écart', () => {
    expect(computeFrictions(EMPTY_CONTEXT, preferences)).toEqual([]);
  });

  it('une personne sans questionnaire ne produit aucun écart', () => {
    const context: MandateContext = { ...EMPTY_CONTEXT, monotony: 5, conflictFrequency: 5 };
    expect(computeFrictions(context, {})).toEqual([]);
  });

  it('mélange coté et non coté sans inventer de signal', () => {
    const context: MandateContext = { ...EMPTY_CONTEXT, monotony: 4, conflictFrequency: null };
    const frictions = computeFrictions(context, preferences);
    expect(frictions).toHaveLength(1);
    expect(frictions[0].dimension).toBe('monotonyTolerance');
  });
});
