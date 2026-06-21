import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import ExtractionResultsDialog from './ExtractionResultsDialog';
import type { ExtractedSkill } from '@/services/skills.service';

const makeSkill = (overrides: Partial<ExtractedSkill> = {}): ExtractedSkill => ({
  skillName: 'Soudure',
  level: 'ADVANCED',
  confidence: 0.92,
  yearsExperience: 5,
  reasoning: 'Mentionné explicitement dans le CV',
  isSecurityRelated: false,
  ...overrides,
});

describe('ExtractionResultsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne monte pas le contenu du dialogue quand open=false", () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open={false}
        onClose={vi.fn()}
        extractedSkills={[makeSkill()]}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText("Résultats de l'extraction")).not.toBeInTheDocument();
  });

  it("affiche l'onglet 'Autre Compétence' par défaut avec la compétence non sécuritaire et sa confiance", () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        extractedSkills={[makeSkill({ skillName: 'Premiers soins', confidence: 0.8 })]}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText("Résultats de l'extraction")).toBeInTheDocument();
    // Alerte de succès pour 1 compétence non sécuritaire (accord au singulier).
    expect(within(dialog).getByText(/non liée à la sécurité a été trouvée/)).toBeInTheDocument();
    // Onglets : libellés avec compteurs.
    expect(within(dialog).getByRole('tab', { name: 'Autre Compétence (1)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Compétences Sécurité (0)' })).toBeInTheDocument();
    // Détail de la compétence : nom, niveau traduit, ancienneté, confiance.
    expect(within(dialog).getByText('Premiers soins')).toBeInTheDocument();
    expect(within(dialog).getByText('Avancé')).toBeInTheDocument();
    expect(within(dialog).getByText('5 ans')).toBeInTheDocument();
    expect(within(dialog).getByText('80%')).toBeInTheDocument();
  });

  it("affiche un état vide pour l'onglet 'Autre Compétence' quand toutes les compétences sont sécuritaires", () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        extractedSkills={[makeSkill({ skillName: 'Gardiennage', isSecurityRelated: true })]}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const dialog = screen.getByRole('dialog');
    // Onglet "Autre Compétence" actif et vide → message info dédié.
    expect(
      within(dialog).getByText("Aucune compétence non liée à la sécurité n'a été trouvée dans ce CV.")
    ).toBeInTheDocument();
    // La compétence sécuritaire n'est pas listée dans l'onglet actif.
    expect(within(dialog).queryByText('Gardiennage')).not.toBeInTheDocument();
  });

  it("bascule sur l'onglet 'Compétences Sécurité' et affiche la compétence correspondante", async () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        extractedSkills={[makeSkill({ skillName: 'Gardiennage', isSecurityRelated: true })]}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Compétences Sécurité (1)' }));

    expect(within(dialog).getByText('Gardiennage')).toBeInTheDocument();
  });

  it('appelle onSave au clic sur le bouton de sauvegarde et onClose au clic sur Fermer', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={onClose}
        extractedSkills={[makeSkill()]}
        onSave={onSave}
        isSaving={false}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sauvegarder les Compétences' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("désactive le bouton de sauvegarde et affiche 'Sauvegarde...' pendant la sauvegarde", () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        extractedSkills={[makeSkill()]}
        onSave={vi.fn()}
        isSaving
      />
    );

    const saveButton = screen.getByRole('button', { name: 'Sauvegarde...' });
    expect(saveButton).toBeDisabled();
  });

  it('désactive le bouton de sauvegarde quand aucune compétence n\'a été extraite', () => {
    renderWithProviders(
      <ExtractionResultsDialog
        open
        onClose={vi.fn()}
        extractedSkills={[]}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Sauvegarder les Compétences' })).toBeDisabled();
  });
});
