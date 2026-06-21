import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import ProspectsTable from './ProspectsTable';

// Le type Prospect n'est pas exporté par le composant : on le reconstruit
// localement pour des props réalistes et typées.
interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  city?: string;
  cvUrl?: string;
  cvStoragePath?: string;
  createdAt: string;
  isContacted: boolean;
  _count?: { skills: number };
}

const makeProspect = (overrides: Partial<Prospect> = {}): Prospect => ({
  id: 'p-1',
  firstName: 'Jean',
  lastName: 'Tremblay',
  email: 'jean.tremblay@example.com',
  city: 'Montréal',
  cvUrl: 'https://example.com/cv.pdf',
  createdAt: '2026-01-15T10:00:00.000Z',
  isContacted: false,
  ...overrides,
});

const baseProps = {
  selectedIds: [] as string[],
  onSelect: vi.fn(),
  onSelectAll: vi.fn(),
  onView: vi.fn(),
  onExtract: vi.fn(),
  onViewHistory: vi.fn(),
  page: 0,
  rowsPerPage: 10,
  onPageChange: vi.fn(),
  onRowsPerPageChange: vi.fn(),
  totalCount: 1,
};

describe('ProspectsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les en-têtes de colonnes et une ligne de candidat potentiel', () => {
    renderWithProviders(
      <ProspectsTable {...baseProps} prospects={[makeProspect()]} totalCount={1} />
    );

    // En-têtes attendus.
    expect(screen.getByText('Candidat Potentiel')).toBeInTheDocument();
    expect(screen.getByText('Ville')).toBeInTheDocument();
    expect(screen.getByText('Date de soumission')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Données du prospect.
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
    expect(screen.getByText('jean.tremblay@example.com')).toBeInTheDocument();
    expect(screen.getByText('Montréal')).toBeInTheDocument();
    // CV présent → chip "CV Disponible" ; contact non fait → chip "Non".
    expect(screen.getByText('CV Disponible')).toBeInTheDocument();
    expect(screen.getByText('Non')).toBeInTheDocument();
  });

  it('affiche "Pas de CV" / "-" et marque comme "Oui" un prospect sans CV déjà contacté', () => {
    renderWithProviders(
      <ProspectsTable
        {...baseProps}
        prospects={[
          makeProspect({
            cvUrl: undefined,
            cvStoragePath: undefined,
            city: undefined,
            isContacted: true,
          }),
        ]}
        totalCount={1}
      />
    );

    expect(screen.getByText('Pas de CV')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('Oui')).toBeInTheDocument();
  });

  it('appelle onView et onViewHistory au clic sur les actions de la ligne', async () => {
    const onView = vi.fn();
    const onViewHistory = vi.fn();
    renderWithProviders(
      <ProspectsTable
        {...baseProps}
        prospects={[makeProspect({ id: 'p-9', firstName: 'Marie', lastName: 'Lavoie' })]}
        onView={onView}
        onViewHistory={onViewHistory}
        totalCount={1}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Voir le profil' }));
    expect(onView).toHaveBeenCalledWith('p-9');

    await userEvent.click(screen.getByRole('button', { name: "Historique d'extraction" }));
    expect(onViewHistory).toHaveBeenCalledWith('p-9', 'Marie Lavoie');
  });

  it("déclenche onExtract avec l'indicateur de CV au clic sur le bouton d'extraction", async () => {
    const onExtract = vi.fn();
    renderWithProviders(
      <ProspectsTable
        {...baseProps}
        prospects={[makeProspect({ id: 'p-3', firstName: 'Paul', lastName: 'Gagnon' })]}
        onExtract={onExtract}
        totalCount={1}
      />
    );

    // CV disponible → tooltip "Extraire les compétences", bouton actif.
    await userEvent.click(screen.getByRole('button', { name: 'Extraire les compétences' }));
    expect(onExtract).toHaveBeenCalledWith('p-3', 'Paul Gagnon', true);
  });

  it("désactive l'extraction sans CV et affiche le compteur de compétences quand il existe", () => {
    renderWithProviders(
      <ProspectsTable
        {...baseProps}
        prospects={[
          // Prospect sans CV mais avec compétences déjà extraites.
          makeProspect({
            cvUrl: undefined,
            cvStoragePath: undefined,
            _count: { skills: 7 },
          }),
        ]}
        totalCount={1}
      />
    );

    // Tooltip de ré-extraction reflète le nombre de compétences.
    const extractBtn = screen.getByRole('button', { name: 'Ré-extraire (7 compétences)' });
    expect(extractBtn).toBeDisabled();
    // Le compteur est rendu dans le bouton.
    expect(within(extractBtn).getByText('7')).toBeInTheDocument();
  });

  it('gère la sélection : ligne unique (onSelect) et tout sélectionner (onSelectAll)', async () => {
    const onSelect = vi.fn();
    const onSelectAll = vi.fn();
    renderWithProviders(
      <ProspectsTable
        {...baseProps}
        prospects={[
          makeProspect({ id: 'p-1' }),
          makeProspect({ id: 'p-2', firstName: 'Anne', lastName: 'Roy' }),
        ]}
        onSelect={onSelect}
        onSelectAll={onSelectAll}
        totalCount={2}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // La première case est celle de l'en-tête (tout sélectionner).
    await userEvent.click(checkboxes[0]);
    expect(onSelectAll).toHaveBeenCalledWith(true);

    // La case suivante correspond à la première ligne.
    await userEvent.click(checkboxes[1]);
    expect(onSelect).toHaveBeenCalledWith('p-1');
  });
});
