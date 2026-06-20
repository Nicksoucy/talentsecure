import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import ShareCatalogueDialog from './ShareCatalogueDialog';

// navigator.clipboard n'existe pas dans jsdom → on le stub avant chaque test.
const writeText = vi.fn();

const makeCatalogue = (
  overrides: Partial<{
    id: string;
    title: string;
    client: { id: string; name: string; companyName?: string; email: string };
  }> = {}
) => ({
  id: 'cat-1',
  title: 'Agents de sécurité — Montréal',
  client: {
    id: 'cli-1',
    name: 'Jean Tremblay',
    companyName: 'Sécurité ABC inc.',
    email: 'jean@securite-abc.ca',
  },
  ...overrides,
});

// Fallback attendu : VITE_FRONTEND_URL n'est pas défini en test.
const LOGIN_URL = 'http://localhost:5173/client/login';

describe('ShareCatalogueDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
  });

  it('n\'affiche rien quand open=false', () => {
    renderWithProviders(
      <ShareCatalogueDialog open={false} onClose={vi.fn()} catalogue={makeCatalogue()} />
    );
    expect(screen.queryByText('Partager le catalogue')).not.toBeInTheDocument();
  });

  it('affiche le titre du catalogue, la raison sociale et l\'URL du portail', () => {
    renderWithProviders(
      <ShareCatalogueDialog open onClose={vi.fn()} catalogue={makeCatalogue()} />
    );

    expect(screen.getByText('Partager le catalogue')).toBeInTheDocument();
    expect(screen.getByText('Agents de sécurité — Montréal')).toBeInTheDocument();
    // companyName prime sur name pour l'affichage du client.
    expect(screen.getByText('Sécurité ABC inc.')).toBeInTheDocument();
    // Le champ lecture seule contient l'URL de connexion (fallback localhost).
    expect(screen.getByDisplayValue(LOGIN_URL)).toBeInTheDocument();
    // L'email du client est affiché dans son propre champ.
    expect(screen.getByDisplayValue('jean@securite-abc.ca')).toBeInTheDocument();
  });

  it('retombe sur name quand companyName est absent', () => {
    renderWithProviders(
      <ShareCatalogueDialog
        open
        onClose={vi.fn()}
        catalogue={makeCatalogue({
          client: { id: 'cli-2', name: 'Marie Roy', email: 'marie@roy.ca' },
        })}
      />
    );
    expect(screen.getByText('Marie Roy')).toBeInTheDocument();
  });

  it('copie le lien du portail et affiche le snackbar de succès', async () => {
    renderWithProviders(
      <ShareCatalogueDialog open onClose={vi.fn()} catalogue={makeCatalogue()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /copier le lien/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(LOGIN_URL);
    expect(await screen.findByText('Lien copié !')).toBeInTheDocument();
  });

  it('copie l\'email du client avec le bon contenu', async () => {
    renderWithProviders(
      <ShareCatalogueDialog open onClose={vi.fn()} catalogue={makeCatalogue()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /copier l'email/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('jean@securite-abc.ca');
    expect(await screen.findByText('Email copié !')).toBeInTheDocument();
  });

  it('copie le message complet contenant le nom, le titre et le lien', async () => {
    renderWithProviders(
      <ShareCatalogueDialog open onClose={vi.fn()} catalogue={makeCatalogue()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /copier le message complet/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const message = writeText.mock.calls[0][0] as string;
    expect(message).toContain('Bonjour Jean Tremblay,');
    expect(message).toContain('Agents de sécurité — Montréal');
    expect(message).toContain(LOGIN_URL);
    expect(message).toContain('jean@securite-abc.ca');
    expect(await screen.findByText('Message complet copié !')).toBeInTheDocument();
  });

  it('appelle onClose au clic sur le bouton Fermer', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ShareCatalogueDialog open onClose={onClose} catalogue={makeCatalogue()} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
