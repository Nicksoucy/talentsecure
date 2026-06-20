import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import CandidateComparatorDialog from './CandidateComparatorDialog';
import { makeCandidate } from '@/test/factories';
import type { Certification } from '@/types';

const makeCert = (overrides: Partial<Certification> = {}): Certification => ({
  id: 'cert-1',
  candidateId: 'cand-x',
  name: 'BSP',
  ...overrides,
});

describe('CandidateComparatorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend le dialog avec son titre quand il est ouvert', () => {
    renderWithProviders(
      <CandidateComparatorDialog
        open
        onClose={vi.fn()}
        candidates={[makeCandidate()]}
      />
    );

    const dialog = screen.getByRole('dialog');
    // Le titre stylisé est un heading de niveau 5 (le DialogTitle MUI englobe un h2).
    expect(within(dialog).getByRole('heading', { level: 5, name: 'Comparateur de candidats' })).toBeInTheDocument();
    // Libellés des lignes du tableau comparatif.
    expect(within(dialog).getByText('Note Globale')).toBeInTheDocument();
    expect(within(dialog).getByText('Mobilité')).toBeInTheDocument();
    expect(within(dialog).getByText('Certifications')).toBeInTheDocument();
  });

  it('affiche une colonne par candidat avec nom, note sur 10 et ville', () => {
    renderWithProviders(
      <CandidateComparatorDialog
        open
        onClose={vi.fn()}
        candidates={[
          makeCandidate({ firstName: 'Alice', lastName: 'Roy', city: 'Laval', globalRating: 8 }),
          makeCandidate({ firstName: 'Bob', lastName: 'Gagnon', city: 'Québec', globalRating: 6 }),
        ]}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Alice Roy')).toBeInTheDocument();
    expect(within(dialog).getByText('Bob Gagnon')).toBeInTheDocument();
    // La note brute est rendue formatée sur 10 pour chaque candidat.
    expect(within(dialog).getByText('8/10')).toBeInTheDocument();
    expect(within(dialog).getByText('6/10')).toBeInTheDocument();
    expect(within(dialog).getByText('Laval')).toBeInTheDocument();
    expect(within(dialog).getByText('Québec')).toBeInTheDocument();
  });

  it('traduit hasBSP en puce OUI/NON et liste les certifications (ou "-" si aucune)', () => {
    renderWithProviders(
      <CandidateComparatorDialog
        open
        onClose={vi.fn()}
        candidates={[
          makeCandidate({
            firstName: 'Avec',
            hasBSP: true,
            certifications: [makeCert({ id: 'c1', name: 'RCR' }), makeCert({ id: 'c2', name: 'Pompier' })],
          }),
          makeCandidate({ firstName: 'Sans', hasBSP: false, certifications: [] }),
        ]}
      />
    );

    const dialog = screen.getByRole('dialog');
    // Une puce OUI (candidat avec BSP) et une puce NON (candidat sans BSP).
    expect(within(dialog).getByText('OUI')).toBeInTheDocument();
    expect(within(dialog).getByText('NON')).toBeInTheDocument();
    // Certifications listées sous forme de puces.
    expect(within(dialog).getByText('RCR')).toBeInTheDocument();
    expect(within(dialog).getByText('Pompier')).toBeInTheDocument();
    // Candidat sans certification → placeholder "-".
    expect(within(dialog).getByText('-')).toBeInTheDocument();
  });

  it('appelle onClose au clic sur le bouton "Fermer"', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <CandidateComparatorDialog
        open
        onClose={onClose}
        candidates={[makeCandidate()]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ne rend aucun dialog quand la liste de candidats est vide, même ouvert', () => {
    renderWithProviders(
      <CandidateComparatorDialog open onClose={vi.fn()} candidates={[]} />
    );

    // Le garde précoce retourne null : aucun dialog, aucun titre.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Comparateur de candidats')).not.toBeInTheDocument();
  });

  it('ne montre pas le contenu quand open=false', async () => {
    const { rerender } = renderWithProviders(
      <CandidateComparatorDialog
        open
        onClose={vi.fn()}
        candidates={[makeCandidate({ firstName: 'Visible' })]}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <CandidateComparatorDialog
        open={false}
        onClose={vi.fn()}
        candidates={[makeCandidate({ firstName: 'Visible' })]}
      />
    );

    // Dialog fermé : après la transition de sortie, MUI démonte le contenu.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Comparateur de candidats')).not.toBeInTheDocument();
  });
});
