import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Container,
  FormControlLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { publicQuestionnaireService } from '@/services/public-questionnaire.service';
import type { AnswerInput, QuestionnaireItem, QuestionnaireSession } from '@/types/questionnaire';

/**
 * Questionnaire du candidat — page publique, sans compte.
 *
 * Trois décisions de conception qui viennent de la littérature, pas du goût :
 *
 *  - **Les 90 premières secondes décident de la complétion.** Plus de la moitié
 *    des abandons surviennent dans les premières minutes, et raccourcir le
 *    questionnaire n'y change presque rien : c'est l'écran d'introduction, qui
 *    explique à quoi ça sert, qui fait la différence. D'où une page d'accueil
 *    qui ne demande rien.
 *
 *  - **Le cadrage réduit la falsification mieux qu'un piège.** On ne dit pas
 *    « c'est un test de personnalité » : on dit la vérité, à savoir que les
 *    réponses servent à décider où la personne travaillera. Une conséquence
 *    concrète et vérifiable décourage plus efficacement d'embellir qu'un appel
 *    moral vague.
 *
 *  - **Sauvegarde à chaque page.** Un candidat qui perd son réseau dans le métro
 *    ne doit pas tout recommencer — sinon il ne recommence pas du tout.
 */

/** Découpage : les préférences d'abord (concrètes, faciles), puis les traits. */
const TRAIT_PAGE_SIZE = 5;

type Step = 'intro' | 'questions' | 'consent';

export default function QuestionnairePage() {
  const { token = '' } = useParams<{ token: string }>();

  const [session, setSession] = useState<QuestionnaireSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('intro');
  const [pageIndex, setPageIndex] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /** Horodatage de la dernière interaction — sert à mesurer le temps par énoncé. */
  const lastAnswerAt = useRef<number>(Date.now());
  const elapsedByItem = useRef<Record<string, number>>({});
  /** Réponses pas encore envoyées au serveur. */
  const pending = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    publicQuestionnaireService
      .getSession(token)
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setValues(Object.fromEntries(data.answers.map((a) => [a.itemId, a.value])));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(
          e?.response?.data?.message ??
            "Ce lien n'est plus valide. Demandez-nous un nouveau lien."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** Pages d'énoncés : une page de préférences, puis les traits par blocs de 5. */
  const pages = useMemo<QuestionnaireItem[][]>(() => {
    if (!session) return [];
    const preferences = session.items.filter((i) => i.block === 'preference');
    const traits = session.items.filter((i) => i.block === 'trait');
    const traitPages: QuestionnaireItem[][] = [];
    for (let i = 0; i < traits.length; i += TRAIT_PAGE_SIZE) {
      traitPages.push(traits.slice(i, i + TRAIT_PAGE_SIZE));
    }
    return preferences.length > 0 ? [preferences, ...traitPages] : traitPages;
  }, [session]);

  const totalItems = session?.items.length ?? 0;
  const answeredCount = Object.keys(values).length;
  const currentPage = pages[pageIndex] ?? [];
  const pageComplete = currentPage.every((i) => values[i.id] !== undefined);

  const handleAnswer = (itemId: string, value: number) => {
    const now = Date.now();
    elapsedByItem.current[itemId] = Math.min(now - lastAnswerAt.current, 600_000);
    lastAnswerAt.current = now;
    pending.current[itemId] = value;
    setValues((v) => ({ ...v, [itemId]: value }));
  };

  /** Envoie ce qui n'a pas encore été sauvegardé. Silencieux : une sauvegarde
   *  ratée ne doit pas interrompre le candidat, la suivante rattrapera. */
  const flush = async () => {
    const answers: AnswerInput[] = Object.entries(pending.current).map(([itemId, value]) => ({
      itemId,
      value,
      elapsedMs: elapsedByItem.current[itemId],
    }));
    if (answers.length === 0) return;
    pending.current = {};
    try {
      await publicQuestionnaireService.saveAnswers(token, answers);
    } catch {
      // Remis en file : la prochaine page réessaiera.
      for (const a of answers) pending.current[a.itemId] = a.value;
    }
  };

  const goNext = async () => {
    await flush();
    if (pageIndex < pages.length - 1) {
      setPageIndex((i) => i + 1);
      window.scrollTo({ top: 0 });
    } else {
      setStep('consent');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await flush();
      await publicQuestionnaireService.submit(token);
      setDone(true);
    } catch (e: any) {
      setSubmitError(
        e?.response?.data?.message ?? "L'envoi a échoué. Vérifiez votre connexion et réessayez."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Centered>
        <CircularProgress />
      </Centered>
    );
  }

  if (loadError || !session) {
    return (
      <Centered>
        <Alert severity="warning" sx={{ width: '100%' }}>
          {loadError}
        </Alert>
      </Centered>
    );
  }

  if (done) {
    return (
      <Centered>
        <Card sx={{ width: '100%' }}>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Merci{session.firstName ? `, ${session.firstName}` : ''} !
            </Typography>
            <Typography color="text.secondary">
              Vos réponses sont enregistrées. Elles nous servent à vous proposer
              des postes qui vous conviennent. Une personne de l'équipe vous
              recontacte pour la suite.
            </Typography>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {step !== 'intro' && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress
            variant="determinate"
            value={totalItems === 0 ? 0 : (answeredCount / totalItems) * 100}
          />
          <Typography variant="caption" color="text.secondary">
            {answeredCount} / {totalItems}
          </Typography>
        </Box>
      )}

      <Card>
        <CardContent>
          {step === 'intro' && (
            <>
              <Typography variant="h5" gutterBottom>
                Bonjour{session.firstName ? ` ${session.firstName}` : ''} !
              </Typography>
              <Typography paragraph>
                Ces questions servent à une seule chose : vous placer sur les
                postes qui vous conviennent. Il n'y a pas de bonne ni de mauvaise
                réponse, et ce n'est pas un examen.
              </Typography>
              <Typography paragraph>
                Répondez franchement. Si vous dites que le travail de nuit vous
                convient, c'est de nuit qu'on vous appellera — répondre ce que
                vous croyez qu'on veut entendre vous mènerait sur un poste qui ne
                vous plaît pas.
              </Typography>
              <Typography paragraph color="text.secondary">
                Environ 8 minutes. Vous pouvez fermer la page et revenir plus
                tard avec le même lien : vos réponses sont conservées.
              </Typography>
              <Button
                fullWidth
                size="large"
                variant="contained"
                onClick={() => {
                  lastAnswerAt.current = Date.now();
                  setStep('questions');
                }}
              >
                Commencer
              </Button>
            </>
          )}

          {step === 'questions' && (
            <>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {pageIndex === 0 && currentPage[0]?.block === 'preference'
                  ? 'Ce qui vous convient'
                  : 'Votre façon de travailler'}
              </Typography>

              {currentPage.map((item) => (
                <Box key={item.id} sx={{ mb: 3 }}>
                  <Typography sx={{ mb: 1 }}>{item.text}</Typography>
                  <RadioGroup
                    value={values[item.id] ?? ''}
                    onChange={(e) => handleAnswer(item.id, Number(e.target.value))}
                  >
                    {session.scaleLabels.map((label, index) => (
                      <FormControlLabel
                        key={label}
                        value={index + 1}
                        control={<Radio />}
                        label={label}
                        // Cible tactile confortable : ces gens répondent au
                        // téléphone, souvent debout.
                        sx={{ py: 0.25 }}
                      />
                    ))}
                  </RadioGroup>
                </Box>
              ))}

              <Box sx={{ display: 'flex', gap: 1 }}>
                {pageIndex > 0 && (
                  <Button
                    fullWidth
                    size="large"
                    onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  >
                    Retour
                  </Button>
                )}
                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  disabled={!pageComplete}
                  onClick={goNext}
                >
                  {pageIndex < pages.length - 1 ? 'Suivant' : 'Terminer'}
                </Button>
              </Box>
              {!pageComplete && (
                <Typography variant="caption" color="text.secondary">
                  Répondez à toutes les questions de cette page pour continuer.
                </Typography>
              )}
            </>
          )}

          {step === 'consent' && (
            <>
              <Typography variant="h6" gutterBottom>
                Dernière étape
              </Typography>
              {/* Consentement présenté DISTINCTEMENT du reste (Loi 25, art. 14) :
                  jamais une case noyée dans des conditions d'utilisation. */}
              <Alert severity="info" sx={{ mb: 2 }}>
                Vos réponses sont conservées par XGuard et servent à vous proposer
                des mandats. Elles sont lues par une personne de l'équipe : aucune
                décision vous concernant n'est prise automatiquement. Vous pouvez
                nous demander de les consulter ou de les supprimer.
              </Alert>
              <FormControlLabel
                control={
                  <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                }
                label="J'accepte que mes réponses soient conservées et utilisées pour mes affectations."
              />

              {submitError && (
                <Alert severity="error" sx={{ my: 2 }}>
                  {submitError}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button fullWidth size="large" onClick={() => setStep('questions')}>
                  Retour
                </Button>
                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  disabled={!consent || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Envoi…' : 'Envoyer'}
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Container maxWidth="sm" sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
      {children}
    </Container>
  );
}
