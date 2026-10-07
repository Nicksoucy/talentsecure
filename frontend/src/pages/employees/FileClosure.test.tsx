import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import { employeeService, type ClosureOverview, type ClosureNotice } from '@/services/employee.service';
import FileClosureDialog from './FileClosureDialog';
import FileClosureCard from './FileClosureCard';

vi.mock('@/services/employee.service', () => ({
  employeeService: {
    previewClosure: vi.fn(),
    sendClosure: vi.fn(),
    resendClosure: vi.fn(),
    closeSilently: vi.fn(),
  },
}));

const previewClosure = vi.mocked(employeeService.previewClosure);
const sendClosure = vi.mocked(employeeService.sendClosure);
const resendClosure = vi.mocked(employeeService.resendClosure);
const closeSilently = vi.mocked(employeeService.closeSilently);
const noPieces = { pieces: [], totalPieces: 0, total: 0, issuancesWithoutLines: 0 };

function makeOverview(overrides: Partial<ClosureOverview> = {}): ClosureOverview {
  return {
    employee: { id: 'emp-1', firstName: 'Jean', lastName: 'Tremblay', email: 'jean@example.com', phone: '5145550000', status: 'ACTIF' },
    defaults: {
      deadline: '2026-10-14',
      reasonTexts: { INACTIVITE: 'Texte inactivité', DEMISSION: 'Texte démission', FIN_EMPLOI: 'Texte fin' },
      reasonLabels: { INACTIVITE: 'Inactivité', DEMISSION: 'Démission', FIN_EMPLOI: "Fin d'emploi" },
      cc: ['paie@xguard.ca', 'rh@xguard.ca'],
      subject: 'Fermeture de votre dossier XGuard',
    },
    estimate: {
      pieces: [{ itemName: 'Chemise', size: 'M', quantity: 3, unitCost: 35, lineTotal: 105 }],
      totalPieces: 3,
      total: 105,
      issuancesWithoutLines: 0,
    },
    notices: [],
    tracking: null,
    ...overrides,
  };
}

function makeNotice(overrides: Partial<ClosureNotice> = {}): ClosureNotice {
  return {
    id: 'n-1',
    sentAt: '2026-09-30T14:00:00.000Z',
    sentByName: 'Tamara Hadid',
    reason: 'INACTIVITE',
    returnDeadlineAt: '2026-10-15T03:59:59.999Z',
    emailTo: 'jean@example.com',
    emailCc: ['paie@xguard.ca', 'rh@xguard.ca'],
    emailStatus: 'SENT',
    emailError: null,
    smsTo: '5145550000',
    smsStatus: 'SENT',
    smsError: null,
    estimatedAmount: 105,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().setAuth(makeUser({ role: 'ADMIN' }), 'tok', 'refresh');
});
afterEach(() => resetStores());

describe('FileClosureDialog', () => {
  it('pré-remplit motif, date +14 j, pièces et montant ; le motif change le paragraphe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FileClosureDialog open onClose={vi.fn()} overview={makeOverview()} />);

    expect(screen.getByLabelText(/date limite de retour/i)).toHaveValue('2026-10-14');
    expect(screen.getByLabelText(/paragraphe d’ouverture/i)).toHaveValue('Texte inactivité');
    expect(screen.getByText('Chemise')).toBeInTheDocument();
    expect(screen.getAllByText('105,00 $').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/envoyer aussi un texto/i)).toBeChecked();

    await user.click(screen.getByLabelText('Motif'));
    await user.click(await screen.findByRole('option', { name: 'Démission' }));
    expect(screen.getByLabelText(/paragraphe d’ouverture/i)).toHaveValue('Texte démission');
  });

  it('avertit quand il n’y a pas de courriel ou des remises sans pièces', () => {
    const base = makeOverview();
    renderWithProviders(
      <FileClosureDialog
        open
        onClose={vi.fn()}
        overview={makeOverview({
          employee: { ...base.employee, email: null },
          estimate: { ...base.estimate, issuancesWithoutLines: 2 },
        })}
      />,
    );
    expect(screen.getByText(/aucun courriel au dossier/i)).toBeInTheDocument();
    expect(screen.getByText(/2 remise\(s\) sans pièces/i)).toBeInTheDocument();
  });

  it('aperçu (À + CC + texto) puis envoi → ferme la fenêtre', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    previewClosure.mockResolvedValue({
      subject: 'Fermeture de votre dossier XGuard',
      to: 'jean@example.com',
      cc: ['paie@xguard.ca', 'rh@xguard.ca'],
      html: '<p>lettre</p>',
      sms: 'Sécurité XGuard : texto',
      estimate: makeOverview().estimate,
    });
    sendClosure.mockResolvedValue(makeNotice());
    renderWithProviders(<FileClosureDialog open onClose={onClose} overview={makeOverview()} />);

    await user.click(screen.getByRole('button', { name: /voir l’aperçu/i }));
    expect(await screen.findByText(/paie@xguard\.ca, rh@xguard\.ca/)).toBeInTheDocument();
    expect(screen.getByText(/Sécurité XGuard : texto/)).toBeInTheDocument();
    expect(previewClosure).toHaveBeenCalledWith('emp-1', {
      reason: 'INACTIVITE', reasonText: 'Texte inactivité', deadline: '2026-10-14', sendSms: true,
    });

    await user.click(screen.getByRole('button', { name: /envoyer et fermer le dossier/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sendClosure).toHaveBeenCalledWith('emp-1', expect.objectContaining({ deadline: '2026-10-14' }));
  });

  it('erreur d’aperçu : message du serveur affiché, reste à l’étape 1', async () => {
    const user = userEvent.setup();
    previewClosure.mockRejectedValue({ response: { data: { message: 'La date limite ne peut pas être dans le passé' } } });
    renderWithProviders(<FileClosureDialog open onClose={vi.fn()} overview={makeOverview()} />);
    await user.click(screen.getByRole('button', { name: /voir l’aperçu/i }));
    expect(await screen.findByText(/ne peut pas être dans le passé/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date limite de retour/i)).toBeInTheDocument();
  });

  describe('fermer sans rien envoyer', () => {
    it('sans uniforme : choisi par défaut, rien sur la lettre, ferme directement avec le motif', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      closeSilently.mockResolvedValue({ becameInactive: true, piecesHeld: 0 });
      renderWithProviders(<FileClosureDialog open onClose={onClose} overview={makeOverview({ estimate: noPieces })} />);

      expect(screen.getByLabelText(/fermer sans rien envoyer/i)).toBeChecked();
      expect(screen.queryByLabelText(/paragraphe d’ouverture/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/date limite de retour/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/envoyer aussi un texto/i)).not.toBeInTheDocument();
      expect(screen.getByText(/aucun courriel ni texto ne sera envoyé/i)).toBeInTheDocument();

      await user.click(screen.getByLabelText('Motif'));
      await user.click(await screen.findByRole('option', { name: 'Démission' }));
      await user.click(screen.getByRole('button', { name: /fermer le dossier sans envoi/i }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(closeSilently).toHaveBeenCalledWith('emp-1', { reason: 'DEMISSION' });
      expect(previewClosure).not.toHaveBeenCalled();
      expect(sendClosure).not.toHaveBeenCalled();
    });

    it('avec uniformes : la lettre reste le choix par défaut ; sans envoi → avertissement paie + date limite envoyée', async () => {
      const user = userEvent.setup();
      closeSilently.mockResolvedValue({ becameInactive: true, piecesHeld: 3 });
      renderWithProviders(<FileClosureDialog open onClose={vi.fn()} overview={makeOverview()} />);

      expect(screen.getByLabelText(/envoyer une lettre/i)).toBeChecked();
      await user.click(screen.getByLabelText(/fermer sans rien envoyer/i));
      expect(screen.getByText(/la paie recevra le montant à retenir/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date limite de retour/i)).toHaveValue('2026-10-14');

      await user.click(screen.getByRole('button', { name: /fermer le dossier sans envoi/i }));
      await waitFor(() =>
        expect(closeSilently).toHaveBeenCalledWith('emp-1', { reason: 'INACTIVITE', deadline: '2026-10-14' }),
      );
    });
  });
});

describe('FileClosureCard', () => {
  it('rien à afficher sans avis', () => {
    const { container } = renderWithProviders(<FileClosureCard overview={makeOverview()} canWrite />);
    expect(container).toBeEmptyDOMElement();
  });

  it('en attente : jours restants, courriel + CC + texto', () => {
    renderWithProviders(
      <FileClosureCard
        overview={makeOverview({ notices: [makeNotice()], tracking: { status: 'EN_ATTENTE', daysLeft: 9, owed: 0 } })}
        canWrite
      />,
    );
    expect(screen.getByText(/9 jour\(s\) restant\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Courriel envoyé · jean@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/CC paie@xguard.ca, rh@xguard.ca/)).toBeInTheDocument();
    expect(screen.getByText(/Texto envoyé/)).toBeInTheDocument();
  });

  it('transmis à la paie : montant affiché', () => {
    renderWithProviders(
      <FileClosureCard
        overview={makeOverview({ notices: [makeNotice()], tracking: { status: 'TRANSMIS_PAIE', daysLeft: null, owed: 105 } })}
        canWrite
      />,
    );
    expect(screen.getByText('Transmis à la paie — 105,00 $')).toBeInTheDocument();
  });

  it('échec du courriel : erreur visible + « Renvoyer »', async () => {
    const user = userEvent.setup();
    resendClosure.mockResolvedValue(makeNotice());
    renderWithProviders(
      <FileClosureCard
        overview={makeOverview({
          notices: [makeNotice({ emailStatus: 'FAILED', emailError: 'GHL email échoué : quota' })],
          tracking: { status: 'EN_ATTENTE', daysLeft: 14, owed: 0 },
        })}
        canWrite
      />,
    );
    expect(screen.getByText(/quota/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Renvoyer' }));
    await waitFor(() => expect(resendClosure).toHaveBeenCalledWith('emp-1', 'n-1'));
  });
});
