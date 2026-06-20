import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, within } from '@/test/renderWithProviders';
import QuickOverview from './QuickOverview';
import { makeCandidate } from '@/test/factories';
import type { Language, Experience } from '@/types';

const makeLanguage = (overrides: Partial<Language> = {}): Language => ({
  id: 'lang-1',
  candidateId: 'cand-1',
  language: 'Français',
  level: 'LANGUE_MATERNELLE',
  ...overrides,
});

const makeExperience = (overrides: Partial<Experience> = {}): Experience => ({
  id: 'exp-1',
  candidateId: 'cand-1',
  companyName: 'Acme',
  position: 'Agent',
  isCurrent: false,
  ...overrides,
});

describe('QuickOverview', () => {
  it('affiche le titre, les sections et un BSP valide avec sa date d\'expiration', () => {
    renderWithProviders(
      <QuickOverview
        candidate={makeCandidate({
          hasBSP: true,
          bspExpiryDate: '2027-12-31T00:00:00.000Z',
        })}
      />
    );

    expect(screen.getByRole('heading', { name: /aperçu rapide/i })).toBeInTheDocument();
    expect(screen.getByText(/critères essentiels/i)).toBeInTheDocument();
    expect(screen.getByText(/disponibilité/i)).toBeInTheDocument();

    // BSP valide → libellé "Valide" + caption d'expiration avec la date formatée fr-CA (année 2027).
    // Le préfixe "(exp:" et la date sont rendus dans deux éléments distincts.
    expect(screen.getByText('Valide')).toBeInTheDocument();
    expect(screen.getByText(/\(exp:/)).toBeInTheDocument();
    expect(screen.getByText(/2027-12-\d{2}/)).toBeInTheDocument();
  });

  it('affiche "Non" pour un candidat sans BSP ni véhicule', () => {
    renderWithProviders(
      <QuickOverview candidate={makeCandidate({ hasBSP: false, hasVehicle: false })} />
    );

    expect(screen.queryByText('Valide')).not.toBeInTheDocument();
    // BSP et Véhicule affichent tous deux "Non"
    expect(screen.getAllByText('Non').length).toBeGreaterThanOrEqual(2);
  });

  it('liste les langues quand elles sont fournies, sinon "Non spécifié"', () => {
    const { unmount } = renderWithProviders(
      <QuickOverview
        candidate={makeCandidate({
          languages: [
            makeLanguage({ id: 'l1', language: 'Français' }),
            makeLanguage({ id: 'l2', language: 'Anglais' }),
          ],
        })}
      />
    );

    expect(screen.getByText('Français, Anglais')).toBeInTheDocument();
    unmount();

    // Sans langues ni expériences, "Non spécifié" apparaît pour les langues et l'historique.
    renderWithProviders(
      <QuickOverview candidate={makeCandidate({ languages: [], experiences: [] })} />
    );
    expect(screen.getAllByText('Non spécifié').length).toBeGreaterThanOrEqual(2);
  });

  it('résume la disponibilité 24/7 et le statut "disponible immédiatement"', () => {
    renderWithProviders(
      <QuickOverview
        candidate={makeCandidate({ available24_7: true, availableImmediately: true })}
      />
    );

    expect(screen.getByText(/24\/7 \(Jour, Nuit, FDS\)/)).toBeInTheDocument();
    expect(screen.getByText('Disponible immédiatement')).toBeInTheDocument();
  });

  it('affiche le nombre de postes listés dans l\'historique', () => {
    renderWithProviders(
      <QuickOverview
        candidate={makeCandidate({
          experiences: [
            makeExperience({ id: 'e1' }),
            makeExperience({ id: 'e2' }),
          ],
        })}
      />
    );

    expect(screen.getByText('2 poste(s) listé(s)')).toBeInTheDocument();
  });

  it('rend les badges de certification (BSP, RCR) pour un candidat qualifié', () => {
    renderWithProviders(
      <QuickOverview
        candidate={makeCandidate({ hasBSP: true, hasRCR: true })}
      />
    );

    const badgesSection = screen.getByText(/badges & certifications/i).closest('div');
    expect(badgesSection).not.toBeNull();
    expect(within(badgesSection as HTMLElement).getByText('BSP')).toBeInTheDocument();
    expect(within(badgesSection as HTMLElement).getByText('RCR')).toBeInTheDocument();
  });
});
