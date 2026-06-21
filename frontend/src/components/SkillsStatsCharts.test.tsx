import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within } from '@/test/renderWithProviders';

/**
 * recharts mesure le DOM (ResponsiveContainer => 0px en jsdom) et n'a aucun
 * intérêt à être rendu pour de vrai ici : on le mocke entièrement par des
 * passe-plats. On expose des testids/attributs sur Bar/Pie/Line pour vérifier
 * que le composant alimente les bons graphiques avec les bonnes données.
 */
vi.mock('recharts', () => {
  const PassThrough = ({ children }: { children?: React.ReactNode }) => {
    const C = () => <div data-testid="chart">{children}</div>;
    C.displayName = 'RechartsPassThrough';
    return <C />;
  };

  const ResponsiveContainer = ({ children }: { children?: React.ReactNode }) => {
    const C = () => <div data-testid="responsive-container">{children}</div>;
    C.displayName = 'ResponsiveContainer';
    return <C />;
  };

  const Bar = ({ dataKey }: { dataKey?: string }) => (
    <div data-testid="bar" data-key={dataKey} />
  );
  const Pie = ({
    data,
    children,
  }: {
    data?: unknown[];
    children?: React.ReactNode;
  }) => (
    <div data-testid="pie" data-count={data?.length ?? 0}>
      {children}
    </div>
  );
  const Line = ({ dataKey }: { dataKey?: string }) => (
    <div data-testid="line" data-key={dataKey} />
  );
  const Cell = ({ fill }: { fill?: string }) => (
    <div data-testid="cell" data-fill={fill} />
  );

  const Noop = () => null;

  return {
    ResponsiveContainer,
    BarChart: PassThrough,
    PieChart: PassThrough,
    LineChart: PassThrough,
    Bar,
    Pie,
    Line,
    Cell,
    CartesianGrid: Noop,
    XAxis: Noop,
    YAxis: Noop,
    Tooltip: Noop,
  };
});

import { SkillsStatsCharts, type SkillsStatsChartsProps } from './SkillsStatsCharts';

const makeProps = (
  overrides: Partial<SkillsStatsChartsProps> = {}
): SkillsStatsChartsProps => ({
  categoryDistribution: [
    { category: 'Sécurité', total: 8 },
    { category: 'Logistique', total: 5 },
  ],
  levelDistribution: [
    { level: 'BEGINNER', label: 'Débutant', total: 3 },
    { level: 'EXPERT', label: 'Expert', total: 6 },
  ],
  extractionTimeline: [
    { date: '2026-06-15', total: 2 },
    { date: '2026-06-16', total: 4 },
  ],
  totalCandidates: 13,
  ...overrides,
});

describe('SkillsStatsCharts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend les trois cartes avec leurs titres et le total de candidats', () => {
    renderWithProviders(<SkillsStatsCharts {...makeProps()} />);

    expect(screen.getByText('Répartition par catégorie')).toBeInTheDocument();
    expect(screen.getByText("Niveaux d'expérience")).toBeInTheDocument();
    expect(screen.getByText('Extractions récentes')).toBeInTheDocument();

    // Le pluriel est appliqué dans l'action de l'en-tête + le bloc volume.
    expect(screen.getAllByText('13 candidats').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: '13' })).toBeInTheDocument();
  });

  it('alimente les graphiques avec les bonnes séries (clés + nombre de tranches)', () => {
    renderWithProviders(<SkillsStatsCharts {...makeProps()} />);

    // BarChart sur les catégories, LineChart sur la timeline : dataKey="total".
    const keyedSeries = screen.getAllByTestId(/^(bar|line)$/);
    expect(keyedSeries).toHaveLength(2);
    keyedSeries.forEach((node) => expect(node).toHaveAttribute('data-key', 'total'));

    // Le camembert reçoit autant de tranches que de niveaux, avec une Cell par niveau.
    const pie = screen.getByTestId('pie');
    expect(pie).toHaveAttribute('data-count', '2');
    expect(within(pie).getAllByTestId('cell')).toHaveLength(2);
  });

  it('affiche les messages vides quand toutes les distributions sont vides', () => {
    renderWithProviders(
      <SkillsStatsCharts
        {...makeProps({
          categoryDistribution: [],
          levelDistribution: [],
          extractionTimeline: [],
          totalCandidates: 0,
        })}
      />
    );

    expect(
      screen.getByText('Aucune donnée disponible pour le moment.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Les niveaux apparaîtront après la première recherche.')
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pas encore d'extractions récentes.")
    ).toBeInTheDocument();

    // Aucun graphique n'est rendu en l'absence de données.
    expect(screen.queryByTestId('bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pie')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line')).not.toBeInTheDocument();
  });

  it('utilise le singulier pour un seul candidat', () => {
    renderWithProviders(
      <SkillsStatsCharts {...makeProps({ totalCandidates: 1 })} />
    );

    expect(screen.getByText('1 candidat')).toBeInTheDocument();
    expect(screen.queryByText('1 candidats')).not.toBeInTheDocument();
  });

  it('borne la barre de progression du volume à 100 même au-delà de 100 candidats', () => {
    renderWithProviders(
      <SkillsStatsCharts {...makeProps({ totalCandidates: 250 })} />
    );

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('heading', { name: '250' })).toBeInTheDocument();
  });
});
