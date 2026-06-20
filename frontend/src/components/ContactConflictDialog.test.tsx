import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/services/contact.service', () => ({
  contactService: { move: vi.fn(), lookup: vi.fn() },
}));

import ContactConflictDialog from './ContactConflictDialog';
import { contactService, type ContactConflict } from '@/services/contact.service';

const svc = contactService as unknown as { move: ReturnType<typeof vi.fn> };

const makeConflict = (overrides: Partial<ContactConflict> = {}): ContactConflict => ({
  section: 'prospect',
  id: 'p-1',
  firstName: 'Jean',
  lastName: 'Tremblay',
  ...overrides,
});

describe('ContactConflictDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien quand il n\'y a pas de conflit (conflict=null)', () => {
    renderWithProviders(
      <ContactConflictDialog conflict={null} creatingIn="candidate" onClose={vi.fn()} />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact déjà existant')).not.toBeInTheDocument();
  });

  it('affiche le titre, le nom complet et la section d\'origine quand ouvert', () => {
    renderWithProviders(
      <ContactConflictDialog
        conflict={makeConflict({ firstName: 'Jean', lastName: 'Tremblay', section: 'prospect' })}
        creatingIn="candidate"
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Contact déjà existant')).toBeInTheDocument();
    // L'alerte indique le nom complet et la section où le contact existe déjà.
    expect(within(dialog).getByText('Jean Tremblay')).toBeInTheDocument();
    expect(within(dialog).getByText('Candidats Potentiels')).toBeInTheDocument();
  });

  it('propose comme destinations les sections autres que celle d\'origine', () => {
    renderWithProviders(
      <ContactConflictDialog
        conflict={makeConflict({ section: 'prospect' })}
        creatingIn="candidate"
        onClose={vi.fn()}
      />
    );

    // section = prospect → destinations possibles : Candidats + Employés (pas de toggle "Candidats Potentiels").
    expect(screen.getByRole('button', { name: 'Candidats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Employés' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidats Potentiels' })).not.toBeInTheDocument();
  });

  it('appelle onClose au clic sur Annuler', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ContactConflictDialog
        conflict={makeConflict()}
        creatingIn="candidate"
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('déplace le contact, notifie onMoved, ferme et navigue après un déplacement réussi', async () => {
    svc.move.mockResolvedValue({
      message: 'ok',
      data: { section: 'candidate', id: 'c-9', firstName: 'Jean', lastName: 'Tremblay' },
    });
    const onClose = vi.fn();
    const onMoved = vi.fn();

    renderWithProviders(
      <ContactConflictDialog
        conflict={makeConflict({ section: 'prospect', id: 'p-1' })}
        creatingIn="candidate"
        onClose={onClose}
        onMoved={onMoved}
      />
    );

    // Le CTA reflète la destination par défaut (creatingIn = candidate).
    await userEvent.click(screen.getByRole('button', { name: 'Déplacer vers Candidats' }));

    await waitFor(() => expect(svc.move).toHaveBeenCalledTimes(1));
    expect(svc.move).toHaveBeenCalledWith({ fromSection: 'prospect', fromId: 'p-1', toSection: 'candidate' });

    await waitFor(() => expect(onMoved).toHaveBeenCalledWith('candidate'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/candidates/c-9');
  });

  it('redirige vers la fiche existante sans déplacer via "Voir la fiche existante"', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ContactConflictDialog
        conflict={makeConflict({ section: 'prospect', id: 'p-1' })}
        creatingIn="candidate"
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Voir la fiche existante' }));

    expect(svc.move).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/prospects/p-1');
  });
});
