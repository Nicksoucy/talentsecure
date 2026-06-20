import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/renderWithProviders';
import CandidateBadges from './CandidateBadges';

describe('CandidateBadges', () => {
  it('affiche les badges de certifications passés en props', () => {
    renderWithProviders(<CandidateBadges hasBSP hasRCR hasSSIAP hasVehicle />);

    expect(screen.getByText('BSP')).toBeInTheDocument();
    expect(screen.getByText('RCR')).toBeInTheDocument();
    expect(screen.getByText('SSIAP')).toBeInTheDocument();
    expect(screen.getByText('Véhicule')).toBeInTheDocument();
  });

  it('ne rend rien quand aucune donnée ne justifie un badge', () => {
    const { container } = renderWithProviders(<CandidateBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it('24/7 prend le dessus sur les disponibilités partielles (mutuellement exclusifs)', () => {
    renderWithProviders(
      <CandidateBadges available24_7 availableDays availableNights availableWeekends />
    );

    expect(screen.getByText('24/7')).toBeInTheDocument();
    // Le badge agrégé Jour/Nuit/FDS ne doit pas apparaître si 24/7 est actif.
    expect(screen.queryByText('Jour/Nuit/FDS')).not.toBeInTheDocument();
  });

  it('agrège les disponibilités partielles quand 24/7 est absent', () => {
    renderWithProviders(<CandidateBadges availableDays availableWeekends />);

    expect(screen.getByText('Jour/FDS')).toBeInTheDocument();
    expect(screen.queryByText('24/7')).not.toBeInTheDocument();
  });

  it('affiche la note seulement au-dessus du seuil (>= 7)', () => {
    const { unmount } = renderWithProviders(<CandidateBadges globalRating={9} />);
    expect(screen.getByText('9/10')).toBeInTheDocument();
    unmount();

    renderWithProviders(<CandidateBadges globalRating={5} />);
    expect(screen.queryByText('5/10')).not.toBeInTheDocument();
  });

  it('limite l\'affichage à maxBadges et indique le surplus avec +N', () => {
    renderWithProviders(
      <CandidateBadges hasBSP hasRCR hasSSIAP hasVehicle maxBadges={2} />
    );

    // 2 premiers badges visibles (ordre : BSP puis RCR).
    expect(screen.getByText('BSP')).toBeInTheDocument();
    expect(screen.getByText('RCR')).toBeInTheDocument();
    // Les badges au-delà de la limite sont masqués.
    expect(screen.queryByText('SSIAP')).not.toBeInTheDocument();
    expect(screen.queryByText('Véhicule')).not.toBeInTheDocument();
    // Indicateur de surplus.
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
