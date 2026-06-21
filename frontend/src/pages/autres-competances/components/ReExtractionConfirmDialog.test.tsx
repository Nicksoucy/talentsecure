import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent } from '@/test/renderWithProviders';
import ReExtractionConfirmDialog from './ReExtractionConfirmDialog';

describe('ReExtractionConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'affiche pas le contenu du dialogue quand open=false", () => {
    renderWithProviders(
      <ReExtractionConfirmDialog
        open={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        prospectName="Jean Tremblay"
        existingSkillsCount={3}
      />
    );

    // MUI ne monte pas le contenu du Dialog tant qu'il n'est pas ouvert.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Ré-extraction de Compétences')).not.toBeInTheDocument();
  });

  it('affiche le titre, le nom du prospect et le coût estimé par défaut', () => {
    renderWithProviders(
      <ReExtractionConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        prospectName="Jean Tremblay"
        existingSkillsCount={3}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Ré-extraction de Compétences')).toBeInTheDocument();
    expect(within(dialog).getByText('Jean Tremblay')).toBeInTheDocument();
    // estimatedCost a une valeur par défaut de 0.05 → formaté sur 4 décimales.
    expect(within(dialog).getByText('$0.0500')).toBeInTheDocument();
    // Au montage, le mode "merge" est sélectionné → le CTA propose "Fusionner".
    expect(within(dialog).getByRole('button', { name: /Continuer \(Fusionner\)/ })).toBeInTheDocument();
  });

  it('pluralise le compte de compétences (singulier vs pluriel) et reflète le coût fourni', () => {
    const { rerender } = renderWithProviders(
      <ReExtractionConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        prospectName="Marie Lavoie"
        existingSkillsCount={1}
        estimatedCost={0.1234}
      />
    );

    // existingSkillsCount = 1 → singulier "1 compétence extraite".
    expect(screen.getByText('Ce prospect a déjà 1 compétence extraite')).toBeInTheDocument();
    expect(screen.getByText('$0.1234')).toBeInTheDocument();

    rerender(
      <ReExtractionConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        prospectName="Marie Lavoie"
        existingSkillsCount={5}
        estimatedCost={0.1234}
      />
    );

    // existingSkillsCount > 1 → pluriel "5 compétences extraites".
    expect(screen.getByText('Ce prospect a déjà 5 compétences extraites')).toBeInTheDocument();
  });

  it('confirme avec le mode "merge" par défaut puis ferme le dialogue', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderWithProviders(
      <ReExtractionConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        prospectName="Jean Tremblay"
        existingSkillsCount={2}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Continuer \(Fusionner\)/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('merge');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirme avec le mode "replace" après sélection du radio Remplacer', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderWithProviders(
      <ReExtractionConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        prospectName="Jean Tremblay"
        existingSkillsCount={2}
      />
    );

    // Sélectionne le mode "replace" via son radio.
    await userEvent.click(screen.getByRole('radio', { name: /Remplacer/ }));

    // Le CTA bascule pour refléter le mode choisi.
    const confirmBtn = screen.getByRole('button', { name: /Continuer \(Remplacer\)/ });
    await userEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('replace');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('appelle onClose sans onConfirm au clic sur Annuler', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderWithProviders(
      <ReExtractionConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        prospectName="Jean Tremblay"
        existingSkillsCount={2}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
