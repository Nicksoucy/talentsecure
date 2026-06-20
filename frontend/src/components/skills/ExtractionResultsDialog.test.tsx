import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import ExtractionResultsDialog from './ExtractionResultsDialog';

// Le type BatchResults n'est pas exporté par le composant : on le reconstruit
// localement pour des props réalistes et typées.
interface BatchResult {
  candidateId: string;
  candidateName?: string;
  success: boolean;
  skillsFound?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}
interface BatchResults {
  summary: {
    total: number;
    processed?: number;
    skipped?: number;
    failed: number;
    totalSkillsExtracted: number;
  };
  message: string;
  results: BatchResult[];
}

const makeResults = (overrides: Partial<BatchResults> = {}): BatchResults => ({
  summary: {
    total: 4,
    processed: 3,
    skipped: 1,
    failed: 0,
    totalSkillsExtracted: 27,
    ...overrides.summary,
  },
  message: 'Extraction terminée avec succès',
  results: overrides.results ?? [
    {
      candidateId: 'cand-aaaaaaaa-1111',
      candidateName: 'Jean Tremblay',
      success: true,
      skillsFound: 12,
    },
    {
      candidateId: 'cand-bbbbbbbb-2222',
      candidateName: 'Marie Lavoie',
      success: false,
      skipped: true,
      reason: 'CV déjà analysé récemment',
      skillsFound: 0,
    },
    {
      candidateId: 'cand-cccccccc-3333',
      candidateName: 'Paul Gagnon',
      success: false,
      error: 'Format de CV non supporté',
      skillsFound: 0,
    },
  ],
  ...overrides,
});

describe('ExtractionResultsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien quand results est null', () => {
    renderWithProviders(
      <ExtractionResultsDialog open onClose={vi.fn()} results={null} />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText("Résultats de l'Extraction Batch")).not.toBeInTheDocument();
  });

  it("n'affiche pas le contenu du dialogue quand open=false", () => {
    renderWithProviders(
      <ExtractionResultsDialog open={false} onClose={vi.fn()} results={makeResults()} />
    );

    // MUI ne monte pas le contenu du Dialog tant qu'il n'est pas ouvert.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText("Résultats de l'Extraction Batch")).not.toBeInTheDocument();
  });

  it('affiche les cartes de synthèse avec les compteurs et le total des compétences', () => {
    renderWithProviders(
      <ExtractionResultsDialog open onClose={vi.fn()} results={makeResults()} />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText("Résultats de l'Extraction Batch")).toBeInTheDocument();

    // Chaque carte couple une valeur (chiffre) à son libellé.
    const totalLabel = within(dialog).getByText('Total');
    expect(within(totalLabel.closest('.MuiCard-root') as HTMLElement).getByText('4')).toBeInTheDocument();

    const traitesLabel = within(dialog).getByText('Traités');
    expect(within(traitesLabel.closest('.MuiCard-root') as HTMLElement).getByText('3')).toBeInTheDocument();

    const ignoresLabel = within(dialog).getByText('Ignorés');
    expect(within(ignoresLabel.closest('.MuiCard-root') as HTMLElement).getByText('1')).toBeInTheDocument();

    const skillsLabel = within(dialog).getByText('Compétences Totales Extraites');
    expect(within(skillsLabel.closest('.MuiCard-root') as HTMLElement).getByText('27')).toBeInTheDocument();
  });

  it('affiche une alerte de succès et le bon taux de réussite (processed/total)', () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        results={makeResults({
          summary: { total: 4, processed: 3, skipped: 1, failed: 0, totalSkillsExtracted: 27 },
        })}
      />
    );

    // 3/4 = 75% → severity "success".
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('MuiAlert-standardSuccess');
    expect(within(alert).getByText('Extraction terminée avec succès')).toBeInTheDocument();
    expect(within(alert).getByText('Taux de réussite: 75%')).toBeInTheDocument();
  });

  it('liste chaque candidat avec le statut adéquat (Succès / Ignoré / Échec) et le conseil en cas d\'échec', () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        results={makeResults({
          summary: { total: 3, processed: 1, skipped: 1, failed: 1, totalSkillsExtracted: 12 },
        })}
      />
    );

    // Ligne "succès" : nom + nombre de compétences + chip "Succès".
    const successRow = screen.getByText('Jean Tremblay').closest('tr') as HTMLElement;
    expect(within(successRow).getByText('Succès')).toBeInTheDocument();
    expect(within(successRow).getByText('12')).toBeInTheDocument();

    // Ligne "ignoré" : chip "Ignoré" + raison affichée.
    const skippedRow = screen.getByText('Marie Lavoie').closest('tr') as HTMLElement;
    expect(within(skippedRow).getByText('Ignoré')).toBeInTheDocument();
    expect(within(skippedRow).getByText('CV déjà analysé récemment')).toBeInTheDocument();

    // Ligne "échec" : chip "Échec" + message d'erreur affiché.
    const failedRow = screen.getByText('Paul Gagnon').closest('tr') as HTMLElement;
    expect(within(failedRow).getByText('Échec')).toBeInTheDocument();
    expect(within(failedRow).getByText('Format de CV non supporté')).toBeInTheDocument();

    // L'alerte d'aide n'apparaît que lorsqu'il y a au moins un échec.
    expect(screen.getByText(/Conseils:/)).toBeInTheDocument();
  });

  it("n'affiche pas l'alerte de conseils quand il n'y a aucun échec", () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        results={makeResults({
          summary: { total: 2, processed: 2, skipped: 0, failed: 0, totalSkillsExtracted: 8 },
          results: [
            { candidateId: 'cand-1', candidateName: 'A', success: true, skillsFound: 5 },
            { candidateId: 'cand-2', candidateName: 'B', success: true, skillsFound: 3 },
          ],
        })}
      />
    );

    expect(screen.queryByText(/Conseils:/)).not.toBeInTheDocument();
  });

  it('appelle onClose au clic sur le bouton Fermer et sur la croix', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ExtractionResultsDialog open onClose={onClose} results={makeResults()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // La croix de l'en-tête déclenche aussi onClose.
    const buttons = screen.getAllByRole('button');
    const closeIconBtn = buttons.find((b) => b.querySelector('[data-testid="CloseIcon"]'));
    expect(closeIconBtn).toBeDefined();
    await userEvent.click(closeIconBtn as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
