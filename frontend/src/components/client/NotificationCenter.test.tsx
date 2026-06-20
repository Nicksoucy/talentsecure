import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within, userEvent, waitFor } from '@/test/renderWithProviders';
import NotificationCenter from './NotificationCenter';

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le badge avec le nombre de notifications non lues et garde le panneau fermé au départ', () => {
    renderWithProviders(<NotificationCenter />);

    // 2 des 3 notifications de départ sont non lues → badge = 2.
    expect(screen.getByText('2')).toBeInTheDocument();
    // Le Popover n'est pas ouvert : aucun titre « Notifications » visible.
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('ouvre le panneau au clic sur la cloche et liste les notifications de départ', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);

    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Demande soumise avec succès')).toBeInTheDocument();
    expect(screen.getByText('Nouveaux candidats disponibles')).toBeInTheDocument();
    expect(screen.getByText('Demande en attente')).toBeInTheDocument();
    // Les deux non lues portent un chip « Nouveau ».
    expect(screen.getAllByText('Nouveau')).toHaveLength(2);
  });

  it('marque tout comme lu : le chip « Nouveau » disparaît et le badge tombe à 0', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);

    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByRole('button', { name: 'Tout marquer comme lu' }));

    // Plus aucun chip « Nouveau » et l'action de masse disparaît (unreadCount === 0).
    await waitFor(() => expect(screen.queryByText('Nouveau')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).not.toBeInTheDocument();
  });

  it('marque une notification individuelle comme lue au clic sur l\'item', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);

    await user.click(screen.getByRole('button'));

    const item = (await screen.findByText('Demande soumise avec succès')).closest('li') as HTMLElement;
    await user.click(item);

    // Une seule des deux non lues a été lue → il reste un seul chip « Nouveau ».
    await waitFor(() => expect(screen.getAllByText('Nouveau')).toHaveLength(1));
    // « Tout marquer comme lu » reste affiché car il reste 1 non lue.
    expect(screen.getByRole('button', { name: 'Tout marquer comme lu' })).toBeInTheDocument();
  });

  it('supprime une notification via son bouton de fermeture sans la marquer comme lue', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);

    await user.click(screen.getByRole('button'));

    const item = (await screen.findByText('Demande soumise avec succès')).closest('li') as HTMLElement;
    // Le bouton de fermeture (CloseIcon) est l'unique bouton dans l'item.
    await user.click(within(item).getByRole('button'));

    // La notification a disparu de la liste.
    await waitFor(() => expect(screen.queryByText('Demande soumise avec succès')).not.toBeInTheDocument());
    // stopPropagation : l'autre non lue n'a pas été marquée lue → il reste un chip « Nouveau ».
    expect(screen.getAllByText('Nouveau')).toHaveLength(1);
  });

  it('affiche l\'état vide après suppression de toutes les notifications', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationCenter />);

    await user.click(screen.getByRole('button'));

    // Supprime les trois items un par un (toujours le premier item restant).
    for (const title of [
      'Demande soumise avec succès',
      'Nouveaux candidats disponibles',
      'Demande en attente',
    ]) {
      const item = (await screen.findByText(title)).closest('li') as HTMLElement;
      await user.click(within(item).getByRole('button'));
      await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    }

    expect(screen.getByText('Aucune notification')).toBeInTheDocument();
  });
});
