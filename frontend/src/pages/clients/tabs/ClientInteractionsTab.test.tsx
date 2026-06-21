import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// Service réseau entièrement mocké : on contrôle les réponses get/create/delete.
vi.mock('@/services/client-crm.service', () => ({
  clientCrmService: {
    getInteractions: vi.fn(),
    createInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
  },
}));

import ClientInteractionsTab from './ClientInteractionsTab';
import { clientCrmService, type Interaction } from '@/services/client-crm.service';

const svc = clientCrmService as unknown as {
  getInteractions: ReturnType<typeof vi.fn>;
  createInteraction: ReturnType<typeof vi.fn>;
  deleteInteraction: ReturnType<typeof vi.fn>;
};

const makeInteraction = (overrides: Partial<Interaction> = {}): Interaction => ({
  id: 'i-1',
  clientId: 'client-1',
  type: 'CALL',
  direction: 'OUTBOUND',
  subject: 'Appel de suivi',
  content: 'Discussion sur le contrat',
  createdAt: '2026-06-20T10:00:00.000Z',
  user: { id: 'u-1', firstName: 'Alice', lastName: 'Martin' },
  ...overrides,
});

describe('ClientInteractionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche un indicateur de chargement tant que les données ne sont pas arrivées', () => {
    // Promesse jamais résolue → reste en isLoading.
    svc.getInteractions.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('affiche les interactions et le compteur dans l\'en-tête', async () => {
    svc.getInteractions.mockResolvedValue([
      makeInteraction({ id: 'i-1', subject: 'Appel de suivi', content: 'Discussion sur le contrat' }),
      makeInteraction({ id: 'i-2', subject: 'Courriel envoyé', type: 'EMAIL', direction: 'INBOUND', content: '' }),
    ]);

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    expect(await screen.findByText('Appel de suivi')).toBeInTheDocument();
    expect(screen.getByText('Courriel envoyé')).toBeInTheDocument();
    expect(screen.getByText('Discussion sur le contrat')).toBeInTheDocument();
    // Compteur d'échanges dans le titre.
    expect(screen.getByText(/Historique des échanges \(2\)/)).toBeInTheDocument();
  });

  it('affiche l\'état vide quand aucune interaction n\'est enregistrée', async () => {
    svc.getInteractions.mockResolvedValue([]);

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    expect(await screen.findByText('Aucune interaction enregistrée.')).toBeInTheDocument();
    expect(screen.getByText(/Historique des échanges \(0\)/)).toBeInTheDocument();
  });

  it('affiche un message d\'erreur quand le chargement échoue', async () => {
    svc.getInteractions.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    expect(await screen.findByText('Erreur de chargement des interactions')).toBeInTheDocument();
  });

  it('ouvre le dialogue, soumet le formulaire et appelle createInteraction', async () => {
    svc.getInteractions.mockResolvedValue([]);
    svc.createInteraction.mockResolvedValue(makeInteraction({ id: 'i-new' }));

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    await screen.findByText('Aucune interaction enregistrée.');

    await userEvent.click(screen.getByRole('button', { name: /Nouvelle interaction/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Sujet'), 'Nouvel appel');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(svc.createInteraction).toHaveBeenCalledTimes(1));
    expect(svc.createInteraction).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ type: 'CALL', direction: 'OUTBOUND', subject: 'Nouvel appel' })
    );
  });

  it('supprime une interaction après confirmation via window.confirm', async () => {
    svc.getInteractions.mockResolvedValue([makeInteraction({ id: 'i-42', subject: 'À supprimer' })]);
    svc.deleteInteraction.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    await screen.findByText('À supprimer');

    // Le seul bouton de la liste est le bouton de suppression (icône poubelle).
    const list = screen.getByRole('list');
    await userEvent.click(within(list).getByRole('button'));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(svc.deleteInteraction).toHaveBeenCalledWith('client-1', 'i-42'));
  });

  it('ne supprime pas si l\'utilisateur annule la confirmation', async () => {
    svc.getInteractions.mockResolvedValue([makeInteraction({ id: 'i-42', subject: 'À garder' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<ClientInteractionsTab clientId="client-1" />);

    await screen.findByText('À garder');

    const list = screen.getByRole('list');
    await userEvent.click(within(list).getByRole('button'));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(svc.deleteInteraction).not.toHaveBeenCalled();
  });
});
