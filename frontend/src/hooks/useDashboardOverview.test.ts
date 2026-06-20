import { createElement, type ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DashboardOverview } from '@/services/dashboard.service';

// On mocke le service réseau : le hook ne doit jamais toucher MSW/axios.
vi.mock('@/services/dashboard.service', () => ({
  dashboardService: { getOverview: vi.fn() },
}));

import { dashboardService } from '@/services/dashboard.service';
import { useDashboardOverview } from './useDashboardOverview';

const getOverview = dashboardService.getOverview as ReturnType<typeof vi.fn>;

function makeOverview(over: Partial<DashboardOverview> = {}): DashboardOverview {
  return {
    catalogues: { total: 12, createdThisWeek: 3 },
    conversions: { total: 40, convertedThisMonth: 5 },
    employees: { total: 8, active: 6 },
    recentActivity: [
      {
        id: 'a1',
        action: 'CREATE',
        resource: 'candidate',
        resourceId: 'c1',
        details: null,
        createdAt: '2026-06-19T10:00:00.000Z',
        user: { name: 'Léa' },
      },
    ],
    ...over,
  };
}

// Wrapper QueryClient dédié, recréé à chaque rendu pour isoler le cache.
// createElement plutôt que JSX pour rester dans un fichier .ts.
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

describe('useDashboardOverview', () => {
  it('chemin succès : expose data.data (le DashboardOverview démappé) dans overview', async () => {
    const overview = makeOverview();
    getOverview.mockResolvedValueOnce({ success: true, data: overview });

    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // overview = data.data (et non l'enveloppe { success, data }).
    expect(result.current.overview).toEqual(overview);
    expect(result.current.overview?.catalogues.total).toBe(12);
    expect(result.current.overview?.recentActivity[0].user.name).toBe('Léa');
    expect(result.current.error).toBeNull();
    expect(getOverview).toHaveBeenCalledTimes(1);
    expect(getOverview).toHaveBeenCalledWith();
  });

  it('pendant le chargement : isLoading vrai et overview indéfini', async () => {
    // Promesse jamais résolue → on reste en chargement.
    getOverview.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.overview).toBeUndefined();
  });

  it("chemin erreur : si le service rejette, error est défini et overview reste indéfini", async () => {
    getOverview.mockRejectedValueOnce(new Error('Boom serveur'));

    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect((result.current.error as Error).message).toBe('Boom serveur');
    expect(result.current.overview).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch : rappelle le service et expose les nouvelles données', async () => {
    const first = makeOverview({ catalogues: { total: 1, createdThisWeek: 0 } });
    const second = makeOverview({ catalogues: { total: 99, createdThisWeek: 7 } });
    getOverview.mockResolvedValueOnce({ success: true, data: first });
    getOverview.mockResolvedValueOnce({ success: true, data: second });

    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.overview?.catalogues.total).toBe(1));

    await result.current.refetch();

    await waitFor(() => expect(result.current.overview?.catalogues.total).toBe(99));
    expect(getOverview).toHaveBeenCalledTimes(2);
  });

  it('overview est indéfini quand la réponse ne porte pas de data', async () => {
    // Réponse dégradée du backend : { success } sans data → overview indéfini.
    getOverview.mockResolvedValueOnce({ success: true } as never);

    const { result } = renderHook(() => useDashboardOverview(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.overview).toBeUndefined();
    expect(result.current.error).toBeNull();
  });
});
