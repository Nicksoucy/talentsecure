import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// Le service réseau est mocké : on contrôle finement la séquence d'envoi.
vi.mock('../sendDraftIssuance', () => ({
  sendDraftIssuance: vi.fn(),
}));

// notistack : on capture les snackbars sans dépendre du rendu du provider.
const enqueueSnackbar = vi.fn();
vi.mock('notistack', async () => {
  const actual = await vi.importActual<typeof import('notistack')>('notistack');
  return { ...actual, useSnackbar: () => ({ enqueueSnackbar, closeSnackbar: vi.fn() }) };
});

// SignaturePad embarque un canvas (react-signature-canvas) : on le remplace par
// un faux léger exposant un bouton pour simuler la pose d'une signature.
vi.mock('./SignaturePad', () => ({
  default: ({ label, onChange }: { label?: string; onChange: (v: string | null) => void }) => (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => onChange('data:image/png;base64,SIG')}>
        fake-sign
      </button>
      <button type="button" onClick={() => onChange(null)}>
        fake-clear
      </button>
    </div>
  ),
}));

import SendIssuanceDialog from './SendIssuanceDialog';
import { sendDraftIssuance, type SendDraftResult } from '../sendDraftIssuance';

const send = sendDraftIssuance as unknown as ReturnType<typeof vi.fn>;

const okResult = (overrides: Partial<SendDraftResult> = {}): SendDraftResult => ({
  finalized: true,
  employerSigned: false,
  smsSent: true,
  ...overrides,
});

describe('SendIssuanceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'affiche pas le contenu du dialogue quand open=false", () => {
    renderWithProviders(
      <SendIssuanceDialog open={false} onClose={vi.fn()} issuanceId="iss-1" />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Envoyer la remise')).not.toBeInTheDocument();
  });

  it("affiche le titre, l'alerte d'info et le pavé de signature quand ouvert", () => {
    renderWithProviders(
      <SendIssuanceDialog open onClose={vi.fn()} issuanceId="iss-1" />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Envoyer la remise')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Le stock sera décrémenté et un SMS de signature sera envoyé/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Signature de l'employeur (XGuard)")).toBeInTheDocument();
    // « Signer et envoyer » est désactivé tant qu'aucune signature n'est posée.
    expect(screen.getByRole('button', { name: 'Signer et envoyer' })).toBeDisabled();
  });

  it('appelle onClose au clic sur Annuler sans déclencher d\'envoi', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <SendIssuanceDialog open onClose={onClose} issuanceId="iss-1" />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('envoie sans signature, notifie le succès puis appelle onSent et onClose', async () => {
    send.mockResolvedValue(okResult());
    const onClose = vi.fn();
    const onSent = vi.fn();

    renderWithProviders(
      <SendIssuanceDialog open onClose={onClose} issuanceId="iss-42" onSent={onSent} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer sans signer' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    // Pas de signature → second argument undefined.
    expect(send).toHaveBeenCalledWith('iss-42', undefined);

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(enqueueSnackbar).toHaveBeenCalledWith(
      "Remise envoyée — SMS de signature envoyé à l'agent",
      { variant: 'success' },
    );
  });

  it('active « Signer et envoyer » après une signature et transmet la signature au service', async () => {
    send.mockResolvedValue(okResult({ employerSigned: true }));
    const onClose = vi.fn();

    renderWithProviders(
      <SendIssuanceDialog open onClose={onClose} issuanceId="iss-7" />
    );

    const signButton = screen.getByRole('button', { name: 'Signer et envoyer' });
    expect(signButton).toBeDisabled();

    // Simule la pose d'une signature via le faux SignaturePad.
    await userEvent.click(screen.getByRole('button', { name: 'fake-sign' }));
    expect(signButton).toBeEnabled();

    await userEvent.click(signButton);

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith('iss-7', 'data:image/png;base64,SIG');

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        "Remise envoyée et signée côté employeur — SMS envoyé à l'agent",
        { variant: 'success' },
      ),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('avertit (warning) quand le SMS échoue et inclut le message d\'erreur', async () => {
    send.mockResolvedValue(okResult({ smsSent: false, smsError: 'Numéro invalide' }));
    const onClose = vi.fn();

    renderWithProviders(
      <SendIssuanceDialog open onClose={onClose} issuanceId="iss-9" />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer sans signer' }));

    await waitFor(() => expect(enqueueSnackbar).toHaveBeenCalledTimes(1));
    const [message, opts] = enqueueSnackbar.mock.calls[0];
    expect(message).toContain("l'envoi du SMS a échoué");
    expect(message).toContain('Numéro invalide');
    expect(opts).toMatchObject({ variant: 'warning' });
    // La remise étant finalisée, on referme malgré l'avertissement.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("affiche une snackbar d'erreur si l'envoi échoue (mutation en erreur)", async () => {
    send.mockRejectedValue({ response: { data: { error: 'Stock insuffisant' } } });
    const onClose = vi.fn();
    const onSent = vi.fn();

    renderWithProviders(
      <SendIssuanceDialog open onClose={onClose} issuanceId="iss-3" onSent={onSent} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer sans signer' }));

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith('Stock insuffisant', { variant: 'error' }),
    );
    // Échec → on ne notifie pas le parent et on ne ferme pas.
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
