import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/renderWithProviders';
import type { QuestionnaireSession } from '@/types/questionnaire';

// La page appelle un client axios NON authentifié dédié → on mocke le service.
vi.mock('@/services/public-questionnaire.service', () => ({
  publicQuestionnaireService: {
    getSession: vi.fn(),
    saveAnswers: vi.fn(),
    submit: vi.fn(),
  },
}));

import { publicQuestionnaireService } from '@/services/public-questionnaire.service';
import QuestionnairePage from './QuestionnairePage';

const getSession = vi.mocked(publicQuestionnaireService.getSession);
const saveAnswers = vi.mocked(publicQuestionnaireService.saveAnswers);
const submit = vi.mocked(publicQuestionnaireService.submit);

const SCALE = ['Pas du tout', 'Un peu', 'Moyennement', 'Beaucoup', 'Tout à fait'];

/** 2 préférences + 5 traits : assez pour couvrir la pagination sans bruit. */
function makeSession(overrides: Partial<QuestionnaireSession> = {}): QuestionnaireSession {
  return {
    firstName: 'Alex',
    version: 'v1',
    scaleLabels: SCALE,
    consentGiven: false,
    items: [
      { id: 'pref_1', text: 'Travailler dehors, ça me convient.', block: 'preference', dimension: 'outdoorTolerance' },
      { id: 'pref_2', text: 'Travailler seul, ça me convient.', block: 'preference', dimension: 'autonomyPref' },
      { id: 't_1', text: "J'arrive à l'heure.", block: 'trait', dimension: 'dependability' },
      { id: 't_2', text: 'Je fais ce que je dis.', block: 'trait', dimension: 'dependability' },
      { id: 't_3', text: 'Je remets à plus tard.', block: 'trait', dimension: 'dependability' },
      { id: 't_4', text: 'Je suis les consignes.', block: 'trait', dimension: 'dependability' },
      { id: 't_5', text: 'Je bâcle les tâches plates.', block: 'trait', dimension: 'dependability' },
    ],
    answers: [],
    ...overrides,
  };
}

function renderPage(token = 'jeton-de-test-suffisamment-long') {
  return renderWithProviders(
    <Routes>
      <Route path="/mon-profil/:token" element={<QuestionnairePage />} />
    </Routes>,
    { route: `/mon-profil/${token}` }
  );
}

/** Répond à tous les énoncés visibles à l'écran. */
async function repondrePage(valeur = 'Beaucoup') {
  const choix = screen.getAllByRole('radio', { name: valeur });
  for (const c of choix) await userEvent.click(c);
}

describe('QuestionnairePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveAnswers.mockResolvedValue(undefined);
    submit.mockResolvedValue(undefined);
  });

  it('accueille sans rien demander avant de commencer', async () => {
    getSession.mockResolvedValue(makeSession());
    renderPage();

    expect(await screen.findByText(/Bonjour Alex/)).toBeInTheDocument();
    // Le cadrage anti-falsification doit être visible dès l'accueil.
    expect(screen.getByText(/pas un examen/i)).toBeInTheDocument();
    expect(screen.getByText(/c'est de nuit qu'on vous appellera/i)).toBeInTheDocument();
    // Aucun énoncé tant qu'on n'a pas cliqué « Commencer ».
    expect(screen.queryByText(/Travailler dehors/)).not.toBeInTheDocument();
  });

  it('affiche un lien invalide sans détail technique', async () => {
    getSession.mockRejectedValue({
      response: { data: { message: "Ce lien n'est plus valide." } },
    });
    renderPage();

    expect(await screen.findByText(/Ce lien n'est plus valide/)).toBeInTheDocument();
  });

  it('bloque le passage à la page suivante tant que tout n est pas répondu', async () => {
    getSession.mockResolvedValue(makeSession());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled();

    await repondrePage();
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
  });

  it('sauvegarde à chaque page tournée, avec le temps passé', async () => {
    getSession.mockResolvedValue(makeSession());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    await waitFor(() => expect(saveAnswers).toHaveBeenCalledTimes(1));
    const [, answers] = saveAnswers.mock.calls[0];
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ itemId: 'pref_1', value: 4 });
    expect(typeof answers[0].elapsedMs).toBe('number');
  });

  it('reprend les réponses déjà données après une interruption', async () => {
    getSession.mockResolvedValue(
      makeSession({ answers: [{ itemId: 'pref_1', value: 5 }, { itemId: 'pref_2', value: 2 }] })
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    // Les deux préférences sont déjà remplies → on peut avancer sans rien toucher.
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeEnabled();
    expect(screen.getAllByRole('radio', { name: 'Tout à fait' })[0]).toBeChecked();
  });

  it('exige le consentement avant de pouvoir envoyer', async () => {
    getSession.mockResolvedValue(makeSession());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));

    expect(await screen.findByText(/Dernière étape/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    // Le texte de consentement doit dire qu'aucune décision n'est automatique.
    expect(screen.getByText(/aucune décision vous concernant n'est prise automatiquement/i))
      .toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });

  it('remercie sans jamais montrer de score', async () => {
    getSession.mockResolvedValue(makeSession());
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText(/Merci, Alex/)).toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/score|résultat|note/i)).not.toBeInTheDocument();
  });

  it('laisse réessayer quand l envoi échoue', async () => {
    getSession.mockResolvedValue(makeSession());
    submit.mockRejectedValue({ response: { data: { message: 'Réseau indisponible.' } } });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Réseau indisponible.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });

  it('ne perd pas les réponses quand une sauvegarde intermédiaire échoue', async () => {
    getSession.mockResolvedValue(makeSession());
    saveAnswers.mockRejectedValueOnce(new Error('hors ligne'));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    // La page avance malgré l'échec, et les réponses repartent au tour suivant.
    await repondrePage();
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));

    await waitFor(() => {
      const dernier = saveAnswers.mock.calls[saveAnswers.mock.calls.length - 1][1];
      expect(dernier.map((a) => a.itemId)).toEqual(
        expect.arrayContaining(['pref_1', 'pref_2', 't_1'])
      );
    });
  });
});
