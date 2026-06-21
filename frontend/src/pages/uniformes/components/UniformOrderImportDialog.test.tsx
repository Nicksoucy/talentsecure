import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';

// ── Mocks réseau : tous les services appelés par le dialogue ──────────────────
vi.mock('@/services/uniform.service', () => ({
  uniformService: {
    listItems: vi.fn(),
    prepareDraftIssuance: vi.fn(),
  },
}));
vi.mock('@/services/employee.service', () => ({
  employeeService: {
    createEmployee: vi.fn(),
  },
}));
vi.mock('@/services/contact.service', () => ({
  contactService: {
    lookup: vi.fn(),
    move: vi.fn(),
  },
}));

// notistack : on capture les snackbars sans monter le vrai provider.
const enqueueSnackbar = vi.fn();
vi.mock('notistack', async (orig) => {
  const actual = await orig<typeof import('notistack')>();
  return { ...actual, useSnackbar: () => ({ enqueueSnackbar, closeSnackbar: vi.fn() }) };
});

import UniformOrderImportDialog from './UniformOrderImportDialog';
import { uniformService } from '@/services/uniform.service';
import { contactService } from '@/services/contact.service';
import type { UniformItem } from '@/types/uniform';

const svcUniform = uniformService as unknown as {
  listItems: ReturnType<typeof vi.fn>;
  prepareDraftIssuance: ReturnType<typeof vi.fn>;
};
const svcContact = contactService as unknown as {
  lookup: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
};

// Catalogue minimal : un item taillé (chemise) + variantes.
const ITEMS: UniformItem[] = [
  {
    id: 'it1',
    division: 'SECURITE',
    type: 'UNIFORME',
    name: 'Chemise grise (ML)',
    isOneSize: false,
    defaultReplacementCost: 0,
    variants: [
      { id: 'v-l', itemId: 'it1', size: 'L', barcode: 'b1', replacementCost: 0, quantityOnHand: 5, isActive: true },
      { id: 'v-xl', itemId: 'it1', size: 'XL', barcode: 'b2', replacementCost: 0, quantityOnHand: 3, isActive: true },
    ],
  } as unknown as UniformItem,
];

const ORDER_TEXT = [
  "Nom de l'employé : Jean Tremblay",
  'Courriel : jean.tremblay@example.com',
  'Numéro de téléphone : 514-555-1234',
  'Division : Sécurité',
  'Chemise à manches longue (1): XLarge',
].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  svcUniform.listItems.mockResolvedValue({ data: ITEMS });
  svcContact.lookup.mockResolvedValue({ data: null });
});

describe('UniformOrderImportDialog', () => {
  it('rend la phase de collage : zone de texte et bouton « Analyser » désactivé tant que vide', () => {
    renderWithProviders(<UniformOrderImportDialog open onClose={vi.fn()} />);

    expect(screen.getByText("Importer une commande d'uniforme")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).not.toBeInTheDocument();
  });

  it('ne rend rien quand open=false', () => {
    renderWithProviders(<UniformOrderImportDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByText("Importer une commande d'uniforme")).not.toBeInTheDocument();
  });

  it('texte non reconnu → snackbar d\'avertissement et on reste sur la phase de collage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformOrderImportDialog open onClose={vi.fn()} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'bonjour');
    await user.click(screen.getByRole('button', { name: 'Analyser' }));

    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith(
        expect.stringMatching(/non reconnu/i),
        expect.objectContaining({ variant: 'warning' }),
      ),
    );
    // Toujours sur la phase de collage : pas d'appel lookup.
    expect(svcContact.lookup).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).not.toBeInTheDocument();
  });

  it('analyse une commande valide → passe en aperçu, remplit l\'employé et déclenche le lookup', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformOrderImportDialog open onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), ORDER_TEXT);
    await user.click(screen.getByRole('button', { name: 'Analyser' }));

    // Lookup appelé avec l'email + téléphone extraits.
    await waitFor(() =>
      expect(svcContact.lookup).toHaveBeenCalledWith('jean.tremblay@example.com', '514-555-1234'),
    );

    // Champs employé pré-remplis depuis le parsing.
    expect(await screen.findByDisplayValue('Jean')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tremblay')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jean.tremblay@example.com')).toBeInTheDocument();

    // Aucun contact trouvé → alerte « nouvel employé sera créé ».
    expect(await screen.findByText(/nouvel employé sera créé/i)).toBeInTheDocument();

    // Le catalogue de la division a été chargé pour construire les lignes.
    expect(svcUniform.listItems).toHaveBeenCalledWith({ division: 'SECURITE' });
    expect(screen.getByRole('button', { name: 'Créer le brouillon' })).toBeInTheDocument();
  });

  it('contact existant → alerte « Employé existant » avec le nom', async () => {
    svcContact.lookup.mockResolvedValue({
      data: { section: 'employee', id: 'emp9', firstName: 'Jean', lastName: 'Tremblay' },
    });
    const user = userEvent.setup();
    renderWithProviders(<UniformOrderImportDialog open onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), ORDER_TEXT);
    await user.click(screen.getByRole('button', { name: 'Analyser' }));

    const alert = await screen.findByText(/employé existant/i);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Jean Tremblay')).toBeInTheDocument();
  });

  it('« Recommencer » ramène à la phase de collage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UniformOrderImportDialog open onClose={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), ORDER_TEXT);
    await user.click(screen.getByRole('button', { name: 'Analyser' }));

    await screen.findByRole('button', { name: 'Recommencer' });
    await user.click(screen.getByRole('button', { name: 'Recommencer' }));

    // De retour au collage : « Analyser » réapparaît, plus de « Créer le brouillon ».
    expect(await screen.findByRole('button', { name: 'Analyser' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).not.toBeInTheDocument();
  });
});
