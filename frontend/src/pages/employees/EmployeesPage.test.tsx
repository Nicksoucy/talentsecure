import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';

// On isole la PAGE : ses services sont mockés (la page récupère via TanStack
// Query, on contrôle donc directement les réponses), et les enfants lourds
// (bandeau inter-tables qui requête lui-même, dialog de conflit) sont neutralisés.
vi.mock('@/services/employee.service', () => ({
  employeeService: {
    getEmployees: vi.fn(),
    getEmployeesStats: vi.fn(),
    createEmployee: vi.fn(),
  },
}));

vi.mock('@/services/contact.service', () => ({
  contactService: { lookup: vi.fn() },
}));

vi.mock('@/components/CrossTableHint', () => ({ default: () => null }));
vi.mock('@/components/ContactConflictDialog', () => ({ default: () => null }));

// Carte des agents (Leaflet) : stub léger qui expose un bouton déclenchant
// onNearbySelect comme le ferait « Voir ces agents » sur un pin.
vi.mock('@/components/map/EmployeesMap', () => ({
  default: ({ onNearbySelect }: any) => (
    <div data-testid="employees-map">
      <button onClick={() => onNearbySelect({ lat: 45.5, lng: -73.55 }, 25, 'Jean Tremblay')}>
        mock-nearby
      </button>
    </div>
  ),
}));

import EmployeesPage from './EmployeesPage';
import { employeeService } from '@/services/employee.service';
import { contactService } from '@/services/contact.service';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import type { Employee } from '@/types';

const svc = employeeService as unknown as {
  getEmployees: ReturnType<typeof vi.fn>;
  getEmployeesStats: ReturnType<typeof vi.fn>;
  createEmployee: ReturnType<typeof vi.fn>;
};
const contact = contactService as unknown as { lookup: ReturnType<typeof vi.fn> };

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    firstName: 'Marie',
    lastName: 'Gagnon',
    email: 'marie.gagnon@example.com',
    phone: '514-555-0199',
    city: 'Montréal',
    position: 'Agente de sécurité',
    assignment: 'Site Centre-ville',
    status: 'ACTIF',
    hireDate: '2026-01-15T00:00:00.000Z',
    hasBSP: false,
    hasVehicle: false,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Employee;
}

function pageResponse(employees: Employee[], total = employees.length) {
  return {
    data: employees,
    pagination: { total, page: 1, limit: 20, totalPages: Math.max(1, Math.ceil(total / 20)) },
  };
}

const STATS = { data: { total: 12, actifs: 9, inactifs: 3 } };

beforeEach(() => {
  vi.clearAllMocks();
  // La page lit user.role depuis le store auth ; un ADMIN active la colonne
  // « Uniformes » et le bouton « Ajouter un employé ».
  useAuthStore.setState({
    user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'ADMIN' } as any,
    accessToken: 'tok',
    isAuthenticated: true,
  });
  svc.getEmployeesStats.mockResolvedValue(STATS);
});

afterEach(() => resetStores());

describe('EmployeesPage', () => {
  it('affiche le chargement puis le tableau des employés mockés', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee()]));

    renderWithProviders(<EmployeesPage />);

    // En-tête présent immédiatement.
    expect(screen.getByRole('heading', { name: 'Employés' })).toBeInTheDocument();
    // Spinner de chargement (CircularProgress = role progressbar) avant résolution.
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Après chargement : la ligne de l'employé mocké est rendue.
    expect(await screen.findByText('Marie Gagnon')).toBeInTheDocument();
    expect(screen.getByText('marie.gagnon@example.com')).toBeInTheDocument();
    expect(screen.getByText('Agente de sécurité')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('affiche les statistiques retournées par le service', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee()]));

    renderWithProviders(<EmployeesPage />);

    // Les 3 cartes de stats (Total / Actifs / Inactifs) reflètent la réponse mockée.
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('affiche l\'état vide « Aucun employé » quand la liste est vide', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([], 0));

    renderWithProviders(<EmployeesPage />);

    expect(await screen.findByText('Aucun employé')).toBeInTheDocument();
  });

  it('un ADMIN voit le bouton « Ajouter un employé » qui ouvre le dialog', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee()]));
    const user = userEvent.setup();

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Marie Gagnon');

    await user.click(screen.getByRole('button', { name: /ajouter un employé/i }));

    // Le dialog s'ouvre avec ses champs.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Prénom')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Téléphone')).toBeInTheDocument();
  });

  it('masque le bouton d\'ajout pour un rôle non habilité (CLIENT)', async () => {
    useAuthStore.setState({
      user: { id: 'u2', email: 'c@b.c', firstName: 'C', lastName: 'D', role: 'CLIENT' } as any,
    });
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee()]));

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Marie Gagnon');

    expect(screen.queryByRole('button', { name: /ajouter un employé/i })).not.toBeInTheDocument();
  });

  it('la saisie dans le champ de recherche déclenche un nouvel appel debouncé avec le terme', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee()]));
    const user = userEvent.setup();

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Marie Gagnon');

    await user.type(
      screen.getByPlaceholderText(/rechercher par nom/i),
      'gagnon'
    );

    // Debounce de 300 ms → on attend que le service soit rappelé avec le terme.
    await waitFor(
      () =>
        expect(svc.getEmployees).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'gagnon', page: 1 })
        ),
      { timeout: 2000 }
    );
  });

  it('« Afficher la carte » monte la carte des agents (lazy) puis le libellé bascule', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee()]));
    const user = userEvent.setup();

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Marie Gagnon');

    // La carte n'est pas montée tant que le bouton n'a pas été cliqué.
    expect(screen.queryByTestId('employees-map')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /afficher la carte/i }));

    expect(await screen.findByTestId('employees-map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /masquer la carte/i })).toBeInTheDocument();
  });

  it('« Voir ces agents » depuis la carte : chip de rayon, colonne Distance et requête near', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee({ distanceKm: 2.3 })]));
    const user = userEvent.setup();

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Marie Gagnon');

    await user.click(screen.getByRole('button', { name: /afficher la carte/i }));
    await user.click(await screen.findByRole('button', { name: 'mock-nearby' }));

    // Chip du filtre par rayon (avec le libellé du pin cliqué).
    expect(await screen.findByText('≤ 25 km — Jean Tremblay')).toBeInTheDocument();
    // Colonne Distance visible avec la valeur renvoyée par l'API.
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(await screen.findByText('2.3 km')).toBeInTheDocument();

    // Le service est rappelé avec le point + rayon.
    await waitFor(() =>
      expect(svc.getEmployees).toHaveBeenCalledWith(
        expect.objectContaining({ near: { lat: 45.5, lng: -73.55, radiusKm: 25 }, page: 1 })
      )
    );
  });

  it('supprimer la chip de rayon relance la requête SANS le filtre near', async () => {
    svc.getEmployees.mockResolvedValue(pageResponse([makeEmployee({ distanceKm: 2.3 })]));
    const user = userEvent.setup();

    renderWithProviders(<EmployeesPage />);
    await screen.findByText('Marie Gagnon');
    await user.click(screen.getByRole('button', { name: /afficher la carte/i }));
    await user.click(await screen.findByRole('button', { name: 'mock-nearby' }));
    const chip = await screen.findByText('≤ 25 km — Jean Tremblay');

    // La croix de la chip MUI (icône CancelIcon dans le même conteneur).
    const cancel = chip.parentElement!.querySelector('svg') as unknown as Element;
    await user.click(cancel as any);

    await waitFor(() => {
      expect(screen.queryByText('≤ 25 km — Jean Tremblay')).not.toBeInTheDocument();
    });
    // Dernier appel : sans filtre near.
    const calls = svc.getEmployees.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.near).toBeUndefined();
    // La colonne Distance disparaît avec le filtre.
    expect(screen.queryByText('Distance')).not.toBeInTheDocument();
  });
});
