import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/skills.service', () => ({
  skillsService: { extractSkills: vi.fn(), saveSkills: vi.fn() },
}));

import SkillsExtractionPanel from './SkillsExtractionPanel';
import { skillsService, type ExtractedSkill, type ExtractionResult } from '@/services/skills.service';
import { useAuthStore } from '@/store/authStore';

const svc = skillsService as unknown as {
  extractSkills: ReturnType<typeof vi.fn>;
  saveSkills: ReturnType<typeof vi.fn>;
};

const makeSkill = (overrides: Partial<ExtractedSkill> = {}): ExtractedSkill => ({
  skillName: 'Patrouille de sécurité',
  level: 'ADVANCED',
  confidence: 0.92,
  yearsExperience: 5,
  reasoning: 'Mentionné explicitement dans le CV',
  isSecurityRelated: true,
  ...overrides,
});

const makeResult = (overrides: Partial<ExtractionResult> = {}): ExtractionResult => ({
  success: true,
  candidateId: 'cand-1',
  model: 'gpt-3.5-turbo',
  skillsFound: [makeSkill()],
  totalSkills: 1,
  processingTimeMs: 1500,
  promptTokens: 100,
  completionTokens: 50,
  totalCost: 0.0012,
  ...overrides,
});

const renderPanel = (props: Partial<React.ComponentProps<typeof SkillsExtractionPanel>> = {}) =>
  renderWithProviders(
    <SkillsExtractionPanel
      candidateId="cand-1"
      candidateName="Jean Tremblay"
      hasCv
      {...props}
    />
  );

describe('SkillsExtractionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ accessToken: 'tok-123', isAuthenticated: true });
  });

  it('désactive le bouton et affiche une alerte quand le candidat n\'a pas de CV', () => {
    renderPanel({ hasCv: false });

    expect(screen.getByRole('button', { name: /extraire avec ai/i })).toBeDisabled();
    expect(
      screen.getByText(/veuillez uploader un cv pour ce candidat/i)
    ).toBeInTheDocument();
    // Pas de dialogue de résultats tant qu'aucune extraction n'a eu lieu.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('extrait les compétences et ouvre le dialogue de résultats avec le nom du candidat', async () => {
    svc.extractSkills.mockResolvedValue(makeResult());
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /extraire avec ai/i }));

    await waitFor(() =>
      expect(svc.extractSkills).toHaveBeenCalledWith('cand-1', 'gpt-3.5-turbo', 'tok-123')
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/compétences extraites - jean tremblay/i)).toBeInTheDocument();
    // La compétence sécurité extraite apparaît dans l'onglet par défaut.
    expect(within(dialog).getByText('Patrouille de sécurité')).toBeInTheDocument();
    expect(within(dialog).getByText('Avancé')).toBeInTheDocument();
  });

  it('sépare les compétences sécurité et autres entre les deux onglets', async () => {
    svc.extractSkills.mockResolvedValue(
      makeResult({
        skillsFound: [
          makeSkill({ skillName: 'Contrôle d\'accès', isSecurityRelated: true }),
          makeSkill({ skillName: 'Microsoft Excel', isSecurityRelated: false, level: 'INTERMEDIATE' }),
        ],
        totalSkills: 2,
      })
    );
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /extraire avec ai/i }));

    const dialog = await screen.findByRole('dialog');
    // Onglet Sécurité actif par défaut : seule la compétence sécurité est visible.
    expect(within(dialog).getByText('Contrôle d\'accès')).toBeInTheDocument();
    expect(within(dialog).queryByText('Microsoft Excel')).not.toBeInTheDocument();

    // Bascule vers l'onglet "Autre".
    await userEvent.click(within(dialog).getByRole('tab', { name: /autre compétance/i }));
    expect(within(dialog).getByText('Microsoft Excel')).toBeInTheDocument();
    expect(within(dialog).queryByText('Contrôle d\'accès')).not.toBeInTheDocument();
  });

  it('sauvegarde les compétences, ferme le dialogue et notifie onSkillsUpdated', async () => {
    svc.extractSkills.mockResolvedValue(makeResult());
    svc.saveSkills.mockResolvedValue({ success: true });
    const onSkillsUpdated = vi.fn();
    renderPanel({ onSkillsUpdated });

    await userEvent.click(screen.getByRole('button', { name: /extraire avec ai/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(
      within(dialog).getByRole('button', { name: /sauvegarder les compétences/i })
    );

    await waitFor(() =>
      expect(svc.saveSkills).toHaveBeenCalledWith(
        'cand-1',
        [{ name: 'Patrouille de sécurité', level: 'ADVANCED', yearsExperience: 5 }],
        'tok-123'
      )
    );
    await waitFor(() => expect(onSkillsUpdated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('affiche une alerte d\'onglet vide quand aucune compétence sécurité n\'est trouvée', async () => {
    svc.extractSkills.mockResolvedValue(
      makeResult({
        skillsFound: [makeSkill({ skillName: 'Microsoft Excel', isSecurityRelated: false })],
        totalSkills: 1,
      })
    );
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /extraire avec ai/i }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText(/aucune compétence liée à la sécurité/i)
    ).toBeInTheDocument();
  });

  it('ferme le dialogue via le bouton Fermer sans sauvegarder', async () => {
    svc.extractSkills.mockResolvedValue(makeResult());
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /extraire avec ai/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: /^fermer$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(svc.saveSkills).not.toHaveBeenCalled();
  });
});
