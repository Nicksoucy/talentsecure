import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import type { ProspectCandidate } from '@/types';
import type { ProspectsDialogsProps } from './ProspectsDialogs';

// Enfants lourds (réseau / preview de fichiers / lecteur vidéo) mockés : on teste
// l'assemblage des dialogues, pas leur contenu interne.
vi.mock('@/components/CVPreview', () => ({ default: () => <div data-testid="cv-preview" /> }));
vi.mock('@/components/video/ProspectVideoPlayer', () => ({
  default: () => <div data-testid="video-player" />,
}));
vi.mock('@/components/ContactConflictDialog', () => ({
  default: ({ conflict }: { conflict: unknown }) =>
    conflict ? <div data-testid="conflict-dialog" /> : null,
}));

import ProspectsDialogs from './ProspectsDialogs';

const makeProspect = (overrides: Partial<ProspectCandidate> = {}): ProspectCandidate =>
  ({
    id: 'p-1',
    firstName: 'Jean',
    lastName: 'Tremblay',
    phone: '514-555-0100',
    isContacted: false,
    isConverted: false,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ProspectCandidate);

// Toutes les props sont fournies, tous les dialogues fermés par défaut. Chaque
// test ouvre seulement le(s) dialogue(s) qu'il vérifie.
const baseProps = (): ProspectsDialogsProps => ({
  contactDialog: { open: false, prospect: null },
  setContactDialog: vi.fn(),
  contactNotes: '',
  setContactNotes: vi.fn(),
  onConfirmContact: vi.fn(),
  contactPending: false,
  cvPreviewDialog: { open: false, cvUrl: null, prospectName: '' },
  setCvPreviewDialog: vi.fn(),
  videoPreviewDialog: { open: false, prospectId: null, prospectName: '' },
  setVideoPreviewDialog: vi.fn(),
  addProspectOpen: false,
  setAddProspectOpen: vi.fn(),
  prospectForm: { firstName: '', lastName: '', email: '', phone: '', city: '', streetAddress: '' },
  setProspectForm: vi.fn(),
  onCreateProspect: vi.fn(),
  createPending: false,
  contactConflict: null,
  setContactConflict: vi.fn(),
  assignClientDialogOpen: false,
  setAssignClientDialogOpen: vi.fn(),
  assignClientId: '',
  setAssignClientId: vi.fn(),
  clients: [],
  onAssignToClient: vi.fn(),
  assignPending: false,
  selectedCount: 0,
});

describe('ProspectsDialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('n\'affiche aucun dialogue quand tous sont fermés', () => {
    renderWithProviders(<ProspectsDialogs {...baseProps()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument();
  });

  it('dialogue de contact : affiche le nom du prospect et confirme via onConfirmContact', async () => {
    const props = {
      ...baseProps(),
      contactDialog: { open: true, prospect: makeProspect({ firstName: 'Marie', lastName: 'Dubois' }) },
    };
    renderWithProviders(<ProspectsDialogs {...props} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Marquer comme contacté')).toBeInTheDocument();
    expect(within(dialog).getByText('Marie Dubois')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
    expect(props.onConfirmContact).toHaveBeenCalledTimes(1);
  });

  it('dialogue de contact : "Annuler" ferme via setContactDialog', async () => {
    const props = {
      ...baseProps(),
      contactDialog: { open: true, prospect: makeProspect() },
    };
    renderWithProviders(<ProspectsDialogs {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(props.setContactDialog).toHaveBeenCalledWith({ open: false, prospect: null });
    expect(props.onConfirmContact).not.toHaveBeenCalled();
  });

  it('dialogue de contact : "Confirmer" est désactivé pendant le chargement', () => {
    const props = {
      ...baseProps(),
      contactDialog: { open: true, prospect: makeProspect() },
      contactPending: true,
    };
    renderWithProviders(<ProspectsDialogs {...props} />);

    expect(screen.getByRole('button', { name: 'En cours...' })).toBeDisabled();
  });

  it('aperçu CV : affiche le titre + CVPreview et télécharge l\'URL au clic', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const props = {
      ...baseProps(),
      cvPreviewDialog: { open: true, cvUrl: 'https://files.test/cv.pdf', prospectName: 'Marie Dubois' },
    };
    renderWithProviders(<ProspectsDialogs {...props} />);

    expect(screen.getByText('CV - Marie Dubois')).toBeInTheDocument();
    expect(screen.getByTestId('cv-preview')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    expect(openSpy).toHaveBeenCalledWith('https://files.test/cv.pdf', '_blank');
    openSpy.mockRestore();
  });

  it('ajout de prospect : "Créer" est désactivé sans prénom/téléphone, actif sinon', async () => {
    // 1) Formulaire incomplet → bouton désactivé.
    const incomplete = { ...baseProps(), addProspectOpen: true };
    const { unmount } = renderWithProviders(<ProspectsDialogs {...incomplete} />);
    expect(screen.getByText('Ajouter un candidat potentiel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled();
    unmount();

    // 2) Prénom + téléphone renseignés → bouton actif et déclenche onCreateProspect.
    const complete = {
      ...baseProps(),
      addProspectOpen: true,
      prospectForm: { firstName: 'Marie', lastName: '', email: '', phone: '514-555-0199', city: '', streetAddress: '' },
    };
    renderWithProviders(<ProspectsDialogs {...complete} />);
    const createBtn = screen.getByRole('button', { name: 'Créer' });
    expect(createBtn).toBeEnabled();
    await userEvent.click(createBtn);
    expect(complete.onCreateProspect).toHaveBeenCalledTimes(1);
  });

  it('transfert vers client : liste les clients et désactive "Transférer" sans sélection', () => {
    const props = {
      ...baseProps(),
      assignClientDialogOpen: true,
      selectedCount: 3,
      clients: [{ id: 'c-1', name: 'Acme', companyName: 'Acme Inc' }],
    };
    renderWithProviders(<ProspectsDialogs {...props} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Transférer vers un client')).toBeInTheDocument();
    // Pluriel : 3 prospects sélectionnés.
    expect(within(dialog).getByText(/3/)).toBeInTheDocument();
    // assignClientId vide → bouton de transfert désactivé.
    expect(within(dialog).getByRole('button', { name: 'Transférer' })).toBeDisabled();
  });

  it('affiche le dialogue de conflit de contact quand contactConflict est fourni', () => {
    const props = {
      ...baseProps(),
      contactConflict: { section: 'candidate' as const, id: 'c-9', firstName: 'Jean', lastName: 'Tremblay' },
    };
    renderWithProviders(<ProspectsDialogs {...props} />);

    expect(screen.getByTestId('conflict-dialog')).toBeInTheDocument();
  });
});
