import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  TextField,
  Typography,
} from '@mui/material';
import { Assignment as AssignmentIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import { questionnaireService } from '@/services/questionnaire.service';
import { PREFERENCE_FIELDS, TRAIT_FIELDS } from '@/types/questionnaire';

interface Props {
  personType: 'candidate' | 'prospect';
  personId: string;
}

const SCALE_MAX = 5;

/**
 * Questionnaire de préférences, côté personnel.
 *
 * Affiche les CONCLUSIONS, jamais les réponses énoncé par énoncé : la CDPDJ
 * recommande que le détail reste chez la personne qui administre le test et que
 * les décideurs n'aient que les conclusions. Le détail existe à
 * `GET /api/questionnaires/responses/:id`, réservé ADMIN.
 *
 * Les scores sont montrés sur leur échelle brute (x/5) et jamais convertis en
 * percentile : il n'existe aucune norme québécoise validée pour cette
 * population, donc un rang serait inventé tant qu'on n'a pas assez de
 * répondants maison.
 */
export default function QuestionnaireCard({ personType, personId }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [link, setLink] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['questionnaire-summary', personType, personId],
    queryFn: () => questionnaireService.getPersonSummary(personType, personId),
  });

  const invite = useMutation({
    mutationFn: () => questionnaireService.createInvitation(personType, personId),
    onSuccess: (res) => setLink(res.data.url),
    onError: () => enqueueSnackbar('Impossible de générer le lien', { variant: 'error' }),
  });

  const summary = data?.data ?? null;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      enqueueSnackbar('Lien copié', { variant: 'success' });
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le lien
      // reste sélectionnable à l'écran, donc rien n'est perdu.
      enqueueSnackbar('Copiez le lien manuellement', { variant: 'info' });
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <AssignmentIcon color="action" />
          <Typography variant="h6" fontWeight="bold">
            Préférences de travail
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {isLoading && (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!isLoading && !summary && (
          <>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Cette personne n'a pas encore rempli le questionnaire. Générez un
              lien et envoyez-le-lui : environ 8 minutes, sur téléphone.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => invite.mutate()}
              disabled={invite.isPending}
              sx={{ mt: 1 }}
            >
              Générer le lien
            </Button>

            {link && (
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  value={link}
                  InputProps={{ readOnly: true }}
                  onFocus={(e) => e.target.select()}
                />
                <Button size="small" startIcon={<CopyIcon />} onClick={copyLink} sx={{ mt: 1 }}>
                  Copier
                </Button>
                <Typography variant="caption" color="text.secondary" display="block">
                  Le lien reste valide 30 jours. Recliquer « Générer » redonne le
                  même lien tant qu'il n'a pas été rempli.
                </Typography>
              </Box>
            )}
          </>
        )}

        {summary && (
          <>
            {summary.careless && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Questionnaire à interpréter avec prudence :{' '}
                {summary.qualityFlags.join(' · ')}.
              </Alert>
            )}

            <Typography variant="subtitle2" gutterBottom>
              Ce qui lui convient
            </Typography>
            {PREFERENCE_FIELDS.map(({ key, label }) => {
              const value = summary[key] as number | null;
              return (
                <Box key={String(key)} sx={{ mb: 1 }}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">{label}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {value == null ? '—' : `${value}/${SCALE_MAX}`}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={value == null ? 0 : (value / SCALE_MAX) * 100}
                  />
                </Box>
              );
            })}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              Façon de travailler
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {TRAIT_FIELDS.map(({ key, label }) => {
                const value = summary[key] as number | null;
                return (
                  <Chip
                    key={String(key)}
                    size="small"
                    variant="outlined"
                    label={`${label} ${value == null ? '—' : `${value}/${SCALE_MAX}`}`}
                  />
                );
              })}
            </Box>

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
              Ces résultats servent à proposer des mandats. Ils ne remplacent ni
              l'entrevue ni votre jugement, et ne doivent jamais motiver seuls un
              refus.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
