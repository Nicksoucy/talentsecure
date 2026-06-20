import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import { InfoTooltip, PricingTooltip, CandidateTypeTooltips } from './InfoTooltip';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InfoTooltip', () => {
  it('rend une icône d\'aide accessible et garde le contenu masqué tant qu\'on ne survole pas', () => {
    renderWithProviders(<InfoTooltip title="Titre A" content="Détail caché" />);

    // L'icône est rendue (rôle img de l'icône MUI), le contenu du tooltip n'est pas encore monté.
    expect(document.querySelector('svg[data-testid="InfoIcon"]')).toBeInTheDocument();
    expect(screen.queryByText('Détail caché')).not.toBeInTheDocument();
  });

  it('affiche le titre et le contenu texte au survol de l\'icône', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InfoTooltip title="Candidats Évalués" content="Une seule ligne de détail" />);

    await user.hover(document.querySelector('svg[data-testid="InfoIcon"]')!);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Candidats Évalués');
    expect(tooltip).toHaveTextContent('Une seule ligne de détail');
  });

  it('rend un contenu tableau sous forme de liste à puces (un <li> par entrée)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InfoTooltip title="Liste" content={['Premier point', 'Deuxième point', 'Troisième point']} />
    );

    await user.hover(document.querySelector('svg[data-testid="InfoIcon"]')!);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Premier point');
    expect(items[2]).toHaveTextContent('Troisième point');
  });

  it('affiche le bloc tarification "Prix: min$ - max$" uniquement quand pricing est fourni', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InfoTooltip title="Avec prix" content="Détail" pricing={{ min: '15', max: '45' }} />
    );

    await user.hover(document.querySelector('svg[data-testid="InfoIcon"]')!);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Prix: 15$ - 45$');
  });

  it('n\'affiche aucun bloc tarification quand pricing est absent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InfoTooltip title="Sans prix" content="Détail" />);

    await user.hover(document.querySelector('svg[data-testid="InfoIcon"]')!);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Sans prix');
    expect(tooltip).not.toHaveTextContent(/Prix:/);
  });
});

describe('PricingTooltip', () => {
  it('injecte le nom de la ville dans le titre du tooltip', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PricingTooltip city="Montréal" />);

    await user.hover(document.querySelector('svg[data-testid="InfoIcon"]')!);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Tarification pour Montréal');
    expect(tooltip).toHaveTextContent('Les prix varient selon la demande locale');
  });
});

describe('CandidateTypeTooltips', () => {
  it('expose le tooltip "Évalués (Premium)" avec son prix et ses puces au survol', async () => {
    const user = userEvent.setup();
    renderWithProviders(<>{CandidateTypeTooltips.evaluated}</>);

    await user.hover(document.querySelector('svg[data-testid="InfoIcon"]')!);

    const tooltip = await screen.findByRole('tooltip');
    await waitFor(() => expect(tooltip).toHaveTextContent('Candidats Évalués (Premium)'));
    expect(tooltip).toHaveTextContent('Vérifications de références effectuées');
    expect(tooltip).toHaveTextContent('Prix: 15$ - 45$');
  });
});
