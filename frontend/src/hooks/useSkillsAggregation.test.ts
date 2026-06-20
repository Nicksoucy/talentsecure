import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSkillsAggregation, type SkillSearchResult } from './useSkillsAggregation';

describe('useSkillsAggregation — agrégation des résultats de recherche par compétence', () => {
  it('retourne des stats vides quand aucun résultat (court-circuit)', () => {
    const { result } = renderHook(() => useSkillsAggregation([]));

    expect(result.current.categoryCounts).toEqual({});
    expect(result.current.levelCounts).toEqual({});
    expect(result.current.totalCandidates).toBe(0);
    expect(result.current.topConfidenceSkills).toEqual([]);
  });

  it('agrège les counts par catégorie et par niveau sur plusieurs compétences', () => {
    const results: SkillSearchResult[] = [
      {
        skillName: 'React',
        category: 'Frontend',
        candidates: [
          { confidence: 0.9, level: 'EXPERT' },
          { confidence: 0.5, level: 'JUNIOR' },
        ],
      },
      {
        skillName: 'Vue',
        category: 'Frontend',
        candidates: [{ confidence: 0.7, level: 'EXPERT' }],
      },
      {
        skillName: 'Postgres',
        category: 'Backend',
        candidates: [{ confidence: 0.8, level: 'JUNIOR' }],
      },
    ];

    const { result } = renderHook(() => useSkillsAggregation(results));

    // Frontend = 2 (React) + 1 (Vue) = 3 ; Backend = 1
    expect(result.current.categoryCounts).toEqual({ Frontend: 3, Backend: 1 });
    // EXPERT : React(1) + Vue(1) = 2 ; JUNIOR : React(1) + Postgres(1) = 2
    expect(result.current.levelCounts).toEqual({ EXPERT: 2, JUNIOR: 2 });
    // total = somme des categoryCounts
    expect(result.current.totalCandidates).toBe(4);
  });

  it("utilise les libellés par défaut 'Autres' (catégorie) et 'INCONNU' (niveau)", () => {
    const results: SkillSearchResult[] = [
      {
        skillName: 'Soudure',
        // pas de category
        candidates: [{ confidence: 0.6 /* pas de level */ }],
      },
    ];

    const { result } = renderHook(() => useSkillsAggregation(results));

    expect(result.current.categoryCounts).toEqual({ Autres: 1 });
    expect(result.current.levelCounts).toEqual({ INCONNU: 1 });
    expect(result.current.topConfidenceSkills[0]).toMatchObject({
      skill: 'Soudure',
      category: 'Autres',
    });
  });

  it("privilégie totalCandidates sur la longueur du tableau de candidates pour les counts", () => {
    const results: SkillSearchResult[] = [
      {
        skillName: 'Excel',
        category: 'Bureautique',
        totalCandidates: 42,
        candidates: [{ confidence: 0.9, level: 'EXPERT' }], // échantillon partiel
      },
    ];

    const { result } = renderHook(() => useSkillsAggregation(results));

    // le count catégorie suit totalCandidates (42), pas candidates.length (1)
    expect(result.current.categoryCounts).toEqual({ Bureautique: 42 });
    expect(result.current.totalCandidates).toBe(42);
    // le levelCounts lui suit le détail réel des candidates (1)
    expect(result.current.levelCounts).toEqual({ EXPERT: 1 });
    // la stat de confiance porte le totalCandidates fourni
    expect(result.current.topConfidenceSkills[0]).toMatchObject({
      skill: 'Excel',
      avgConfidence: 0.9,
      totalCandidates: 42,
    });
  });

  it('calcule avgConfidence par compétence, trie décroissant et limite à 4 (top)', () => {
    const mk = (skillName: string, confidences: number[]): SkillSearchResult => ({
      skillName,
      category: 'Tech',
      candidates: confidences.map((c) => ({ confidence: c, level: 'JUNIOR' })),
    });

    // moyennes : A=0.2, B=0.4, C=0.6, D=0.8, E=0.95
    const results: SkillSearchResult[] = [
      mk('A', [0.1, 0.3]),
      mk('B', [0.4, 0.4]),
      mk('C', [0.6]),
      mk('D', [0.7, 0.9]),
      mk('E', [0.95]),
    ];

    const { result } = renderHook(() => useSkillsAggregation(results));

    const top = result.current.topConfidenceSkills;
    expect(top).toHaveLength(4); // 5 compétences -> tronqué à 4
    expect(top.map((s) => s.skill)).toEqual(['E', 'D', 'C', 'B']); // tri décroissant, A exclu
    expect(top[0].avgConfidence).toBeCloseTo(0.95, 5);
    expect(top[1].avgConfidence).toBeCloseTo(0.8, 5);
  });

  it('ignore une compétence sans candidates dans topConfidenceSkills mais la compte via totalCandidates', () => {
    const results: SkillSearchResult[] = [
      {
        skillName: 'Compétence rare',
        category: 'Niche',
        totalCandidates: 5,
        candidates: [], // aucun échantillon
      },
      {
        skillName: 'Python',
        category: 'Backend',
        candidates: [{ confidence: 0.5, level: 'EXPERT' }],
      },
    ];

    const { result } = renderHook(() => useSkillsAggregation(results));

    // 'Compétence rare' n'a pas de candidates -> absente de topConfidenceSkills
    expect(result.current.topConfidenceSkills.map((s) => s.skill)).toEqual(['Python']);
    // mais ses 5 candidats comptent dans la catégorie et le total
    expect(result.current.categoryCounts).toEqual({ Niche: 5, Backend: 1 });
    expect(result.current.totalCandidates).toBe(6);
  });
});
