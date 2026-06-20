import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import StatCard from './StatCard';

describe('StatCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la valeur, le titre et le sous-titre', () => {
    renderWithProviders(
      <StatCard
        title="Candidats"
        value={408}
        icon={<span data-testid="icon">i</span>}
        color="#1976d2"
        subtitle="408 / 1312"
      />
    );

    expect(screen.getByText('408')).toBeInTheDocument();
    expect(screen.getByText('Candidats')).toBeInTheDocument();
    expect(screen.getByText('408 / 1312')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('en chargement, masque la valeur et la tendance au profit du skeleton', () => {
    const { container } = renderWithProviders(
      <StatCard
        title="Score moyen"
        value="9.5"
        icon={<span>i</span>}
        color="#2e7d32"
        trend={{ label: '+3 cette semaine' }}
        loading
      />
    );

    // La valeur n'est pas rendue pendant le chargement.
    expect(screen.queryByText('9.5')).not.toBeInTheDocument();
    // Le chip de tendance est masqué pendant le chargement.
    expect(screen.queryByText('+3 cette semaine')).not.toBeInTheDocument();
    // Le titre reste affiché.
    expect(screen.getByText('Score moyen')).toBeInTheDocument();
    // Le skeleton MUI est présent.
    expect(container.querySelector('.MuiSkeleton-root')).not.toBeNull();
  });

  it('rend un chip de tendance positif avec la couleur success par défaut', () => {
    renderWithProviders(
      <StatCard
        title="Nouveaux"
        value={12}
        icon={<span>i</span>}
        color="#1976d2"
        trend={{ label: '+3 cette semaine' }}
      />
    );

    const chip = screen.getByText('+3 cette semaine').closest('.MuiChip-root');
    expect(chip).not.toBeNull();
    expect(chip).toHaveClass('MuiChip-colorSuccess');
  });

  it('rend un chip de tendance négatif sans la couleur success', () => {
    renderWithProviders(
      <StatCard
        title="Inactifs"
        value={5}
        icon={<span>i</span>}
        color="#d32f2f"
        trend={{ label: '-2 cette semaine', positive: false }}
      />
    );

    const chip = screen.getByText('-2 cette semaine').closest('.MuiChip-root');
    expect(chip).not.toBeNull();
    expect(chip).not.toHaveClass('MuiChip-colorSuccess');
    expect(chip).toHaveClass('MuiChip-colorDefault');
  });

  it('déclenche onClick quand la carte est cliquée', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <StatCard
        title="Candidats"
        value={408}
        icon={<span>i</span>}
        color="#1976d2"
        onClick={onClick}
      />
    );

    await userEvent.click(screen.getByText('Candidats'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('n\'affiche pas de sous-titre quand il est absent', () => {
    renderWithProviders(
      <StatCard
        title="Candidats"
        value={408}
        icon={<span>i</span>}
        color="#1976d2"
      />
    );

    expect(screen.queryByText('408 / 1312')).not.toBeInTheDocument();
  });
});
