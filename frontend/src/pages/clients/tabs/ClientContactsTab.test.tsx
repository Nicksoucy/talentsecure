import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// Snackbar : on neutralise notistack pour éviter tout effet de bord visuel.
const enqueueSnackbar = vi.fn();
vi.mock('notistack', async () => {
  const actual = await vi.importActual<typeof import('notistack')>('notistack');
  return { ...actual, useSnackbar: () => ({ enqueueSnackbar, closeSnackbar: vi.fn() }) };
});

vi.mock('@/services/client-crm.service', () => ({
  clientCrmService: {
    getContacts: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
  },
}));

import ClientContactsTab from './ClientContactsTab';
import { clientCrmService, type Contact } from '@/services/client-crm.service';

const svc = clientCrmService as unknown as {
  getContacts: ReturnType<typeof vi.fn>;
  createContact: ReturnType<typeof vi.fn>;
  updateContact: ReturnType<typeof vi.fn>;
  deleteContact: ReturnType<typeof vi.fn>;
};

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c-1',
  clientId: 'client-1',
  firstName: 'Jean',
  lastName: 'Tremblay',
  role: 'DRH',
  email: 'jean@exemple.com',
  phone: '514-555-0100',
  isPrimary: true,
  isActive: true,
  notes: 'Contact clé',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('ClientContactsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Par défaut, la requête ne résout jamais : permet d'observer l'état de chargement.
    svc.getContacts.mockReturnValue(new Promise(() => {}));
  });

  it('affiche un indicateur de chargement pendant la requête', () => {
    renderWithProviders(<ClientContactsTab clientId="client-1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('affiche les contacts chargés avec nom, rôle et coordonnées', async () => {
    svc.getContacts.mockResolvedValue([
      makeContact({ firstName: 'Jean', lastName: 'Tremblay', role: 'DRH', email: 'jean@exemple.com', phone: '514-555-0100' }),
    ]);

    renderWithProviders(<ClientContactsTab clientId="client-1" />);

    expect(await screen.findByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText('DRH')).toBeInTheDocument();
    expect(screen.getByText('jean@exemple.com')).toBeInTheDocument();
    expect(screen.getByText('514-555-0100')).toBeInTheDocument();
    // L'entête reflète le nombre de contacts.
    expect(screen.getByRole('heading', { name: /Contacts \(1\)/ })).toBeInTheDocument();
  });

  it('affiche un message vide quand aucun contact', async () => {
    svc.getContacts.mockResolvedValue([]);

    renderWithProviders(<ClientContactsTab clientId="client-1" />);

    expect(await screen.findByText('Aucun contact enregistré.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Contacts \(0\)/ })).toBeInTheDocument();
  });

  it('affiche une alerte en cas d\'erreur de chargement', async () => {
    svc.getContacts.mockRejectedValue(new Error('boom'));

    renderWithProviders(<ClientContactsTab clientId="client-1" />);

    expect(await screen.findByText('Erreur de chargement des contacts')).toBeInTheDocument();
  });

  it('ouvre le dialogue de création et crée un contact', async () => {
    svc.getContacts.mockResolvedValue([]);
    svc.createContact.mockResolvedValue(makeContact());

    renderWithProviders(<ClientContactsTab clientId="client-1" />);
    await screen.findByText('Aucun contact enregistré.');

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ajouter un contact')).toBeInTheDocument();

    // Le bouton Enregistrer est désactivé tant que prénom/nom sont vides.
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/Prénom/), 'Marie');
    await userEvent.type(within(dialog).getByLabelText(/Nom/), 'Gagnon');
    expect(save).toBeEnabled();

    await userEvent.click(save);

    await waitFor(() => expect(svc.createContact).toHaveBeenCalledTimes(1));
    expect(svc.createContact).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ firstName: 'Marie', lastName: 'Gagnon' })
    );
  });

  it('pré-remplit le dialogue d\'édition et appelle updateContact', async () => {
    svc.getContacts.mockResolvedValue([makeContact({ id: 'c-9', firstName: 'Jean', lastName: 'Tremblay' })]);
    svc.updateContact.mockResolvedValue(makeContact({ id: 'c-9' }));

    renderWithProviders(<ClientContactsTab clientId="client-1" />);
    await screen.findByText('Jean Tremblay');

    // Le premier IconButton de la ligne est "Modifier" (icône Edit).
    const editButtons = screen.getAllByRole('button').filter((b) => b.querySelector('[data-testid="EditIcon"]'));
    await userEvent.click(editButtons[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Modifier le contact')).toBeInTheDocument();
    // Les champs sont pré-remplis avec le contact existant.
    expect(within(dialog).getByLabelText(/Prénom/)).toHaveValue('Jean');
    expect(within(dialog).getByLabelText(/Nom/)).toHaveValue('Tremblay');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(svc.updateContact).toHaveBeenCalledTimes(1));
    expect(svc.updateContact).toHaveBeenCalledWith('client-1', 'c-9', expect.objectContaining({ firstName: 'Jean' }));
    expect(svc.createContact).not.toHaveBeenCalled();
  });

  it('supprime un contact seulement après confirmation', async () => {
    svc.getContacts.mockResolvedValue([makeContact({ id: 'c-7' })]);
    svc.deleteContact.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<ClientContactsTab clientId="client-1" />);
    await screen.findByText('Jean Tremblay');

    const deleteButtons = screen.getAllByRole('button').filter((b) => b.querySelector('[data-testid="DeleteIcon"]'));
    await userEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(svc.deleteContact).toHaveBeenCalledWith('client-1', 'c-7'));

    confirmSpy.mockRestore();
  });

  it('n\'appelle pas deleteContact si la confirmation est annulée', async () => {
    svc.getContacts.mockResolvedValue([makeContact({ id: 'c-7' })]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<ClientContactsTab clientId="client-1" />);
    await screen.findByText('Jean Tremblay');

    const deleteButtons = screen.getAllByRole('button').filter((b) => b.querySelector('[data-testid="DeleteIcon"]'));
    await userEvent.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(svc.deleteContact).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
