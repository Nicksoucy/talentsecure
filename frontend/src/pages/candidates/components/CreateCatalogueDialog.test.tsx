import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import CreateCatalogueDialog, { type CatalogueFormData } from './CreateCatalogueDialog';

const clients = [
  { id: 'cl-1', name: 'Jean Tremblay', companyName: 'Acme inc.' },
  { id: 'cl-2', name: 'Marie Cloutier', companyName: 'Globex' },
];

type Props = React.ComponentProps<typeof CreateCatalogueDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn<[string, CatalogueFormData], void>();
  const props: Props = {
    open: true,
    onClose,
    selectedCandidatesCount: 3,
    clients,
    onSubmit,
    isSubmitting: false,
    ...overrides,
  };
  const utils = renderWithProviders(<CreateCatalogueDialog {...props} />);
  return { ...utils, onClose, onSubmit };
}

describe('CreateCatalogueDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend pas le dialogue quand open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('affiche le titre avec le nombre de candidats au pluriel', () => {
    renderDialog({ selectedCandidatesCount: 3 });
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/Créer un catalogue avec 3 candidats/)
    ).toBeInTheDocument();
  });

  it('affiche le singulier pour un seul candidat', () => {
    renderDialog({ selectedCandidatesCount: 1 });
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('Créer un catalogue avec 1 candidat')
    ).toBeInTheDocument();
  });

  it('rend les six options d\'inclusion cochées par défaut', () => {
    renderDialog();
    const labels = ['Résumé', 'Détails', 'Vidéo', 'Expérience', 'Situation', 'CV'];
    for (const label of labels) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    }
  });

  it('désactive le bouton de création tant que le titre et le client manquent', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Créer le catalogue' })).toBeDisabled();
  });

  it('appelle onClose au clic sur Annuler', async () => {
    const { onClose } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('soumet le client choisi et le formulaire après titre + sélection client', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.type(screen.getByRole('textbox', { name: /Titre du catalogue/ }), 'Catalogue Q3');

    // Ouvre l'Autocomplete et choisit le 1er client.
    await user.click(screen.getByRole('combobox', { name: /Sélectionner un client/ }));
    await user.click(await screen.findByText('Acme inc. - Jean Tremblay'));

    // Décoche une option pour vérifier qu'elle est transmise à false.
    await user.click(screen.getByRole('checkbox', { name: 'Vidéo' }));

    const submit = screen.getByRole('button', { name: 'Créer le catalogue' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      'cl-1',
      expect.objectContaining({ title: 'Catalogue Q3', includeVideo: false, includeCV: true })
    );
  });

  it('affiche l\'état de chargement et désactive la soumission quand isSubmitting', () => {
    renderDialog({ isSubmitting: true });
    const submit = screen.getByRole('button', { name: 'Création...' });
    expect(submit).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });
});
