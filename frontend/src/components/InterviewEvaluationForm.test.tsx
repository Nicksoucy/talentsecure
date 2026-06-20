import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/renderWithProviders';

import InterviewEvaluationForm, { type InterviewFormData } from './InterviewEvaluationForm';

/**
 * Remplit les 4 champs requis de l'étape 0 (Prénom, Nom, Téléphone, Ville)
 * pour débloquer le bouton « Suivant ».
 */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /prénom/i }), 'Jean');
  await user.type(screen.getByRole('textbox', { name: /nom de famille/i }), 'Tremblay');
  await user.type(screen.getByRole('textbox', { name: /téléphone/i }), '5145551234');
  await user.type(screen.getByRole('textbox', { name: /^ville/i }), 'Montréal');
}

describe('InterviewEvaluationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la première étape (informations personnelles) avec ses champs requis', () => {
    renderWithProviders(
      <InterviewEvaluationForm onSubmit={vi.fn()} onCancel={vi.fn()} />
    );

    expect(
      screen.getByText('📋 Informations personnelles du candidat')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /prénom/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /nom de famille/i })).toBeInTheDocument();
    // Étape 0 → bouton Retour désactivé, action principale « Suivant ».
    expect(screen.getByRole('button', { name: 'Retour' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeInTheDocument();
  });

  it('garde « Suivant » désactivé tant que les champs requis ne sont pas remplis', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InterviewEvaluationForm onSubmit={vi.fn()} onCancel={vi.fn()} />
    );

    const next = screen.getByRole('button', { name: 'Suivant' });
    expect(next).toBeDisabled();

    // Prénom seul ne suffit pas : nom, téléphone et ville restent vides.
    await user.type(screen.getByRole('textbox', { name: /prénom/i }), 'Jean');
    expect(next).toBeDisabled();

    await fillRequiredFields(user);
    expect(next).toBeEnabled();
  });

  it('navigue vers l\'étape suivante puis revient en arrière', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InterviewEvaluationForm onSubmit={vi.fn()} onCancel={vi.fn()} />
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    // Étape 1 = Transport & Mobilité.
    expect(screen.getByText('🚗 Transport et mobilité')).toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'Retour' });
    expect(back).toBeEnabled();

    await user.click(back);
    // De retour à l'étape 0, les valeurs saisies sont conservées.
    expect(screen.getByText('📋 Informations personnelles du candidat')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /prénom/i })).toHaveValue('Jean');
  });

  it('appelle onCancel au clic sur « Annuler »', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <InterviewEvaluationForm onSubmit={vi.fn()} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pré-remplit les champs via initialData et affiche le bandeau d\'édition avec candidateId', () => {
    const initialData: Partial<InterviewFormData> = {
      firstName: 'Marie',
      lastName: 'Gagnon',
      city: 'Laval',
      phone: '4505552222',
    };
    renderWithProviders(
      <InterviewEvaluationForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialData={initialData}
        candidateId="cand-42"
      />
    );

    expect(
      screen.getByText('Mode édition - Modification des informations du candidat')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /prénom/i })).toHaveValue('Marie');
    expect(screen.getByRole('textbox', { name: /nom de famille/i })).toHaveValue('Gagnon');
    // Champs requis déjà fournis → « Suivant » directement disponible.
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
  });

  it('soumet le formulaire avec les données saisies à la dernière étape', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <InterviewEvaluationForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        initialData={{ firstName: 'Paul', lastName: 'Roy', city: 'Québec', phone: '4185559876' }}
      />
    );

    // Avance jusqu'à la dernière des 10 étapes.
    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByRole('button', { name: 'Suivant' }));
    }

    // Dernière étape = Notes RH ; bouton d'enregistrement (création).
    const noteField = screen.getByRole('textbox', {
      name: /observations générales et recommandations/i,
    });
    await user.type(noteField, 'Très bon candidat');

    const submit = screen.getByRole('button', { name: /enregistrer le candidat/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as InterviewFormData;
    expect(payload).toMatchObject({
      firstName: 'Paul',
      lastName: 'Roy',
      city: 'Québec',
      hrNotes: 'Très bon candidat',
      globalRating: 7,
    });
  });

  it('désactive l\'action et affiche « Mise à jour... » quand isSubmitting est vrai en mode édition', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InterviewEvaluationForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        candidateId="cand-7"
        initialData={{ firstName: 'Sara', lastName: 'Côté', city: 'Gatineau', phone: '8195551111' }}
        isSubmitting
      />
    );

    // Atteint la dernière étape (champs requis déjà fournis via initialData).
    for (let i = 0; i < 9; i++) {
      await user.click(screen.getByRole('button', { name: 'Suivant' }));
    }

    // Le CTA reflète le mode édition + l'état de soumission, et reste désactivé.
    const submit = screen.getByRole('button', { name: /mise à jour\.\.\./i });
    expect(submit).toBeDisabled();
  });
});
