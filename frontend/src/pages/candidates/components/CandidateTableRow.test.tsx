import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { makeCandidate } from '@/test/factories';
import type { Candidate } from '@/types';
import CandidateTableRow from './CandidateTableRow';

/**
 * CandidateTableRow rend un <tr>, il doit donc vivre dans un <table><tbody>.
 * On fournit toutes les callbacks via un seul objet pour rester concis.
 */
function renderRow(
  candidate: Candidate,
  props: Partial<React.ComponentProps<typeof CandidateTableRow>> = {}
) {
  const handlers = {
    onSelect: vi.fn(),
    onView: vi.fn(),
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };
  const utils = renderWithProviders(
    <table>
      <tbody>
        <CandidateTableRow
          candidate={candidate}
          isSelected={false}
          {...handlers}
        />
      </tbody>
    </table>
  );
  return { ...utils, handlers };
}

describe('CandidateTableRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le nom, le téléphone, la ville et le statut traduit', () => {
    const candidate = makeCandidate({
      firstName: 'Marie',
      lastName: 'Dubois',
      phone: '514-555-0199',
      city: 'Laval',
      status: 'EXCELLENT',
    });

    renderRow(candidate);

    expect(screen.getByText('Marie Dubois')).toBeInTheDocument();
    expect(screen.getByText('514-555-0199')).toBeInTheDocument();
    expect(screen.getByText('Laval')).toBeInTheDocument();
    // STATUS_LABELS traduit EXCELLENT en "Excellent".
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('affiche la note globale formatée et un tiret quand elle est absente', () => {
    const { unmount } = renderRow(makeCandidate({ globalRating: 8 }));
    // "8/10" apparaît dans la cellule note ET dans le badge étoile (rating >= 7).
    expect(screen.getAllByText('8/10').length).toBeGreaterThanOrEqual(1);
    unmount();

    renderRow(makeCandidate({ globalRating: undefined }));
    // La note absente est rendue comme un tiret ; aucun "/10" ne doit apparaître.
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('marque visuellement un candidat archivé avec une puce "Archivé"', () => {
    renderRow(makeCandidate({ isArchived: true }));
    expect(screen.getByText('Archivé')).toBeInTheDocument();
  });

  it('clique sur le nom appelle onView', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    renderRow(makeCandidate({ firstName: 'Paul', lastName: 'Roy' }), { onView });

    await user.click(screen.getByText('Paul Roy'));

    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('cocher la case appelle onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRow(makeCandidate(), { onSelect });

    await user.click(screen.getByRole('checkbox'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('le menu d\'actions permet de déclencher Modifier', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderRow(makeCandidate(), { onEdit });

    await user.click(screen.getByRole('button', { name: /plus d'actions/i }));

    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByText('Modifier'));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
