import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import AddToCartSuccess from './AddToCartSuccess';

describe('AddToCartSuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le message dans une alerte de succès quand open est vrai', () => {
    renderWithProviders(
      <AddToCartSuccess open onClose={vi.fn()} message="Talent ajouté au panier" />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByText('Talent ajouté au panier')).toBeInTheDocument();
  });

  it("n'affiche rien quand open est faux", () => {
    renderWithProviders(
      <AddToCartSuccess open={false} onClose={vi.fn()} message="Talent ajouté au panier" />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Talent ajouté au panier')).not.toBeInTheDocument();
  });

  it('appelle onClose au clic sur le bouton de fermeture de l’alerte', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AddToCartSuccess open onClose={onClose} message="Ajouté" />);

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('utilise la sévérité succès (variant filled) sur l’alerte', () => {
    renderWithProviders(<AddToCartSuccess open onClose={vi.fn()} message="Ajouté" />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toMatch(/MuiAlert-filledSuccess/);
  });

  it('reflète un message différent passé en prop', () => {
    renderWithProviders(
      <AddToCartSuccess open onClose={vi.fn()} message="2 talents ajoutés au panier" />
    );

    expect(screen.getByText('2 talents ajoutés au panier')).toBeInTheDocument();
    expect(screen.queryByText('Talent ajouté au panier')).not.toBeInTheDocument();
  });
});
