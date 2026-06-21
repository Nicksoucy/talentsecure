import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import { makeCandidate } from '@/test/factories';
import CandidateActionsMenu from './CandidateActionsMenu';

// Props par défaut : tous les callbacks requis sont des mocks ; les optionnels
// sont fournis au cas par cas dans chaque test.
const baseProps = () => ({
  candidate: makeCandidate({ firstName: 'Jean', lastName: 'Tremblay' }),
  onView: vi.fn(),
  onEdit: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onDelete: vi.fn(),
});

describe('CandidateActionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ouvre le menu au clic sur le bouton et appelle onView puis ferme", async () => {
    const props = baseProps();
    renderWithProviders(<CandidateActionsMenu {...props} />);

    // Le menu est fermé au départ.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));

    const menu = await screen.findByRole('menu');
    await userEvent.click(within(menu).getByText('Voir le détail'));

    expect(props.onView).toHaveBeenCalledTimes(1);
    // Le menu se referme après l'action.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('affiche Archiver (pas Désarchiver) pour un candidat non archivé', async () => {
    const props = { ...baseProps(), candidate: makeCandidate({ isArchived: false }) };
    renderWithProviders(<CandidateActionsMenu {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByText('Archiver')).toBeInTheDocument();
    expect(within(menu).queryByText('Désarchiver')).not.toBeInTheDocument();
  });

  it('affiche Désarchiver pour un candidat archivé', async () => {
    const props = { ...baseProps(), candidate: makeCandidate({ isArchived: true }) };
    renderWithProviders(<CandidateActionsMenu {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByText('Désarchiver')).toBeInTheDocument();
    expect(within(menu).queryByText('Archiver')).not.toBeInTheDocument();
  });

  it('ouvre un dialogue de confirmation et appelle onArchive seulement après confirmation', async () => {
    const props = { ...baseProps(), candidate: makeCandidate({ firstName: 'Jean', lastName: 'Tremblay' }) };
    renderWithProviders(<CandidateActionsMenu {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));
    await userEvent.click(await screen.findByText('Archiver'));

    // Le dialogue de confirmation s'ouvre avec le nom du candidat ; rien n'est encore archivé.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Archiver le candidat')).toBeInTheDocument();
    expect(within(dialog).getByText(/Jean Tremblay/)).toBeInTheDocument();
    expect(props.onArchive).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }));
    expect(props.onArchive).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onDelete si on annule le dialogue de suppression", async () => {
    const props = baseProps();
    renderWithProviders(<CandidateActionsMenu {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));
    await userEvent.click(await screen.findByText('Supprimer'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Supprimer le candidat')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("masque Supprimer et Re-convertir pour un rôle non-ADMIN", async () => {
    const props = {
      ...baseProps(),
      userRole: 'USER',
      onRevertToProspect: vi.fn(),
    };
    renderWithProviders(<CandidateActionsMenu {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));
    const menu = await screen.findByRole('menu');

    // Les actions réservées aux ADMIN ne doivent pas apparaître.
    expect(within(menu).queryByText('Supprimer')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Re-convertir en candidat potentiel')).not.toBeInTheDocument();
    // Les actions de base restent disponibles.
    expect(within(menu).getByText('Modifier')).toBeInTheDocument();
  });

  it("affiche les actions optionnelles (Analyser CV, Convertir en employé) quand les callbacks sont fournis", async () => {
    const props = {
      ...baseProps(),
      onExtractSkills: vi.fn(),
      onPromote: vi.fn(),
    };
    renderWithProviders(<CandidateActionsMenu {...props} />);

    await userEvent.click(screen.getByRole('button', { name: /plus d'actions/i }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByText('Analyser CV (IA)')).toBeInTheDocument();

    // onExtractSkills se déclenche immédiatement (pas de confirmation).
    await userEvent.click(within(menu).getByText('Analyser CV (IA)'));
    expect(props.onExtractSkills).toHaveBeenCalledTimes(1);
  });
});
