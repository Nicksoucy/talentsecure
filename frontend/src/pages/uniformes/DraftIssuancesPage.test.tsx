import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import type { User } from '@/types';

// La page récupère les brouillons via le service (TanStack Query) et supprime via
// une mutation. On mocke le service pour piloter chargement / données / vide
// sans toucher au réseau, et garder le test centré sur le comportement de la page.
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listIssuances: vi.fn(),
    cancelIssuance: vi.fn(),
  },
}));

// Les dialogs enfants (envoi rapide + import d'une commande collée) sont lourds
// et hors-sujet pour cette page : on les neutralise pour isoler la liste.
vi.mock('./components/SendIssuanceDialog', () => ({ default: () => null }));
vi.mock('./components/UniformOrderImportDialog', () => ({ default: () => null }));

// useNavigate est utilisé par les boutons (Ouvrir/Préparer) ; on capture les
// appels sans monter de vraies routes.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { uniformService } from '@/services/uniform.service';
import DraftIssuancesPage from './DraftIssuancesPage';

const listIssuances = vi.mocked(uniformService.listIssuances);
const cancelIssuance = vi.mocked(uniformService.cancelIssuance);

interface DraftOverrides {
  id?: string;
  employeeName?: string;
  division?: string;
  lines?: unknown[];
  createdAt?: string;
  totalLoanCost?: number;
}

function makeDraft(over: DraftOverrides = {}) {
  return {
    id: 'draft-1',
    employeeName: 'Marc Lavoie',
    division: 'SECURITE',
    createdAt: '2026-06-18T10:00:00.000Z',
    totalLoanCost: 124.5,
    lines: [
      { quantity: 2, variant: { item: { name: 'Chemise grise (ML)' }, size: 'L' } },
      { quantity: 1, variant: { item: { name: 'Pantalon militaire' }, size: 'L' } },
    ],
    ...over,
  };
}

function makeResponse(drafts: ReturnType<typeof makeDraft>[] = [makeDraft()]) {
  return { data: drafts, pagination: { total: drafts.length } } as Awaited<
    ReturnType<typeof uniformService.listIssuances>
  >;
}

// usePerms() dérive les permissions du rôle stocké dans le store auth.
function seedAuth(role: User['role'] = 'ADMIN'): void {
  useAuthStore.getState().setAuth(makeUser({ role }), 'tok', 'refresh');
}

describe('DraftIssuancesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth('ADMIN');
  });

  afterEach(() => resetStores());

  it("affiche l'en-tête et les actions de préparation", async () => {
    listIssuances.mockResolvedValue(makeResponse([]));
    renderWithProviders(<DraftIssuancesPage />);

    expect(
      screen.getByRole('heading', { name: /remises planifiées/i })
    ).toBeInTheDocument();
    // Admin (canPrepareUniformDraft) → boutons de création présents.
    expect(screen.getByRole('button', { name: /coller une commande/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /préparer une remise/i })).toBeInTheDocument();

    // Laisse la query se résoudre (évite un warning act() en fin de test).
    await screen.findByText(/aucune remise planifiée/i);
  });

  it('charge puis affiche les brouillons dans le tableau', async () => {
    listIssuances.mockResolvedValue(makeResponse());
    renderWithProviders(<DraftIssuancesPage />);

    // Après chargement, la ligne du brouillon apparaît.
    expect(await screen.findByText('Marc Lavoie')).toBeInTheDocument();

    // La division est traduite et le résumé des pièces est rendu.
    const table = screen.getByRole('table');
    expect(within(table).getByText('Sécurité')).toBeInTheDocument();
    expect(within(table).getByText(/2× Chemise grise \(ML\) L • 1× Pantalon militaire L/)).toBeInTheDocument();
    // Coût formaté.
    expect(within(table).getByText('$ 124.50')).toBeInTheDocument();

    // La query a bien demandé le statut DRAFT.
    expect(listIssuances).toHaveBeenCalledWith({ status: 'DRAFT', limit: 100 });
  });

  it("affiche l'état vide quand aucun brouillon n'est planifié", async () => {
    listIssuances.mockResolvedValue(makeResponse([]));
    renderWithProviders(<DraftIssuancesPage />);

    expect(await screen.findByText(/aucune remise planifiée/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('un rôle lecture seule (MAGASIN) masque les boutons d\'écriture', async () => {
    seedAuth('MAGASIN');
    listIssuances.mockResolvedValue(makeResponse());
    renderWithProviders(<DraftIssuancesPage />);

    await screen.findByText('Marc Lavoie');

    // canWriteUniforms = false → pas d'« Envoyer » ni de « Supprimer ».
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
    // Mais le lien d'édition reste accessible (libellé « Modifier »).
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
  });

  it('« Supprimer » confirmé déclenche la mutation cancelIssuance', async () => {
    const user = userEvent.setup();
    listIssuances.mockResolvedValue(makeResponse());
    cancelIssuance.mockResolvedValue({});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<DraftIssuancesPage />);
    await screen.findByText('Marc Lavoie');

    await user.click(screen.getByRole('button', { name: /supprimer/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(cancelIssuance).toHaveBeenCalledWith('draft-1');

    confirmSpy.mockRestore();
  });

  it('« Préparer une remise » navigue vers le wizard de création', async () => {
    const user = userEvent.setup();
    listIssuances.mockResolvedValue(makeResponse([]));
    renderWithProviders(<DraftIssuancesPage />);

    await screen.findByText(/aucune remise planifiée/i);
    await user.click(screen.getByRole('button', { name: /préparer une remise/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/uniformes/remises/nouvelle');
  });
});
