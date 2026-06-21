import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { Routes, Route } from 'react-router-dom';
import UniformSignPage from './UniformSignPage';
import { publicUniformService } from '@/services/public-uniform.service';
import type { SignPayload } from '@/types/uniform';

// La page lit le service public via TanStack Query → on mocke le service.
vi.mock('@/services/public-uniform.service', () => ({
  publicUniformService: {
    getSignPayload: vi.fn(),
    submitSignature: vi.fn(),
  },
}));

// SignaturePad embarque react-signature-canvas (lib canvas) → mock léger qui
// expose un bouton pour simuler une signature sans toucher au DOM canvas.
vi.mock('../uniformes/components/SignaturePad', () => ({
  default: ({ label, onChange }: { label?: string; onChange: (v: string | null) => void }) => (
    <button type="button" onClick={() => onChange('data:image/png;base64,SIG')}>
      {label ?? 'Signer ici'}
    </button>
  ),
}));

const getSignPayload = vi.mocked(publicUniformService.getSignPayload);
const submitSignature = vi.mocked(publicUniformService.submitSignature);

function makePayload(overrides: Partial<SignPayload> = {}): SignPayload {
  return {
    kind: 'pret',
    alreadySigned: false,
    employeeFirstName: 'Jean',
    division: null,
    lines: [
      { name: 'Chemise', size: 'M', quantity: 2, unitCost: 25, lineTotal: 50 },
      { name: 'Pantalon', size: '32', quantity: 1, unitCost: 40, lineTotal: 40 },
    ],
    total: 90,
    consents: { payroll: 'Texte prélèvement', policy: null, fit: 'Je confirme que la taille me convient.' },
    ...overrides,
  };
}

// Rend la page au sein d'une route /sign/:token pour que useParams capte le token.
function renderAt(token = 'tok-123') {
  return renderWithProviders(
    <Routes>
      <Route path="/sign/:token" element={<UniformSignPage />} />
    </Routes>,
    { route: `/sign/${token}` }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UniformSignPage', () => {
  it('affiche un indicateur de chargement avant la réponse du service', () => {
    getSignPayload.mockReturnValue(new Promise(() => {}));
    renderAt();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('rend le formulaire de prêt avec les lignes et le total une fois chargé', async () => {
    getSignPayload.mockResolvedValue({ data: makePayload() });
    renderAt();

    expect(await screen.findByRole('heading', { name: /xguard sécurité/i })).toBeInTheDocument();
    expect(screen.getByText(/formulaire de prêt d'uniforme/i)).toBeInTheDocument();
    expect(screen.getByText(/bonjour jean/i)).toBeInTheDocument();
    expect(screen.getByText('Chemise')).toBeInTheDocument();
    expect(screen.getByText('Pantalon')).toBeInTheDocument();
    expect(screen.getByText(/coût total du prêt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signer et envoyer/i })).toBeDisabled();
  });

  it('affiche un message d\'expiration sur erreur 410', async () => {
    getSignPayload.mockRejectedValue({ response: { status: 410 } });
    renderAt();

    expect(await screen.findByText(/ce lien de signature a expiré/i)).toBeInTheDocument();
  });

  it('affiche un message de lien invalide sur autre erreur', async () => {
    getSignPayload.mockRejectedValue({ response: { status: 404 } });
    renderAt();

    expect(await screen.findByText(/lien de signature invalide/i)).toBeInTheDocument();
  });

  it('indique que le formulaire a déjà été signé', async () => {
    getSignPayload.mockResolvedValue({ data: makePayload({ alreadySigned: true }) });
    renderAt();

    expect(await screen.findByText(/ce formulaire a déjà été signé/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /signer et envoyer/i })).not.toBeInTheDocument();
  });

  it('active puis soumet la signature, et affiche le remerciement', async () => {
    const user = userEvent.setup();
    getSignPayload.mockResolvedValue({ data: makePayload() });
    submitSignature.mockResolvedValue({ message: 'ok', pdfUrl: 'https://x/pdf' });
    renderAt('tok-xyz');

    const submitBtn = await screen.findByRole('button', { name: /signer et envoyer/i });
    expect(submitBtn).toBeDisabled();

    // Remplit nom + signature + consentements requis (prêt: payroll & fit).
    await user.type(screen.getByLabelText(/votre nom complet/i), 'Jean Tremblay');
    await user.click(screen.getByRole('button', { name: /votre signature/i }));
    await user.click(screen.getByRole('checkbox', { name: /prélèvement sur ma dernière paie/i }));
    await user.click(screen.getByRole('checkbox', { name: /la taille me convient/i }));

    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    expect(await screen.findByText(/votre signature a été enregistrée/i)).toBeInTheDocument();
    expect(submitSignature).toHaveBeenCalledWith('tok-xyz', expect.objectContaining({
      signedByName: 'Jean Tremblay',
      signatureBase64: 'data:image/png;base64,SIG',
    }));
  });
});
