import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/renderWithProviders';
import ProspectAvailability from './ProspectAvailability';

/**
 * Disponibilités déclarées au formulaire GHL « Renseignements étudiants ».
 * Elles restaient noyées dans le JSON brut des réponses ; elles ont désormais
 * leur propre encadré sur la fiche prospect.
 */
describe('ProspectAvailability', () => {
  it('affiche une puce par quart déclaré, « Soir » compris', () => {
    renderWithProviders(<ProspectAvailability availableEvenings availableWeekends />);

    expect(screen.getByText('Soir')).toBeInTheDocument();
    expect(screen.getByText('FDS')).toBeInTheDocument();
    expect(screen.queryByText('Jour')).not.toBeInTheDocument();
  });

  it('24/7 remplace la liste détaillée', () => {
    renderWithProviders(<ProspectAvailability available24_7 availableDays availableNights />);

    expect(screen.getByText('24/7')).toBeInTheDocument();
    expect(screen.queryByText('Jour')).not.toBeInTheDocument();
  });

  it('affiche « Non spécifié » quand rien n\'est déclaré', () => {
    renderWithProviders(<ProspectAvailability />);

    expect(screen.getByText('Non spécifié')).toBeInTheDocument();
  });
});
