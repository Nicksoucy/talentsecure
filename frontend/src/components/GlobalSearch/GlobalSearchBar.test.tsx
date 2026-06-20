import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/services/peopleSearch.service', () => ({
  peopleSearchService: { searchAll: vi.fn(), getCrossTableCounts: vi.fn() },
}));

import GlobalSearchBar from './GlobalSearchBar';
import {
  peopleSearchService,
  type PeopleSearchGroups,
  type PeopleSearchHit,
} from '@/services/peopleSearch.service';

const svc = peopleSearchService as unknown as { searchAll: ReturnType<typeof vi.fn> };

const makeHit = (overrides: Partial<PeopleSearchHit> = {}): PeopleSearchHit => ({
  id: 'h-1',
  firstName: 'Jean',
  lastName: 'Tremblay',
  email: 'jean@example.com',
  section: 'candidate',
  ...overrides,
});

const makeGroups = (overrides: Partial<PeopleSearchGroups> = {}): PeopleSearchGroups => ({
  employees: [],
  candidates: [],
  prospects: [],
  ...overrides,
});

describe('GlobalSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le déclencheur mais aucune boîte de dialogue avant ouverture', () => {
    renderWithProviders(<GlobalSearchBar />);

    expect(screen.getByText('Rechercher une personne…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(svc.searchAll).not.toHaveBeenCalled();
  });

  it('ouvre le dialogue au clic et montre l\'astuce tant que < 2 caractères', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GlobalSearchBar />);

    await user.click(screen.getByText('Rechercher une personne…'));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByPlaceholderText(/Nom, email ou téléphone/),
    ).toBeInTheDocument();
    // Sous le seuil : message d'astuce, pas de requête réseau.
    expect(within(dialog).getByText(/Tapez au moins 2 caractères/)).toBeInTheDocument();
    expect(svc.searchAll).not.toHaveBeenCalled();
  });

  it('ne déclenche pas la recherche sous 2 caractères mais l\'appelle au-delà', async () => {
    const user = userEvent.setup();
    svc.searchAll.mockResolvedValue(makeGroups({ candidates: [makeHit()] }));
    renderWithProviders(<GlobalSearchBar />);

    await user.click(screen.getByText('Rechercher une personne…'));
    const input = await screen.findByPlaceholderText(/Nom, email ou téléphone/);

    // 1 caractère : sous le seuil → aucun appel même après le debounce.
    await user.type(input, 'a');
    await new Promise((r) => setTimeout(r, 300));
    expect(svc.searchAll).not.toHaveBeenCalled();

    // On complète à >= 2 caractères → la recherche part avec le terme trimé et limit 6.
    await user.type(input, 'b');
    await waitFor(() => expect(svc.searchAll).toHaveBeenCalledWith('ab', 6));
  });

  it('regroupe et affiche les résultats par section avec le nom complet et l\'email', async () => {
    const user = userEvent.setup();
    svc.searchAll.mockResolvedValue(
      makeGroups({
        employees: [makeHit({ id: 'e-1', firstName: 'Alice', lastName: 'Roy', email: 'alice@ex.com', section: 'employee' })],
        candidates: [makeHit({ id: 'c-1', firstName: 'Bob', lastName: 'Gagnon', email: 'bob@ex.com', section: 'candidate' })],
      }),
    );
    renderWithProviders(<GlobalSearchBar />);

    await user.click(screen.getByText('Rechercher une personne…'));
    const input = await screen.findByPlaceholderText(/Nom, email ou téléphone/);
    await user.type(input, 'roy');

    // En-têtes de section présents seulement pour les groupes non vides.
    expect(await screen.findByText('Employés')).toBeInTheDocument();
    expect(screen.getByText('Candidats')).toBeInTheDocument();
    expect(screen.queryByText('Candidats potentiels')).not.toBeInTheDocument();

    // Fiches rendues avec nom complet + email.
    expect(screen.getByText('Alice Roy')).toBeInTheDocument();
    expect(screen.getByText('alice@ex.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Gagnon')).toBeInTheDocument();
  });

  it('navigue vers la fiche et ferme le dialogue au clic sur un résultat', async () => {
    const user = userEvent.setup();
    svc.searchAll.mockResolvedValue(
      makeGroups({
        candidates: [makeHit({ id: 'c-42', firstName: 'Bob', lastName: 'Gagnon', section: 'candidate' })],
      }),
    );
    renderWithProviders(<GlobalSearchBar />);

    await user.click(screen.getByText('Rechercher une personne…'));
    const input = await screen.findByPlaceholderText(/Nom, email ou téléphone/);
    await user.type(input, 'bob');

    await user.click(await screen.findByText('Bob Gagnon'));

    expect(navigate).toHaveBeenCalledWith('/candidates/c-42');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('affiche l\'état "aucune personne trouvée" quand la recherche ne renvoie rien', async () => {
    const user = userEvent.setup();
    svc.searchAll.mockResolvedValue(makeGroups());
    renderWithProviders(<GlobalSearchBar />);

    await user.click(screen.getByText('Rechercher une personne…'));
    const input = await screen.findByPlaceholderText(/Nom, email ou téléphone/);
    await user.type(input, 'zzz');

    expect(await screen.findByText(/Aucune personne trouvée pour « zzz »/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
