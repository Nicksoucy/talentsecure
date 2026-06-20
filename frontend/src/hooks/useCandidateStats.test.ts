import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement, ReactNode } from 'react';

// On mocke le service appelé par le hook : aucune requête réseau réelle.
vi.mock('@/services/candidate.service', () => ({
  candidateService: {
    getCandidatesStats: vi.fn(),
  },
}));

import { candidateService } from '@/services/candidate.service';
import { useCandidateStats } from './useCandidateStats';

const getStats = candidateService.getCandidatesStats as unknown as ReturnType<typeof vi.fn>;

// Réponse type du backend : { success, data: { ...stats } }.
function makeStatsResponse(overrides: Record<string, number> = {}) {
  return {
    success: true,
    data: {
      total: 42,
      byStatus: { ACTIVE: 40, INACTIVE: 2 },
      elite: 3,
      excellent: 5,
      veryGood: 8,
      good: 10,
      qualified: 6,
      toReview: 4,
      pending: 2,
      absent: 2,
      inactive: 2,
      ...overrides,
    },
  };
}

// Chaque rendu utilise un QueryClient neuf (pas de cache partagé entre tests).
function makeWrapper() {
  const client = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCandidateStats', () => {
  it('expose les statistiques mappées depuis res.data en cas de succès', async () => {
    getStats.mockResolvedValue(makeStatsResponse());

    const { result } = renderHook(() => useCandidateStats(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Le hook expose data.data (le sous-objet), pas l'enveloppe { success, data }.
    expect(result.current.stats).toMatchObject({
      total: 42,
      elite: 3,
      excellent: 5,
      veryGood: 8,
      good: 10,
      qualified: 6,
      toReview: 4,
      pending: 2,
      absent: 2,
      inactive: 2,
    });
    expect(result.current.error).toBeNull();
    expect(getStats).toHaveBeenCalledTimes(1);
  });

  it('pendant le chargement : isLoading=true et stats indéfini', () => {
    // Promesse jamais résolue → on observe l'état initial de chargement.
    getStats.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCandidateStats(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.stats).toBeUndefined();
  });

  it('en cas de rejet du service : error défini et stats indéfini', async () => {
    getStats.mockRejectedValue(new Error('Boom 500'));

    const { result } = renderHook(() => useCandidateStats(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Boom 500');
    expect(result.current.stats).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch rappelle le service et expose les nouvelles statistiques', async () => {
    getStats
      .mockResolvedValueOnce(makeStatsResponse({ total: 10 }))
      .mockResolvedValueOnce(makeStatsResponse({ total: 99 }));

    const { result } = renderHook(() => useCandidateStats(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.stats?.total).toBe(10));

    await result.current.refetch();

    await waitFor(() => expect(result.current.stats?.total).toBe(99));
    expect(getStats).toHaveBeenCalledTimes(2);
  });

  it('passe le sous-objet data tel quel sans renvoyer l’enveloppe success', async () => {
    getStats.mockResolvedValue(makeStatsResponse());

    const { result } = renderHook(() => useCandidateStats(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.stats).toBeDefined());

    // stats ne doit pas contenir la clé `success` de l'enveloppe.
    expect(result.current.stats).not.toHaveProperty('success');
    // byStatus fait partie du sous-objet renvoyé par le backend.
    expect((result.current.stats as any).byStatus).toEqual({ ACTIVE: 40, INACTIVE: 2 });
  });
});
