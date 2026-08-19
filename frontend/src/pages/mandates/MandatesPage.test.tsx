import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import type { Mandate } from '@/types/mandate';

// La page lit ses données via TanStack Query → on mocke le service appelé.
vi.mock('@/services/mandate.service', () => ({
  mandateService: {
    getMandates: vi.fn(),
    getMandate: vi.fn(),
    updateProfile: vi.fn(),
    getCandidates: vi.fn(),
  },
}));

import { mandateService } from '@/services/mandate.service';
import MandatesPage from './MandatesPage';

const getMandates = vi.mocked(mandateService.getMandates);
const getCandidates = vi.mocked(mandateService.getCandidates);
const updateProfile = vi.mocked(mandateService.updateProfile);

function makeMandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: 'm-1',
    externalId: 'GAR-000001',
    name: 'Tour Montréal',
    address: '1 Place Ville Marie',
    city: 'Montréal',
    province: 'QC',
    postalCode: 'H3B 2C1',
    lat: 45.5019,
    lng: -73.5674,
    geocodeSource: 'address',
    requiresBSP: true,
    requiresDriverLicense: false,
    requiresVehicle: false,
    requiredLanguages: ['FR'],
    shiftDays: false,
    shiftEvenings: false,
    shiftNights: true,
    shiftWeekends: false,
    siteType: 'STATIQUE',
    conflictFrequency: 2,
    publicContact: 3,
    monotony: 5,
    autonomy: 5,
    outdoorExposure: 1,
    physicalDemand: 2,
    clientName: 'Client A',
    headcount: 2,
    notes: null,
    isActive: true,
    profileUpdatedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

function mockList(mandates: Mandate[]) {
  getMandates.mockResolvedValue({
    data: mandates,
    meta: { total: mandates.length, page: 1, limit: 25, totalPages: 1 },
  });
}

describe('MandatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les mandats avec leurs quarts et exigences', async () => {
    mockList([makeMandate()]);
    renderWithProviders(<MandatesPage />);

    expect(await screen.findByText('Tour Montréal')).toBeInTheDocument();
    expect(screen.getByText('GAR-000001 · Client A')).toBeInTheDocument();
    expect(screen.getByText('Nuit')).toBeInTheDocument();
    expect(screen.getByText('BSP')).toBeInTheDocument();
    expect(screen.getByText('Poste statique')).toBeInTheDocument();
  });

  it('distingue un mandat coté d un mandat à coter', async () => {
    mockList([
      makeMandate({ id: 'm-1', name: 'Site coté' }),
      makeMandate({ id: 'm-2', name: 'Site vierge', profileUpdatedAt: null, siteType: null }),
    ]);
    renderWithProviders(<MandatesPage />);

    expect(await screen.findByText('Coté')).toBeInTheDocument();
    expect(screen.getByText('À coter')).toBeInTheDocument();
  });

  it('affiche « Tous » quand aucun quart n est coché (aucun filtre appliqué)', async () => {
    mockList([makeMandate({ shiftNights: false })]);
    renderWithProviders(<MandatesPage />);

    expect(await screen.findByText('Tous')).toBeInTheDocument();
  });

  it('filtre sur les mandats jamais cotés', async () => {
    mockList([makeMandate()]);
    renderWithProviders(<MandatesPage />);
    await screen.findByText('Tour Montréal');

    await userEvent.click(screen.getByLabelText('Jamais cotés'));

    await waitFor(() => {
      expect(getMandates).toHaveBeenLastCalledWith(
        expect.objectContaining({ unratedOnly: true, page: 1 })
      );
    });
  });

  it('état vide explicite plutôt qu un tableau muet', async () => {
    mockList([]);
    renderWithProviders(<MandatesPage />);

    expect(await screen.findByText('Aucun mandat trouvé.')).toBeInTheDocument();
  });

  describe('dialogue des candidats', () => {
    it('affiche le classement et explique les exclusions', async () => {
      mockList([makeMandate()]);
      getCandidates.mockResolvedValue({
        data: {
          mandate: makeMandate(),
          candidates: [
            {
              // La distance n'est pas répétée dans `reasons` : elle a sa colonne.
              candidateId: 'c-1', eligible: true, blockers: [], reasons: ['BSP valide'],
              hasQuestionnaire: true,
              frictions: [{ dimension: 'monotonyTolerance', siteRating: 5, tolerance: 1, gap: 4 }],
              distanceKm: 4.2, firstName: 'Alex', lastName: 'Roy', phone: '514-555-0001',
              email: null, city: 'Montréal', globalRating: 8.4, status: 'BON',
            },
          ],
        },
        meta: { evaluated: 40, eligible: 1, returned: 1, excludedBy: { 'BSP manquant': 39 } },
      });

      renderWithProviders(<MandatesPage />);
      await screen.findByText('Tour Montréal');
      await userEvent.click(screen.getByRole('button', { name: /Candidats/i }));

      expect(await screen.findByText('Alex Roy')).toBeInTheDocument();
      expect(screen.getByText('4.2 km')).toBeInTheDocument();
      // Le décompte des exclusions est ce qui rend une liste courte compréhensible.
      expect(screen.getByText('BSP manquant : 39')).toBeInTheDocument();
      // L'écart est montré en clair (site vs tolérance), pas en pourcentage.
      expect(
        screen.getByText('Tâches répétitives : site 5 / tolère 1')
      ).toBeInTheDocument();
    });

    it('distingue « pas de questionnaire » de « aucun écart »', async () => {
      mockList([makeMandate()]);
      getCandidates.mockResolvedValue({
        data: {
          mandate: makeMandate(),
          candidates: [
            {
              candidateId: 'c-1', eligible: true, blockers: [], reasons: ['BSP valide'],
              hasQuestionnaire: false, frictions: [],
              distanceKm: 2, firstName: 'Sans', lastName: 'Questionnaire',
              phone: '514-555-0002', email: null, city: 'Laval', globalRating: null, status: 'BON',
            },
            {
              candidateId: 'c-2', eligible: true, blockers: [], reasons: ['BSP valide'],
              hasQuestionnaire: true, frictions: [],
              distanceKm: 3, firstName: 'Aucun', lastName: 'Ecart',
              phone: '514-555-0003', email: null, city: 'Laval', globalRating: null, status: 'BON',
            },
          ],
        },
        meta: { evaluated: 2, eligible: 2, returned: 2, excludedBy: {} },
      });

      renderWithProviders(<MandatesPage />);
      await screen.findByText('Tour Montréal');
      await userEvent.click(screen.getByRole('button', { name: /Candidats/i }));

      expect(await screen.findByText('Pas de questionnaire')).toBeInTheDocument();
      expect(screen.getByText('Aucun')).toBeInTheDocument();
    });

    it('avertit quand aucun candidat n est proposable', async () => {
      mockList([makeMandate()]);
      getCandidates.mockResolvedValue({
        data: { mandate: makeMandate(), candidates: [] },
        meta: { evaluated: 12, eligible: 0, returned: 0, excludedBy: { 'Non disponible : nuit': 12 } },
      });

      renderWithProviders(<MandatesPage />);
      await screen.findByText('Tour Montréal');
      await userEvent.click(screen.getByRole('button', { name: /Candidats/i }));

      expect(
        await screen.findByText(/Aucun candidat ne remplit les exigences/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Non disponible : nuit : 12')).toBeInTheDocument();
    });
  });

  describe('dialogue de profil', () => {
    it('enregistre les cotes saisies', async () => {
      mockList([makeMandate()]);
      updateProfile.mockResolvedValue({ data: makeMandate({ monotony: 3 }) });

      renderWithProviders(<MandatesPage />);
      await screen.findByText('Tour Montréal');
      await userEvent.click(screen.getByRole('button', { name: /Profil/i }));

      expect(await screen.findByText(/Quarts à couvrir/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Répétitivité des tâches 3' }));
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() => {
        expect(updateProfile).toHaveBeenCalledWith('m-1', expect.objectContaining({ monotony: 3 }));
      });
    });

    it('recliquer une cote active la remet à « non coté »', async () => {
      // Sans ce geste, une erreur de saisie serait irrattrapable : il n'y a pas
      // d'autre chemin pour revenir de « 5 » à « pas encore évalué ».
      mockList([makeMandate()]);
      updateProfile.mockResolvedValue({ data: makeMandate() });

      renderWithProviders(<MandatesPage />);
      await screen.findByText('Tour Montréal');
      await userEvent.click(screen.getByRole('button', { name: /Profil/i }));

      await screen.findByText(/Contexte de travail/i);
      // monotony vaut 5 dans la fixture → recliquer 5 doit l'effacer.
      await userEvent.click(screen.getByRole('button', { name: 'Répétitivité des tâches 5' }));
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() => {
        expect(updateProfile).toHaveBeenCalledWith('m-1', expect.objectContaining({ monotony: null }));
      });
    });
  });
});
