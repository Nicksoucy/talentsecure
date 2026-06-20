import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/renderWithProviders';

vi.mock('@/services/peopleSearch.service', () => ({
  peopleSearchService: {
    getCrossTableCounts: vi.fn(),
  },
}));

import CrossTableHint from './CrossTableHint';
import {
  peopleSearchService,
  type PeopleSearchCounts,
} from '@/services/peopleSearch.service';

const getCounts = peopleSearchService.getCrossTableCounts as ReturnType<typeof vi.fn>;

const makeCounts = (overrides: Partial<PeopleSearchCounts> = {}): PeopleSearchCounts => ({
  employees: 0,
  candidates: 0,
  prospects: 0,
  ...overrides,
});

describe('CrossTableHint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'interroge pas le service et ne rend rien quand le terme fait moins de 2 caractères", () => {
    const { container } = renderWithProviders(
      <CrossTableHint q="a" currentSection="candidate" />
    );

    expect(getCounts).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("n'interroge pas le service quand enabled est faux", () => {
    const { container } = renderWithProviders(
      <CrossTableHint q="martin" currentSection="candidate" enabled={false} />
    );

    expect(getCounts).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('interroge le service avec le terme nettoyé (trim) et affiche les autres tables avec un compte > 0', async () => {
    getCounts.mockResolvedValue(makeCounts({ employees: 3, prospects: 2 }));

    renderWithProviders(<CrossTableHint q="  martin  " currentSection="candidate" />);

    await waitFor(() =>
      expect(screen.getByText('Personne introuvable ici ?')).toBeInTheDocument()
    );

    // Le terme est trimé avant l'appel au service et dans l'affichage.
    expect(getCounts).toHaveBeenCalledWith('martin');
    expect(screen.getByText(/«\s*martin\s*»/)).toBeInTheDocument();

    // Liens vers les AUTRES sections ayant un compte > 0.
    const employeeLink = screen.getByRole('link', { name: /3 dans Employés/ });
    const prospectLink = screen.getByRole('link', { name: /2 dans Candidats potentiels/ });
    expect(employeeLink).toHaveAttribute('href', '/employees?q=martin');
    expect(prospectLink).toHaveAttribute('href', '/prospects?q=martin');
  });

  it('exclut la section courante même si elle a un compte > 0', async () => {
    getCounts.mockResolvedValue(makeCounts({ employees: 5, candidates: 4 }));

    renderWithProviders(<CrossTableHint q="dupont" currentSection="employee" />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /4 dans Candidats/ })).toBeInTheDocument()
    );

    // La section courante (employés) est exclue malgré ses 5 correspondances.
    expect(screen.queryByRole('link', { name: /dans Employés/ })).not.toBeInTheDocument();
  });

  it("ne rend rien quand seule la section courante a des correspondances", async () => {
    getCounts.mockResolvedValue(makeCounts({ candidates: 7 }));

    const { container } = renderWithProviders(
      <CrossTableHint q="lavoie" currentSection="candidate" />
    );

    // Le service est appelé (terme valide) mais aucune AUTRE table n'a de résultat.
    await waitFor(() => expect(getCounts).toHaveBeenCalledWith('lavoie'));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText('Personne introuvable ici ?')).not.toBeInTheDocument();
  });

  it('encode le terme dans le lien (caractères spéciaux)', async () => {
    getCounts.mockResolvedValue(makeCounts({ employees: 1 }));

    renderWithProviders(<CrossTableHint q="o'brien & co" currentSection="candidate" />);

    const link = await screen.findByRole('link', { name: /1 dans Employés/ });
    expect(link).toHaveAttribute('href', `/employees?q=${encodeURIComponent("o'brien & co")}`);
  });
});
