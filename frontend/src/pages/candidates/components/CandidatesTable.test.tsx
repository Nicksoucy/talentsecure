import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { makeCandidate } from '@/test/factories';

// CandidateTableRow embarque un menu d'actions + badges lourds ; on le remplace
// par un stub léger qui expose juste de quoi vérifier le câblage des callbacks.
vi.mock('./CandidateTableRow', () => ({
  default: ({ candidate, isSelected, onSelect, onView }: any) => (
    <tr data-testid="candidate-row">
      <td>
        <span>{candidate.firstName} {candidate.lastName}</span>
        <input
          type="checkbox"
          aria-label={`select-${candidate.id}`}
          checked={isSelected}
          onChange={onSelect}
        />
        <button onClick={onView}>view-{candidate.id}</button>
      </td>
    </tr>
  ),
}));

import CandidatesTable from './CandidatesTable';

const defaultProps = {
  candidates: [] as any[],
  isLoading: false,
  sortBy: 'firstName',
  sortOrder: 'asc' as const,
  onSort: vi.fn(),
  selectedCandidates: new Set<string>(),
  onSelectCandidate: vi.fn(),
  onSelectAll: vi.fn(),
  onView: vi.fn(),
  onEdit: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onDelete: vi.fn(),
  onExtractSkills: vi.fn(),
  page: 1,
  onPageChange: vi.fn(),
  onAddCandidate: vi.fn(),
};

describe('CandidatesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche l'état vide et déclenche onAddCandidate au clic", async () => {
    const onAddCandidate = vi.fn();
    renderWithProviders(
      <CandidatesTable {...defaultProps} candidates={[]} onAddCandidate={onAddCandidate} />
    );

    expect(screen.getByText('Aucun candidat trouvé')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ajouter un candidat/i }));
    expect(onAddCandidate).toHaveBeenCalledTimes(1);
  });

  it('rend les en-têtes de colonnes et une ligne par candidat', () => {
    const candidates = [
      makeCandidate({ firstName: 'Alice', lastName: 'Roy' }),
      makeCandidate({ firstName: 'Bob', lastName: 'Gagnon' }),
    ];
    renderWithProviders(<CandidatesTable {...defaultProps} candidates={candidates} />);

    expect(screen.getByText('Nom')).toBeInTheDocument();
    expect(screen.getByText("Date d'entrevue")).toBeInTheDocument();
    expect(screen.getByText('Statut')).toBeInTheDocument();

    expect(screen.getAllByTestId('candidate-row')).toHaveLength(2);
    expect(screen.getByText('Alice Roy')).toBeInTheDocument();
    expect(screen.getByText('Bob Gagnon')).toBeInTheDocument();
  });

  it("cliquer un en-tête triable appelle onSort avec le bon champ", async () => {
    const onSort = vi.fn();
    const candidates = [makeCandidate()];
    renderWithProviders(
      <CandidatesTable {...defaultProps} candidates={candidates} onSort={onSort} />
    );

    await userEvent.click(screen.getByText('Nom'));
    expect(onSort).toHaveBeenCalledWith('firstName');

    await userEvent.click(screen.getByText("Date d'entrevue"));
    expect(onSort).toHaveBeenCalledWith('interviewDate');

    await userEvent.click(screen.getByText('Note'));
    expect(onSort).toHaveBeenCalledWith('globalRating');
  });

  it("la case de l'en-tête est indéterminée en sélection partielle et appelle onSelectAll", async () => {
    const onSelectAll = vi.fn();
    const candidates = [
      makeCandidate({ id: 'c1' }),
      makeCandidate({ id: 'c2' }),
    ];
    renderWithProviders(
      <CandidatesTable
        {...defaultProps}
        candidates={candidates}
        selectedCandidates={new Set(['c1'])}
        onSelectAll={onSelectAll}
      />
    );

    // La case "tout sélectionner" est la première case à cocher (en-tête).
    const headerCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    // Sélection partielle (1/2) → ni cochée, ni indéterminée comme "tout".
    expect(headerCheckbox.checked).toBe(false);

    await userEvent.click(headerCheckbox);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('affiche la pagination et appelle onPageChange au changement de page', async () => {
    const onPageChange = vi.fn();
    const candidates = [makeCandidate()];
    renderWithProviders(
      <CandidatesTable
        {...defaultProps}
        candidates={candidates}
        pagination={{ page: 1, totalPages: 3, total: 25 }}
        page={1}
        onPageChange={onPageChange}
      />
    );

    expect(
      screen.getByText(/page 1 sur 3 \(25 candidats au total\)/i)
    ).toBeInTheDocument();

    const nav = screen.getByRole('navigation');
    await userEvent.click(within(nav).getByRole('button', { name: /go to page 2/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("ne rend pas la pagination quand l'objet pagination est absent", () => {
    const candidates = [makeCandidate()];
    renderWithProviders(<CandidatesTable {...defaultProps} candidates={candidates} />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/candidats au total/i)).not.toBeInTheDocument();
  });
});
