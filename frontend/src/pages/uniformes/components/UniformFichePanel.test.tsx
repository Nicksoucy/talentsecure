import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

// --- Mocks des enfants lourds / dialogues (canvas de signature, scan, etc.) ---
// Le SignaturePad utilise un <canvas> (intestable en jsdom) → faux composant inerte.
vi.mock('./SignaturePad', () => ({ default: () => null }));
vi.mock('./IssuanceLinesEditor', () => ({ default: () => null }));
vi.mock('./MobileIssuanceSheet', () => ({ default: () => null }));
vi.mock('./SendIssuanceDialog', () => ({ default: () => null }));

// --- Mock du service réseau ---
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    getFiche: vi.fn(),
    createSettlement: vi.fn(),
    closeTermination: vi.fn(),
    sendIssuanceSms: vi.fn(),
    counterSignIssuance: vi.fn(),
    uploadIssuancePdf: vi.fn(),
    issuancePdfUrl: vi.fn(),
    returnPdfUrl: vi.fn(),
  },
}));

import UniformFichePanel from './UniformFichePanel';
import { uniformService } from '@/services/uniform.service';

const svc = uniformService as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** Fixe le rôle courant pour piloter usePerms (canWriteUniforms). */
function setRole(role: User['role'] | undefined) {
  useAuthStore.setState({
    user: role ? ({ id: 'u1', role } as User) : null,
    isAuthenticated: !!role,
  });
}

/** Fiche réaliste : 1 détention, un montant dû, une remise ISSUED, un retour. */
const makeFiche = () => ({
  data: {
    employee: { id: 'emp-1', firstName: 'Jean', lastName: 'Tremblay' },
    holdings: [
      { variantId: 'v1', itemName: 'Chemise grise', size: 'L', quantity: 2, replacementCost: 30 },
    ],
    owed: { owed: 45, charged: 60, settled: 15 },
    issuances: [
      {
        id: 'iss-1',
        status: 'ISSUED',
        division: 'SECURITE',
        issuedAt: '2026-01-10T12:00:00Z',
        createdAt: '2026-01-10T12:00:00Z',
        totalLoanCost: 60,
        signatureStatus: 'SIGNED',
        employerSignatureStoragePath: 'sig.png',
        lines: [
          { id: 'l1', quantity: 2, variant: { item: { name: 'Chemise grise' }, size: 'L' } },
          { id: 'l2', quantity: 1, variant: { item: { name: 'Ceinture' }, size: 'Unique' } },
        ],
      },
    ],
    returns: [
      { id: 'ret-1', status: 'RETURNED', returnedAt: '2026-02-01T12:00:00Z', createdAt: '2026-02-01T12:00:00Z' },
    ],
    settlements: [],
  },
});

describe('UniformFichePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRole('ADMIN');
    svc.getFiche.mockResolvedValue(makeFiche());
  });

  it('affiche un état de chargement tant que la fiche n\'est pas arrivée', () => {
    // Promesse qui ne résout pas → reste en isLoading.
    svc.getFiche.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<UniformFichePanel employeeId="emp-1" />);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
  });

  it('affiche un message quand aucune donnée n\'est retournée', async () => {
    svc.getFiche.mockResolvedValue({ data: null });
    renderWithProviders(<UniformFichePanel employeeId="emp-1" />);
    expect(await screen.findByText('Aucune donnée uniforme.')).toBeInTheDocument();
  });

  it('rend les chips de synthèse et le résumé des pièces de la remise', async () => {
    renderWithProviders(<UniformFichePanel employeeId="emp-1" />);

    // Total détenu (2) + montant dû formaté + ligne facturé/réglé.
    expect(await screen.findByText('Pièces détenues : 2')).toBeInTheDocument();
    expect(screen.getByText('Montant dû : $ 45.00')).toBeInTheDocument();
    expect(screen.getByText('Facturé : $ 60.00 • Réglé : $ 15.00')).toBeInTheDocument();

    // summarizeLines : taille « Unique » omise, sinon affichée.
    expect(screen.getByText('2× Chemise grise L • 1× Ceinture')).toBeInTheDocument();
    expect(screen.getByText('Détentions actuelles')).toBeInTheDocument();
    expect(svc.getFiche).toHaveBeenCalledWith('emp-1');
  });

  it('masque les actions d\'écriture pour un rôle lecture seule (MAGASIN)', async () => {
    setRole('MAGASIN');
    renderWithProviders(<UniformFichePanel employeeId="emp-1" />);

    await screen.findByText('Détentions actuelles');
    expect(screen.queryByRole('button', { name: 'Remettre des uniformes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer un règlement' })).not.toBeInTheDocument();
    // Le bouton PDF (lecture) reste disponible.
    expect(screen.getAllByRole('button', { name: 'PDF' }).length).toBeGreaterThan(0);
  });

  it('ouvre le dialogue de règlement et enregistre via le service', async () => {
    const user = userEvent.setup();
    svc.createSettlement.mockResolvedValue({});
    renderWithProviders(<UniformFichePanel employeeId="emp-9" />);

    await user.click(await screen.findByRole('button', { name: 'Enregistrer un règlement' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Montant ($)'), '25');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(svc.createSettlement).toHaveBeenCalledTimes(1));
    expect(svc.createSettlement).toHaveBeenCalledWith(
      'emp-9',
      expect.objectContaining({ amount: 25, method: 'RETENUE PAIE' })
    );
  });

  it('ouvre le PDF d\'une remise via le service au clic sur « PDF »', async () => {
    const user = userEvent.setup();
    svc.issuancePdfUrl.mockResolvedValue({ data: { url: 'https://r2/iss.pdf' } });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithProviders(<UniformFichePanel employeeId="emp-1" />);

    const pdfButtons = await screen.findAllByRole('button', { name: 'PDF' });
    await user.click(pdfButtons[0]);

    await waitFor(() => expect(svc.issuancePdfUrl).toHaveBeenCalledWith('iss-1'));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://r2/iss.pdf', '_blank'));
    openSpy.mockRestore();
  });
});
