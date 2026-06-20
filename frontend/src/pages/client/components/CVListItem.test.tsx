import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';
import CVListItem from './CVListItem';
import type { TalentPreview } from '@/services/talent-marketplace.service';

function makeTalent(overrides: Partial<TalentPreview> = {}): TalentPreview {
  return {
    id: 'talent-1',
    firstName: 'Jean',
    city: 'Montréal',
    province: 'QC',
    globalRating: 0,
    status: 'CV_ONLY',
    available24_7: false,
    availableDays: false,
    availableNights: false,
    availableWeekends: false,
    availableImmediately: false,
    hasBSP: false,
    bspExpiryDate: null,
    hasDriverLicense: false,
    hasVehicle: false,
    vehicleType: null,
    hasRCR: false,
    experiences: [],
    languages: [],
    skills: [],
    ...overrides,
  };
}

describe('CVListItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le prénom masqué, la ville/province et le badge « CV Disponible »', () => {
    renderWithProviders(
      <CVListItem talent={makeTalent({ firstName: 'Jean', city: 'Montréal', province: 'QC' })} selected={false} onToggleSelect={vi.fn()} />
    );

    // Le nom est masqué : seul le prénom est visible, suivi de puces.
    expect(screen.getByText(/Jean\s*••••/)).toBeInTheDocument();
    expect(screen.getByText('Montréal, QC')).toBeInTheDocument();
    // Le badge CV est toujours présent.
    expect(screen.getByText('CV Disponible')).toBeInTheDocument();
  });

  it('reflète l\'état sélectionné via la case à cocher', () => {
    const { unmount } = renderWithProviders(
      <CVListItem talent={makeTalent()} selected={false} onToggleSelect={vi.fn()} />
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    unmount();

    renderWithProviders(
      <CVListItem talent={makeTalent()} selected onToggleSelect={vi.fn()} />
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('rend uniquement les badges de disponibilité actifs avec l\'id du talent', async () => {
    renderWithProviders(
      <CVListItem
        talent={makeTalent({
          available24_7: true,
          hasVehicle: true,
          availableDays: false,
          availableNights: false,
          availableWeekends: false,
        })}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    );

    expect(screen.getByText('24/7')).toBeInTheDocument();
    expect(screen.getByText('Véhicule')).toBeInTheDocument();
    // Les disponibilités désactivées ne sont pas rendues.
    expect(screen.queryByText('Jour')).not.toBeInTheDocument();
    expect(screen.queryByText('Nuit')).not.toBeInTheDocument();
    expect(screen.queryByText('Weekend')).not.toBeInTheDocument();
  });

  it('affiche tous les badges de disponibilité quand ils sont actifs', () => {
    renderWithProviders(
      <CVListItem
        talent={makeTalent({
          available24_7: true,
          availableDays: true,
          availableNights: true,
          availableWeekends: true,
          hasVehicle: true,
        })}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    );

    expect(screen.getByText('24/7')).toBeInTheDocument();
    expect(screen.getByText('Jour')).toBeInTheDocument();
    expect(screen.getByText('Nuit')).toBeInTheDocument();
    expect(screen.getByText('Weekend')).toBeInTheDocument();
    expect(screen.getByText('Véhicule')).toBeInTheDocument();
  });

  it('appelle onToggleSelect avec l\'id du talent au clic sur la case à cocher', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderWithProviders(
      <CVListItem talent={makeTalent({ id: 'talent-42' })} selected={false} onToggleSelect={onToggleSelect} />
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith('talent-42');
  });

  it('appelle onToggleSelect au clic sur la carte (Paper)', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderWithProviders(
      <CVListItem talent={makeTalent({ id: 'talent-7' })} selected={false} onToggleSelect={onToggleSelect} />
    );

    // Cliquer sur le prénom déclenche le onClick du Paper parent.
    await user.click(screen.getByText(/Jean\s*••••/));

    expect(onToggleSelect).toHaveBeenCalledWith('talent-7');
  });
});
