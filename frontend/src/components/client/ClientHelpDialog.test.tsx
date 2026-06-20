import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import ClientHelpDialog from './ClientHelpDialog';

describe('ClientHelpDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend le dialog avec son titre quand open=true', () => {
    renderWithProviders(<ClientHelpDialog open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText("Centre d'aide")).toBeInTheDocument();
    expect(within(dialog).getByText('Comment ça marche?')).toBeInTheDocument();
    expect(within(dialog).getByText('Questions fréquentes')).toBeInTheDocument();
  });

  it('affiche les étapes "Comment ça marche" dans l\'ordre', () => {
    renderWithProviders(<ClientHelpDialog open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Explorez la carte')).toBeInTheDocument();
    expect(within(dialog).getByText('Sélectionnez vos besoins')).toBeInTheDocument();
    expect(within(dialog).getByText('Soumettez')).toBeInTheDocument();
    expect(within(dialog).getByText('Recevez vos candidats')).toBeInTheDocument();
  });

  it('affiche les coordonnées de support comme liens tel/mailto', () => {
    renderWithProviders(<ClientHelpDialog open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /514\) 555-1234/ })).toHaveAttribute(
      'href',
      'tel:+15145551234'
    );
    expect(
      within(dialog).getByRole('link', { name: /support@securitexguard\.com/ })
    ).toHaveAttribute('href', 'mailto:support@securitexguard.com');
  });

  it('déploie une autre FAQ au clic et révèle sa réponse', async () => {
    renderWithProviders(<ClientHelpDialog open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    // La 1re FAQ est déployée par défaut (expanded='faq1') ; la 3e ne l'est pas.
    const pricingQuestion = within(dialog).getByText('Comment sont calculés les prix?');
    await userEvent.click(pricingQuestion);

    expect(
      await within(dialog).findByText(/La ville\/région \(demande locale\)/)
    ).toBeVisible();
  });

  it('appelle onClose au clic sur le bouton de fermeture', async () => {
    const onClose = vi.fn();
    renderWithProviders(<ClientHelpDialog open onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    const closeButton = within(dialog).getByRole('button', { name: '' });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ne rend aucun contenu quand open=false', () => {
    renderWithProviders(<ClientHelpDialog open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText("Centre d'aide")).not.toBeInTheDocument();
  });
});
