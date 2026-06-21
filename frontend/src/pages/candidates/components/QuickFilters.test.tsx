import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import QuickFilters from './QuickFilters';

describe('QuickFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le libellé et les quatre filtres rapides prédéfinis', () => {
    renderWithProviders(<QuickFilters onApplyPreset={vi.fn()} />);

    expect(screen.getByText('Filtres rapides :')).toBeInTheDocument();
    expect(screen.getByText('Urgence 24/7')).toBeInTheDocument();
    expect(screen.getByText('Élite & Excellent')).toBeInTheDocument();
    expect(screen.getByText('Véhiculé')).toBeInTheDocument();
    expect(screen.getByText('Disponible Nuit')).toBeInTheDocument();
  });

  it('applique le preset Urgence 24/7 avec la disponibilité immédiate au clic', async () => {
    const onApplyPreset = vi.fn();
    renderWithProviders(<QuickFilters onApplyPreset={onApplyPreset} />);

    await userEvent.click(screen.getByText('Urgence 24/7'));

    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onApplyPreset).toHaveBeenCalledWith({
      availability: {
        available24_7: true,
        availableImmediately: true,
        availableDays: false,
        availableNights: false,
        availableWeekends: false,
      },
    });
  });

  it('applique le preset Élite & Excellent avec la note minimale 9', async () => {
    const onApplyPreset = vi.fn();
    renderWithProviders(<QuickFilters onApplyPreset={onApplyPreset} />);

    await userEvent.click(screen.getByText('Élite & Excellent'));

    expect(onApplyPreset).toHaveBeenCalledWith({ minRating: 9 });
  });

  it('applique le preset Véhiculé', async () => {
    const onApplyPreset = vi.fn();
    renderWithProviders(<QuickFilters onApplyPreset={onApplyPreset} />);

    await userEvent.click(screen.getByText('Véhiculé'));

    expect(onApplyPreset).toHaveBeenCalledWith({ hasVehicle: true });
  });

  it('applique le preset Disponible Nuit avec uniquement availableNights actif', async () => {
    const onApplyPreset = vi.fn();
    renderWithProviders(<QuickFilters onApplyPreset={onApplyPreset} />);

    await userEvent.click(screen.getByText('Disponible Nuit'));

    expect(onApplyPreset).toHaveBeenCalledWith({
      availability: {
        available24_7: false,
        availableImmediately: false,
        availableDays: false,
        availableNights: true,
        availableWeekends: false,
      },
    });
  });

  it("n'appelle pas onApplyPreset tant qu'aucun filtre n'est cliqué", () => {
    const onApplyPreset = vi.fn();
    renderWithProviders(<QuickFilters onApplyPreset={onApplyPreset} />);

    expect(onApplyPreset).not.toHaveBeenCalled();
  });
});
