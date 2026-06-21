import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { resetStores } from '@/test/resetStores';
import { makeUser } from '@/test/factories';
import { employeeService } from '@/services/employee.service';
import type { Employee } from '@/types';
import EmployeeDetailPage from './EmployeeDetailPage';

// La page lit/écrit l'employé via TanStack Query → on mocke le service appelé
// pour piloter chargement / données sans réseau réel.
vi.mock('@/services/employee.service', () => ({
  employeeService: {
    getEmployeeById: vi.fn(),
    updateEmployee: vi.fn(),
  },
}));

// Le panneau « Gestion des uniformes » est un sous-arbre lourd (ses propres
// requêtes, dialogs, tableaux). On le neutralise pour isoler la fiche employé
// et éviter tout réseau / hang.
vi.mock('../uniformes/components/UniformFichePanel', () => ({
  default: () => <div data-testid="uniform-fiche-panel" />,
}));

const getEmployeeById = vi.mocked(employeeService.getEmployeeById);
const updateEmployee = vi.mocked(employeeService.updateEmployee);

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    firstName: 'Marc',
    lastName: 'Lavoie',
    employeeNumber: 'E-042',
    status: 'ACTIF',
    email: 'marc.lavoie@example.com',
    phone: '514-555-0123',
    address: '10 rue Principale',
    city: 'Québec',
    province: 'QC',
    postalCode: 'G1A 1A1',
    position: 'Agent',
    assignment: 'Site Centre-Ville',
    hireDate: '2025-03-15T00:00:00.000Z',
    hasBSP: true,
    bspNumber: 'BSP-987',
    hasVehicle: false,
  } as Employee;
}

// La page utilise useParams → on monte sous une vraie route /employees/:id.
function renderPage(id = 'emp-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/employees/:id" element={<EmployeeDetailPage />} />
    </Routes>,
    { route: `/employees/${id}` }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // usePerms dérive ses droits du rôle dans le store auth : ADMIN ⇒
  // canViewUniforms + canWriteEmployees.
  useAuthStore.getState().setAuth(makeUser({ role: 'ADMIN' }), 'tok', 'refresh');
});

afterEach(() => resetStores());

describe('EmployeeDetailPage', () => {
  it('affiche un indicateur de chargement avant la réponse du service', () => {
    // Promesse jamais résolue → reste en chargement.
    getEmployeeById.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it("rend l'en-tête et les informations de l'employé une fois chargé", async () => {
    getEmployeeById.mockResolvedValue({ data: makeEmployee() });
    renderPage();

    expect(await screen.findByRole('heading', { name: /marc lavoie/i })).toBeInTheDocument();
    // Statut + quelques champs de la fiche.
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('E-042')).toBeInTheDocument();
    expect(screen.getByText('marc.lavoie@example.com')).toBeInTheDocument();
    expect(screen.getByText('Site Centre-Ville')).toBeInTheDocument();
    // Le service a bien été appelé avec l'id de l'URL.
    expect(getEmployeeById).toHaveBeenCalledWith('emp-1');
    // Le spinner a disparu.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('affiche le panneau des uniformes quand le rôle y a accès', async () => {
    getEmployeeById.mockResolvedValue({ data: makeEmployee() });
    renderPage();

    await screen.findByRole('heading', { name: /marc lavoie/i });
    expect(screen.getByText('Gestion des uniformes')).toBeInTheDocument();
    expect(screen.getByTestId('uniform-fiche-panel')).toBeInTheDocument();
  });

  it("affiche un message d'accès réservé pour un rôle sans droit uniformes", async () => {
    // MANAGER n'est pas dans la liste canViewUniforms.
    useAuthStore.getState().setAuth(makeUser({ role: 'MANAGER' as never }), 'tok', 'refresh');
    getEmployeeById.mockResolvedValue({ data: makeEmployee() });
    renderPage();

    await screen.findByRole('heading', { name: /marc lavoie/i });
    expect(
      screen.getByText(/accès à la gestion des uniformes réservé/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('uniform-fiche-panel')).not.toBeInTheDocument();
  });

  it('affiche un message lorsque l\'employé est introuvable', async () => {
    getEmployeeById.mockResolvedValue({ data: undefined as never });
    renderPage();

    expect(await screen.findByText(/employé introuvable/i)).toBeInTheDocument();
  });

  it("ouvre le dialogue de modification au clic sur « Modifier »", async () => {
    getEmployeeById.mockResolvedValue({ data: makeEmployee() });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /modifier/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /modifier l'employé/i })).toBeInTheDocument();
    // Le formulaire est pré-rempli depuis l'employé chargé.
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeEnabled();
  });

  it('masque le bouton « Modifier » pour un rôle sans droit d\'écriture', async () => {
    useAuthStore.getState().setAuth(makeUser({ role: 'MAGASIN' as never }), 'tok', 'refresh');
    getEmployeeById.mockResolvedValue({ data: makeEmployee() });
    renderPage();

    await screen.findByRole('heading', { name: /marc lavoie/i });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument()
    );
    expect(updateEmployee).not.toHaveBeenCalled();
  });
});
