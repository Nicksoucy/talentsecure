import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/prospect.service', () => ({
  prospectService: { getProspectExtractionHistory: vi.fn() },
}));

import ExtractionHistoryDialog from './ExtractionHistoryDialog';
import { prospectService } from '@/services/prospect.service';

type HistoryResult = Awaited<
  ReturnType<typeof prospectService.getProspectExtractionHistory>
>;
type Log = HistoryResult['logs'][number];

const svc = prospectService as unknown as {
  getProspectExtractionHistory: ReturnType<typeof vi.fn>;
};

const makeLog = (overrides: Partial<Log> = {}): Log => ({
  id: 'log-1',
  date: '2026-06-19T14:30:00.000Z',
  method: 'AI_EXTRACTION',
  model: 'gpt-4o',
  skillsFound: 5,
  processingTimeMs: 2500,
  promptTokens: 1200,
  completionTokens: 300,
  totalCost: 0.0123,
  success: true,
  errorMessage: null,
  ...overrides,
});

const makeHistory = (overrides: Partial<HistoryResult> = {}): HistoryResult => ({
  prospect: { id: 'pros-1', name: 'Jean Tremblay' },
  currentSkillsCount: 8,
  logs: [makeLog()],
  ...overrides,
});

describe('ExtractionHistoryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'appelle pas le service et ne monte pas le contenu quand open=false", () => {
    renderWithProviders(
      <ExtractionHistoryDialog open={false} onClose={vi.fn()} prospectId="pros-1" />
    );

    // useQuery est `enabled: open` → aucun appel réseau quand fermé.
    expect(svc.getProspectExtractionHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText("Historique d'Extraction")).not.toBeInTheDocument();
  });

  it("affiche un indicateur de chargement et le nom de prospect fourni en props pendant la requête", () => {
    // Promesse jamais résolue → état de chargement persistant.
    svc.getProspectExtractionHistory.mockReturnValue(new Promise(() => {}));

    renderWithProviders(
      <ExtractionHistoryDialog
        open
        onClose={vi.fn()}
        prospectId="pros-1"
        prospectName="Marie Lavoie"
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText("Historique d'Extraction")).toBeInTheDocument();
    // prospectName fourni → affiché immédiatement sans attendre les données.
    expect(within(dialog).getByText('Marie Lavoie')).toBeInTheDocument();
    expect(within(dialog).getByRole('progressbar')).toBeInTheDocument();
  });

  it("affiche une alerte d'erreur quand le service échoue", async () => {
    svc.getProspectExtractionHistory.mockRejectedValue(new Error('boom'));

    renderWithProviders(
      <ExtractionHistoryDialog open onClose={vi.fn()} prospectId="pros-1" />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('MuiAlert-standardError');
    expect(within(alert).getByText("Erreur lors du chargement de l'historique")).toBeInTheDocument();
  });

  it("affiche un message d'info quand aucune extraction n'a été effectuée", async () => {
    svc.getProspectExtractionHistory.mockResolvedValue(
      makeHistory({ currentSkillsCount: 0, logs: [] })
    );

    renderWithProviders(
      <ExtractionHistoryDialog open onClose={vi.fn()} prospectId="pros-1" />
    );

    expect(
      await screen.findByText("Aucune extraction n'a encore été effectuée pour ce prospect")
    ).toBeInTheDocument();
    // Le compteur de compétences actuelles reste affiché.
    expect(screen.getByText('Compétences actuelles')).toBeInTheDocument();
  });

  it("rend la timeline : nom de prospect issu des données, compteur, log de succès avec ses chips", async () => {
    svc.getProspectExtractionHistory.mockResolvedValue(
      makeHistory({
        prospect: { id: 'pros-1', name: 'Paul Gagnon' },
        currentSkillsCount: 12,
        logs: [makeLog({ skillsFound: 3, totalCost: 0.005, processingTimeMs: 1800 })],
      })
    );

    // Pas de prospectName en props → le composant utilise data.prospect.name.
    renderWithProviders(
      <ExtractionHistoryDialog open onClose={vi.fn()} prospectId="pros-1" />
    );

    expect(await screen.findByText('Paul Gagnon')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    // Méthode + modèle.
    expect(screen.getByText(/AI_EXTRACTION/)).toBeInTheDocument();
    // Pluriel "compétences extraites" (skillsFound > 1).
    expect(screen.getByText(/3 compétences extraites/)).toBeInTheDocument();
    // Chips formatés à partir des métriques.
    expect(screen.getByText('Coût: $0.0050')).toBeInTheDocument();
    expect(screen.getByText('Durée: 1.8s')).toBeInTheDocument();
    expect(screen.getByText('Tokens: 1500')).toBeInTheDocument();
  });

  it("affiche le message d'erreur pour un log en échec et appelle onClose au clic sur Fermer", async () => {
    const onClose = vi.fn();
    svc.getProspectExtractionHistory.mockResolvedValue(
      makeHistory({
        logs: [
          makeLog({
            id: 'log-fail',
            success: false,
            errorMessage: 'Quota API dépassé',
          }),
        ],
      })
    );

    renderWithProviders(
      <ExtractionHistoryDialog open onClose={onClose} prospectId="pros-1" />
    );

    expect(await screen.findByText(/Quota API dépassé/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
