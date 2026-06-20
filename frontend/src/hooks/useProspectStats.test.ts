import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/renderWithProviders';
import { QueryClientProvider } from '@tanstack/react-query';
import { useProspectStats } from './useProspectStats';
import { prospectService } from '@/services/prospect.service';

// Le hook délègue au service : on le mocke pour piloter succès / erreur
// sans toucher au réseau (MSW est en onUnhandledRequest:'error').
vi.mock('@/services/prospect.service', () => ({
  prospectService: {
    getProspectsStats: vi.fn(),
  },
}));

const getStatsMock = vi.mocked(prospectService.getProspectsStats);

// Wrapper avec un QueryClient neuf (retry:false, gcTime:0) à chaque rendu.
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProspectStats — récupération des statistiques prospects', () => {
  it('expose les stats déballées (data.data) après un succès', async () => {
    getStatsMock.mockResolvedValue({
      success: true,
      data: {
        total: 120,
        contacted: 40,
        pending: 60,
        converted: 20,
        conversionRate: '16.7%',
      },
    });

    const { result } = renderHook(() => useProspectStats(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Le hook retourne data?.data, pas l'enveloppe complète.
    expect(result.current.stats).toEqual({
      total: 120,
      contacted: 40,
      pending: 60,
      converted: 20,
      conversionRate: '16.7%',
    });
    expect(result.current.stats?.conversionRate).toBe('16.7%');
    expect(result.current.error).toBeNull();
    expect(getStatsMock).toHaveBeenCalledTimes(1);
  });

  it('est en chargement initialement, sans stats', () => {
    // Promesse jamais résolue → reste en isLoading.
    getStatsMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProspectStats(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.stats).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('remonte l\'erreur quand le service rejette', async () => {
    const boom = new Error('Échec API stats');
    getStatsMock.mockRejectedValue(boom);

    const { result } = renderHook(() => useProspectStats(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.error).toBe(boom);
    expect(result.current.stats).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('refetch ré-appelle le service et met à jour les stats', async () => {
    getStatsMock.mockResolvedValueOnce({
      success: true,
      data: { total: 10, contacted: 2, pending: 8, converted: 0, conversionRate: '0.0%' },
    });

    const { result } = renderHook(() => useProspectStats(), { wrapper });
    await waitFor(() => expect(result.current.stats?.total).toBe(10));
    expect(getStatsMock).toHaveBeenCalledTimes(1);

    // Nouvelle donnée pour le refetch.
    getStatsMock.mockResolvedValueOnce({
      success: true,
      data: { total: 11, contacted: 3, pending: 8, converted: 0, conversionRate: '0.0%' },
    });

    await result.current.refetch();

    await waitFor(() => expect(result.current.stats?.total).toBe(11));
    expect(getStatsMock).toHaveBeenCalledTimes(2);
    expect(result.current.stats?.contacted).toBe(3);
  });

  it('expose la conversionRate telle quelle (string formatée par l\'API)', async () => {
    getStatsMock.mockResolvedValue({
      success: true,
      data: { total: 8, contacted: 4, pending: 2, converted: 2, conversionRate: '25.0%' },
    });

    const { result } = renderHook(() => useProspectStats(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // La valeur n'est pas convertie en nombre : c'est bien la string brute.
    expect(typeof result.current.stats?.conversionRate).toBe('string');
    expect(result.current.stats?.conversionRate).toBe('25.0%');
  });
});
