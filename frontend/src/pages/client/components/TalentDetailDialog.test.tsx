import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import type { TalentDetail } from '@/services/talent-marketplace.service';

// Service réseau entièrement mocké (MSW onUnhandledRequest:'error' → zéro appel réel).
vi.mock('@/services/talent-marketplace.service', () => ({
  talentMarketplaceService: {
    getTalentDetail: vi.fn(),
    checkout: vi.fn(),
  },
}));

// Enfant lourd (lecteur vidéo) neutralisé.
vi.mock('./CandidateMarketplaceVideoPlayer', () => ({
  default: () => <div data-testid="video-player-mock" />,
}));

import TalentDetailDialog from './TalentDetailDialog';
import { talentMarketplaceService } from '@/services/talent-marketplace.service';

const svc = talentMarketplaceService as unknown as {
  getTalentDetail: ReturnType<typeof vi.fn>;
  checkout: ReturnType<typeof vi.fn>;
};

const makeDetail = (overrides: Partial<TalentDetail> = {}): TalentDetail => ({
  id: 'cand-1',
  firstName: 'Marie',
  city: 'Montréal',
  province: 'QC',
  globalRating: 8.4,
  status: 'PUBLISHED',
  available24_7: false,
  availableDays: true,
  availableNights: false,
  availableWeekends: false,
  availableImmediately: false,
  hasBSP: false,
  bspExpiryDate: null,
  hasDriverLicense: false,
  hasVehicle: false,
  vehicleType: null,
  hasRCR: false,
  experiences: [],
  languages: [],
  skills: [],
  clientNote: null,
  hasVideo: false,
  purchased: false,
  ...overrides,
});

describe('TalentDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Par défaut : détail standard non acheté.
    svc.getTalentDetail.mockResolvedValue({ data: makeDetail() });
  });

  it('reste fermé quand candidateId est null (aucun dialog, aucun appel réseau)', () => {
    renderWithProviders(<TalentDetailDialog candidateId={null} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // enabled:!!candidateId → la requête ne part pas.
    expect(svc.getTalentDetail).not.toHaveBeenCalled();
  });

  it('ouvre le dialog, charge le détail et affiche le contenu non acheté', async () => {
    svc.getTalentDetail.mockResolvedValue({
      data: makeDetail({
        firstName: 'Marie',
        city: 'Laval',
        province: 'QC',
        globalRating: 9,
        hasBSP: true,
        clientNote: 'Excellente candidate, très ponctuelle.',
      }),
    });

    renderWithProviders(<TalentDetailDialog candidateId="cand-1" onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    expect(svc.getTalentDetail).toHaveBeenCalledWith('cand-1');

    // Nom anonymisé : prénom + puces tant que non acheté.
    expect(await within(dialog).findByText('Marie ••••')).toBeInTheDocument();
    expect(within(dialog).getByText('Laval, QC')).toBeInTheDocument();
    expect(within(dialog).getByText('9/10')).toBeInTheDocument();
    expect(within(dialog).getByText('BSP')).toBeInTheDocument();
    expect(within(dialog).getByText('Excellente candidate, très ponctuelle.')).toBeInTheDocument();
    // Bandeau d'incitation à l'achat (coordonnées masquées).
    expect(within(dialog).getByText(/Achetez ce candidat pour obtenir ses coordonnées/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Acheter ce candidat/ })).toBeInTheDocument();
  });

  it('rend le lecteur vidéo seulement quand hasVideo est vrai', async () => {
    const { rerender } = renderWithProviders(
      <TalentDetailDialog candidateId="cand-1" onClose={vi.fn()} />
    );
    await screen.findByText('Marie ••••');
    expect(screen.queryByTestId('video-player-mock')).not.toBeInTheDocument();

    svc.getTalentDetail.mockResolvedValue({ data: makeDetail({ hasVideo: true }) });
    rerender(<TalentDetailDialog candidateId="cand-2" onClose={vi.fn()} />);

    expect(await screen.findByTestId('video-player-mock')).toBeInTheDocument();
    expect(screen.getByText('Vidéo de présentation')).toBeInTheDocument();
  });

  it('révèle le nom complet et les coordonnées une fois le candidat acheté, sans bouton d\'achat', async () => {
    svc.getTalentDetail.mockResolvedValue({
      data: makeDetail({
        purchased: true,
        firstName: 'Marie',
        lastName: 'Tremblay',
        phone: '514-555-0199',
        email: 'marie@example.com',
      }),
    });

    renderWithProviders(<TalentDetailDialog candidateId="cand-1" onClose={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    // Titre : nom complet révélé (heading du DialogTitle, pas le corps de l'alerte).
    expect(await within(dialog).findByRole('heading', { name: 'Marie Tremblay' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Candidat acheté/)).toBeInTheDocument();
    expect(within(dialog).getByText(/514-555-0199/)).toBeInTheDocument();
    expect(within(dialog).getByText(/marie@example.com/)).toBeInTheDocument();
    // Plus de CTA d'achat une fois acheté.
    expect(within(dialog).queryByRole('button', { name: /Acheter ce candidat/ })).not.toBeInTheDocument();
  });

  it('appelle onClose au clic sur "Fermer"', async () => {
    const onClose = vi.fn();
    renderWithProviders(<TalentDetailDialog candidateId="cand-1" onClose={onClose} />);

    await screen.findByText('Marie ••••');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lance le checkout Stripe et redirige vers l\'URL de paiement au clic sur "Acheter"', async () => {
    svc.checkout.mockResolvedValue({ url: 'https://stripe.test/checkout/sess_123' });

    // window.location.href est assigné par handleBuy → on l'isole.
    const originalLocation = window.location;
    const assignedHref = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        set href(v: string) {
          assignedHref(v);
        },
      },
    });

    try {
      renderWithProviders(<TalentDetailDialog candidateId="cand-1" onClose={vi.fn()} />);

      const buyBtn = await screen.findByRole('button', { name: /Acheter ce candidat/ });
      await userEvent.click(buyBtn);

      await waitFor(() => expect(svc.checkout).toHaveBeenCalledWith('cand-1'));
      await waitFor(() =>
        expect(assignedHref).toHaveBeenCalledWith('https://stripe.test/checkout/sess_123')
      );
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
