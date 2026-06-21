import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';

import { TableSkeleton } from './TableSkeleton';

beforeEach(() => {
  vi.clearAllMocks();
});

const countSkeletons = (container: HTMLElement) =>
  container.querySelectorAll('.MuiSkeleton-root').length;

describe('TableSkeleton', () => {
  it('rend des skeletons MUI sans crash avec les props par défaut', () => {
    const { container } = renderWithProviders(<TableSkeleton />);
    expect(countSkeletons(container)).toBeGreaterThan(0);
  });

  it('génère une ligne de tableau par valeur de rows', () => {
    const { container } = renderWithProviders(
      <TableSkeleton rows={3} columns={2} hasHeader={false} hasFilters={false} hasActions={false} />
    );
    // 1 header row + 3 body rows
    expect(container.querySelectorAll('tr')).toHaveLength(4);
    // header: 2 colonnes ; body: 3 lignes * 2 colonnes
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('td')).toHaveLength(6);
  });

  it('augmente le nombre de skeletons quand rows et columns augmentent', () => {
    const { container: small } = renderWithProviders(
      <TableSkeleton rows={2} columns={2} />
    );
    const { container: large } = renderWithProviders(
      <TableSkeleton rows={8} columns={5} />
    );
    expect(countSkeletons(large)).toBeGreaterThan(countSkeletons(small));
  });

  it('ajoute une colonne actions (th + boutons circulaires) quand hasActions est vrai', () => {
    const { container } = renderWithProviders(
      <TableSkeleton rows={1} columns={2} hasActions={true} />
    );
    // 2 colonnes de données + 1 colonne actions = 3 en-têtes
    expect(container.querySelectorAll('th')).toHaveLength(3);
    expect(container.querySelectorAll('.MuiSkeleton-circular').length).toBeGreaterThan(0);
  });

  it('masque la colonne actions quand hasActions est faux', () => {
    const { container } = renderWithProviders(
      <TableSkeleton rows={1} columns={2} hasActions={false} />
    );
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('.MuiSkeleton-circular')).toHaveLength(0);
  });

  it('ne rend ni en-tête ni filtres quand hasHeader et hasFilters sont faux', () => {
    const withChrome = renderWithProviders(
      <TableSkeleton rows={1} columns={2} hasHeader hasFilters />
    );
    const withoutChrome = renderWithProviders(
      <TableSkeleton rows={1} columns={2} hasHeader={false} hasFilters={false} />
    );
    // sans header ni filtres → strictement moins de skeletons
    expect(countSkeletons(withoutChrome.container)).toBeLessThan(
      countSkeletons(withChrome.container)
    );
    // pas de carte filtres (MuiCard) résiduelle pour le header/filtres
    expect(withoutChrome.container.querySelectorAll('.MuiCard-root')).toHaveLength(1);
  });
});
