import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import CandidateTabs, { CustomTabPanel } from './CandidateTabs';

describe('CandidateTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rend les quatre onglets avec leurs libellés', () => {
    renderWithProviders(
      <CandidateTabs value={0} onChange={vi.fn()}>
        <div>contenu</div>
      </CandidateTabs>
    );

    const tablist = screen.getByRole('tablist', { name: /candidate details tabs/i });
    expect(within(tablist).getByRole('tab', { name: "Vue d'ensemble" })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Expérience & Compétences' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Documents & Média' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Évaluation' })).toBeInTheDocument();
  });

  it("marque comme sélectionné l'onglet correspondant à la prop value", () => {
    renderWithProviders(
      <CandidateTabs value={2} onChange={vi.fn()}>
        <div>contenu</div>
      </CandidateTabs>
    );

    expect(screen.getByRole('tab', { name: 'Documents & Média' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: "Vue d'ensemble" })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it("appelle onChange avec l'index de l'onglet cliqué", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <CandidateTabs value={0} onChange={onChange}>
        <div>contenu</div>
      </CandidateTabs>
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Évaluation' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    // MUI passe (event, newValue) : on vérifie l'index transmis.
    expect(onChange.mock.calls[0][1]).toBe(3);
  });

  it('rend les enfants passés (panneaux) sous la barre d\'onglets', () => {
    renderWithProviders(
      <CandidateTabs value={1} onChange={vi.fn()}>
        <div>Contenu du panneau actif</div>
      </CandidateTabs>
    );

    expect(screen.getByText('Contenu du panneau actif')).toBeInTheDocument();
  });

  it('CustomTabPanel affiche son contenu quand value === index', () => {
    renderWithProviders(<CustomTabPanel value={1} index={1}>Panneau visible</CustomTabPanel>);

    const panel = screen.getByRole('tabpanel');
    expect(panel).not.toHaveAttribute('hidden');
    expect(within(panel).getByText('Panneau visible')).toBeInTheDocument();
  });

  it('CustomTabPanel masque et ne monte pas son contenu quand value !== index', () => {
    renderWithProviders(<CustomTabPanel value={0} index={2}>Panneau caché</CustomTabPanel>);

    expect(screen.getByRole('tabpanel', { hidden: true })).toHaveAttribute('hidden');
    expect(screen.queryByText('Panneau caché')).not.toBeInTheDocument();
  });
});
