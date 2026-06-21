import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';

import { DetailPageSkeleton } from './DetailPageSkeleton';

const countSkeletons = (container: HTMLElement) =>
  container.querySelectorAll('.MuiSkeleton-root').length;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DetailPageSkeleton', () => {
  it('rend sans crash et affiche des squelettes MUI', () => {
    const { container } = renderWithProviders(<DetailPageSkeleton />);
    expect(countSkeletons(container)).toBeGreaterThan(0);
  });

  it('affiche le squelette du bouton retour par défaut (hasBackButton implicite)', () => {
    const { container } = renderWithProviders(<DetailPageSkeleton />);
    const withButton = countSkeletons(container);

    const { container: noButtonContainer } = renderWithProviders(
      <DetailPageSkeleton hasBackButton={false} />
    );
    const withoutButton = countSkeletons(noButtonContainer);

    // Le bouton retour ajoute exactement un squelette supplémentaire.
    expect(withButton).toBe(withoutButton + 1);
  });

  it('plus de sections => plus de squelettes rendus', () => {
    const { container: few } = renderWithProviders(<DetailPageSkeleton sections={1} />);
    const { container: many } = renderWithProviders(<DetailPageSkeleton sections={6} />);
    expect(countSkeletons(many)).toBeGreaterThan(countSkeletons(few));
  });

  it('sections=0 ne crash pas et rend tout de même les sections fixes (liste + activité)', () => {
    const { container } = renderWithProviders(
      <DetailPageSkeleton sections={0} hasBackButton={false} />
    );
    // Header + section liste + section activité produisent toujours des squelettes.
    expect(countSkeletons(container)).toBeGreaterThan(0);
  });

  it('rend des cartes MUI pour structurer les sections', () => {
    const { container } = renderWithProviders(<DetailPageSkeleton sections={2} />);
    // 2 sections dynamiques + liste + activité = 4 cartes.
    expect(container.querySelectorAll('.MuiCard-root').length).toBe(4);
  });

  it('inclut des squelettes circulaires (avatars de la liste et de la timeline)', () => {
    const { container } = renderWithProviders(<DetailPageSkeleton />);
    expect(
      container.querySelectorAll('.MuiSkeleton-circular').length
    ).toBeGreaterThan(0);
  });
});
