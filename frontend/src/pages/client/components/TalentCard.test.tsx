import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import TalentCard from './TalentCard';
import type { TalentPreview } from '@/services/talent-marketplace.service';

const makeTalent = (overrides: Partial<TalentPreview> = {}): TalentPreview => ({
  id: 'talent-1',
  firstName: 'Marie',
  city: 'Montréal',
  province: 'QC',
  globalRating: 8.4,
  status: 'PUBLISHED',
  available24_7: false,
  availableDays: true,
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
});

describe('TalentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le prénom anonymisé, la localisation et la note sur 10', () => {
    renderWithProviders(
      <TalentCard
        talent={makeTalent({ firstName: 'Marie', city: 'Laval', province: 'QC', globalRating: 8.4 })}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    );

    // Le nom est masqué : seul le prénom est visible, suivi de puces.
    expect(screen.getByRole('heading', { name: /Marie/ })).toHaveTextContent('Marie ••••');
    expect(screen.getByText('Laval, QC')).toBeInTheDocument();
    // La note brute (8.4) est affichée formatée sur 10.
    expect(screen.getByText('8.4/10')).toBeInTheDocument();
  });

  it('rend les puces de certification et de disponibilité selon les drapeaux du talent', () => {
    renderWithProviders(
      <TalentCard
        talent={makeTalent({
          hasBSP: true,
          hasVehicle: true,
          vehicleType: 'Camion',
          available24_7: true,
          availableImmediately: true,
          hasVideo: true,
        })}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    );

    expect(screen.getByText('BSP')).toBeInTheDocument();
    // vehicleType prime sur le libellé générique "Véhicule".
    expect(screen.getByText('Camion')).toBeInTheDocument();
    expect(screen.getByText('24/7')).toBeInTheDocument();
    expect(screen.getByText('Dispo immédiat')).toBeInTheDocument();
    expect(screen.getByText('Vidéo')).toBeInTheDocument();
    // Drapeaux absents → pas de puce "Acheté".
    expect(screen.queryByText('Acheté')).not.toBeInTheDocument();
  });

  it('n\'affiche pas les puces optionnelles quand les drapeaux sont faux', () => {
    renderWithProviders(
      <TalentCard talent={makeTalent()} selected={false} onToggleSelect={vi.fn()} />
    );

    expect(screen.queryByText('BSP')).not.toBeInTheDocument();
    expect(screen.queryByText('24/7')).not.toBeInTheDocument();
    expect(screen.queryByText('Dispo immédiat')).not.toBeInTheDocument();
    expect(screen.queryByText('Vidéo')).not.toBeInTheDocument();
    expect(screen.queryByText('Acheté')).not.toBeInTheDocument();
  });

  it('limite l\'expérience à 2 entrées et convertit la durée en années', () => {
    renderWithProviders(
      <TalentCard
        talent={makeTalent({
          experiences: [
            { position: 'Agent de sécurité', companyName: 'A', durationMonths: 36, isCurrent: true },
            { position: 'Gardien', companyName: 'B', durationMonths: null, isCurrent: false },
            { position: 'Patrouilleur', companyName: 'C', durationMonths: 60, isCurrent: false },
          ],
        })}
        selected={false}
        onToggleSelect={vi.fn()}
      />
    );

    // 36 mois → 3 ans.
    expect(screen.getByText('• Agent de sécurité - 3 ans')).toBeInTheDocument();
    // durationMonths null → "N/A".
    expect(screen.getByText('• Gardien - N/A')).toBeInTheDocument();
    // 3e expérience tronquée (slice 0,2).
    expect(screen.queryByText(/Patrouilleur/)).not.toBeInTheDocument();
  });

  it('appelle onToggleSelect avec l\'id du talent au clic sur le bouton favori', async () => {
    const onToggleSelect = vi.fn();
    renderWithProviders(
      <TalentCard
        talent={makeTalent({ id: 'talent-42' })}
        selected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith('talent-42');
  });

  it('adapte le libellé du bouton à l\'état "acheté" et déclenche onOpenDetail', async () => {
    const onOpenDetail = vi.fn();

    const { rerender } = renderWithProviders(
      <TalentCard
        talent={makeTalent({ id: 'talent-7', purchased: false })}
        selected={false}
        onToggleSelect={vi.fn()}
        onOpenDetail={onOpenDetail}
      />
    );

    const cta = screen.getByRole('button', { name: /Voir le profil & acheter/ });
    expect(cta).toBeInTheDocument();
    await userEvent.click(cta);
    expect(onOpenDetail).toHaveBeenCalledWith('talent-7');

    // Une fois acheté, le libellé et la puce "Acheté" changent.
    rerender(
      <TalentCard
        talent={makeTalent({ id: 'talent-7', purchased: true })}
        selected={false}
        onToggleSelect={vi.fn()}
        onOpenDetail={onOpenDetail}
      />
    );

    expect(screen.getByRole('button', { name: /Voir les coordonnées/ })).toBeInTheDocument();
    expect(screen.getByText('Acheté')).toBeInTheDocument();
  });

  it('reflète l\'état sélectionné via la case à cocher', () => {
    const { rerender } = renderWithProviders(
      <TalentCard talent={makeTalent()} selected={false} onToggleSelect={vi.fn()} />
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    rerender(<TalentCard talent={makeTalent()} selected onToggleSelect={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
