import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import BatchResultsDialog from './BatchResultsDialog';

// Résultat batch réaliste : un succès (avec compétences), un ignoré, un échec.
const makeResults = () => ({
  summary: {
    total: 3,
    processed: 1,
    skipped: 1,
    failed: 1,
    totalSkillsExtracted: 7,
  },
  results: [
    {
      candidateId: 'cand-1234abcd-xyz',
      name: 'Jean Tremblay',
      success: true,
      skipped: false,
      skillsCount: 7,
      skills: [{ name: 'Soudure' }, { name: 'Cariste' }],
    },
    {
      candidateId: 'cand-5678efgh-xyz',
      name: 'Marie Côté',
      success: true,
      skipped: true,
      skillsCount: 0,
    },
    {
      candidateId: 'cand-9012ijkl-xyz',
      name: 'Paul Roy',
      success: false,
      skipped: false,
      error: 'CV introuvable',
    },
  ],
});

describe('BatchResultsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne rend pas le dialogue quand open=false", () => {
    renderWithProviders(
      <BatchResultsDialog open={false} onClose={vi.fn()} results={makeResults()} onViewSkills={vi.fn()} />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText("Résultats de l'Extraction Batch")).not.toBeInTheDocument();
  });

  it('affiche le titre et les cartes de synthèse quand ouvert', () => {
    renderWithProviders(
      <BatchResultsDialog open onClose={vi.fn()} results={makeResults()} onViewSkills={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText("Résultats de l'Extraction Batch")).toBeInTheDocument();

    // Les libellés des cartes de synthèse.
    expect(within(dialog).getByText('TOTAL CANDIDATS')).toBeInTheDocument();
    expect(within(dialog).getByText('SUCCÈS')).toBeInTheDocument();
    expect(within(dialog).getByText('DÉJÀ TRAITÉS')).toBeInTheDocument();
    expect(within(dialog).getByText('ÉCHECS')).toBeInTheDocument();

    // Bannière du total de compétences extraites (h3 = grand chiffre, "7" apparaît aussi en colonne).
    expect(within(dialog).getByText('Nouvelles compétences identifiées')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 3, name: '7' })).toBeInTheDocument();
  });

  it('liste chaque candidat avec son statut et son message', () => {
    renderWithProviders(
      <BatchResultsDialog open onClose={vi.fn()} results={makeResults()} onViewSkills={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');

    // Les trois candidats apparaissent dans le tableau.
    expect(within(dialog).getByText('Jean Tremblay')).toBeInTheDocument();
    expect(within(dialog).getByText('Marie Côté')).toBeInTheDocument();
    expect(within(dialog).getByText('Paul Roy')).toBeInTheDocument();

    // Statuts (chips) : Succès / Ignoré / Échec.
    expect(within(dialog).getByText('Succès')).toBeInTheDocument();
    expect(within(dialog).getByText('Ignoré')).toBeInTheDocument();
    expect(within(dialog).getByText('Échec')).toBeInTheDocument();

    // Messages spécifiques par état.
    expect(within(dialog).getByText('CV introuvable')).toBeInTheDocument();
    expect(within(dialog).getByText('Déjà traité précédemment')).toBeInTheDocument();
    expect(within(dialog).getByText('Extraction réussie')).toBeInTheDocument();
  });

  it("appelle onViewSkills avec les compétences du candidat réussi au clic sur l'oeil", async () => {
    const onViewSkills = vi.fn();
    const data = makeResults();
    renderWithProviders(
      <BatchResultsDialog open onClose={vi.fn()} results={data} onViewSkills={onViewSkills} />
    );

    // Seul le candidat réussi (non ignoré, avec skills) affiche le bouton "Voir les compétences".
    const viewButtons = screen.getAllByRole('button', { name: 'Voir les compétences' });
    expect(viewButtons).toHaveLength(1);

    await userEvent.click(viewButtons[0]);

    expect(onViewSkills).toHaveBeenCalledTimes(1);
    expect(onViewSkills).toHaveBeenCalledWith(
      data.results[0].skills,
      'Jean Tremblay',
      'cand-1234abcd-xyz'
    );
  });

  it('appelle onClose au clic sur Fermer', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BatchResultsDialog open onClose={onClose} results={makeResults()} onViewSkills={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("affiche le dialogue sans contenu de résultats quand results est null", () => {
    renderWithProviders(
      <BatchResultsDialog open onClose={vi.fn()} results={null} onViewSkills={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog');
    // Le titre reste présent, mais aucun tableau/synthèse n'est rendu.
    expect(within(dialog).getByText("Résultats de l'Extraction Batch")).toBeInTheDocument();
    expect(within(dialog).queryByText('TOTAL CANDIDATS')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument();
  });
});
