import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import { HelpDialog } from './HelpDialog';

const sections = [
  {
    title: 'Premiers pas',
    description: 'Comment démarrer rapidement avec la plateforme.',
    bullets: ['Créez votre compte', 'Importez vos candidats'],
  },
];

const faq = [
  { question: 'Comment réinitialiser mon mot de passe ?', answer: 'Cliquez sur « Mot de passe oublié ».' },
];

const quickTips = ['Utilisez Cmd+K pour la recherche rapide'];

describe('HelpDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend le déclencheur et garde le dialog fermé au montage', () => {
    renderWithProviders(
      <HelpDialog title="Centre d'aide" triggerLabel="Aide" sections={sections} />
    );

    // Le bouton déclencheur est présent…
    expect(screen.getByRole('button', { name: /aide/i })).toBeInTheDocument();
    // …mais aucun dialog ni son contenu n'est rendu tant qu'on n'a pas cliqué.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Centre d\'aide')).not.toBeInTheDocument();
  });

  it('ouvre le dialog au clic et affiche titre, sous-titre et sections', async () => {
    renderWithProviders(
      <HelpDialog
        title="Centre d'aide"
        subtitle="Tout ce qu'il faut savoir"
        triggerLabel="Aide"
        sections={sections}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /aide/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Centre d'aide")).toBeInTheDocument();
    expect(within(dialog).getByText("Tout ce qu'il faut savoir")).toBeInTheDocument();
    expect(within(dialog).getByText('Premiers pas')).toBeInTheDocument();
    expect(within(dialog).getByText('Comment démarrer rapidement avec la plateforme.')).toBeInTheDocument();
    // Les puces de la section sont listées.
    expect(within(dialog).getByText('Créez votre compte')).toBeInTheDocument();
    expect(within(dialog).getByText('Importez vos candidats')).toBeInTheDocument();
  });

  it('affiche les blocs FAQ et astuces rapides avec leur contenu', async () => {
    renderWithProviders(
      <HelpDialog title="Centre d'aide" faq={faq} quickTips={quickTips} />
    );

    await userEvent.click(screen.getByRole('button', { name: /aide/i }));

    const dialog = await screen.findByRole('dialog');
    // En-têtes de blocs.
    expect(within(dialog).getByText('Questions fréquentes')).toBeInTheDocument();
    expect(within(dialog).getByText('Astuces rapides')).toBeInTheDocument();
    // Contenu FAQ (question + réponse).
    expect(within(dialog).getByText('Comment réinitialiser mon mot de passe ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Cliquez sur « Mot de passe oublié ».')).toBeInTheDocument();
    // Astuce.
    expect(within(dialog).getByText('Utilisez Cmd+K pour la recherche rapide')).toBeInTheDocument();
  });

  it('ferme le dialog via le bouton d\'action « Fermer »', async () => {
    renderWithProviders(
      <HelpDialog title="Centre d'aide" sections={sections} />
    );

    await userEvent.click(screen.getByRole('button', { name: /aide/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: /^fermer$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Premiers pas')).not.toBeInTheDocument();
  });

  it('ferme le dialog via l\'icône « Fermer l\'aide » en haut à droite', async () => {
    renderWithProviders(
      <HelpDialog title="Centre d'aide" sections={sections} />
    );

    await userEvent.click(screen.getByRole('button', { name: /aide/i }));
    const dialog = await screen.findByRole('dialog');

    // Bouton-icône distinct du bouton d'action, ciblé par son aria-label.
    await userEvent.click(within(dialog).getByRole('button', { name: /fermer l'aide/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('utilise le libellé de déclencheur par défaut « Aide » et n\'affiche pas de sous-titre absent', async () => {
    renderWithProviders(<HelpDialog title="Centre d'aide" />);

    // triggerLabel par défaut.
    const trigger = screen.getByRole('button', { name: /aide/i });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Centre d'aide")).toBeInTheDocument();
    // Aucun sous-titre fourni → pas de paragraphe secondaire parasite.
    expect(within(dialog).queryByText("Tout ce qu'il faut savoir")).not.toBeInTheDocument();
  });
});
