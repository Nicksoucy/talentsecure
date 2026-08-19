import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material';
import { mandateService } from '@/services/mandate.service';
import type { Mandate } from '@/types/mandate';
import { DIMENSION_LABELS } from '@/types/questionnaire';

interface Props {
  mandate: Mandate | null;
  onClose: () => void;
}

/**
 * Candidats proposables pour un mandat.
 *
 * Volontairement sans « score de compatibilité » : on affiche la distance, les
 * faits vérifiés et, pour les écartés, le motif exact. Un répartiteur doit
 * pouvoir expliquer son choix à un candidat qui le lui demande — et un
 * pourcentage ne s'explique pas.
 *
 * Le bandeau d'exclusions est affiché même quand la liste est bien remplie :
 * c'est ce qui distingue « il n'y a personne » de « personne n'a de BSP ».
 */
export default function MandateCandidatesDialog({ mandate, onClose }: Props) {
  const navigate = useNavigate();
  const [includeIneligible, setIncludeIneligible] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mandate-candidates', mandate?.id, includeIneligible],
    queryFn: () => mandateService.getCandidates(mandate!.id, { includeIneligible, limit: 100 }),
    enabled: Boolean(mandate),
  });

  if (!mandate) return null;

  const candidates = data?.data.candidates ?? [];
  const meta = data?.meta;
  const exclusions = Object.entries(meta?.excludedBy ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Dialog open={Boolean(mandate)} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Candidats pour {mandate.name}
        <Typography variant="body2" color="text.secondary">
          {mandate.city ?? 'Ville inconnue'}
          {mandate.lat == null && ' · site non géolocalisé, distances indisponibles'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && <Alert severity="error">Impossible de charger les candidats.</Alert>}

        {meta && (
          <Alert severity={meta.eligible === 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>
            <strong>{meta.eligible}</strong> candidat{meta.eligible > 1 ? 's' : ''} proposable
            {meta.eligible > 1 ? 's' : ''} sur {meta.evaluated} évalué
            {meta.evaluated > 1 ? 's' : ''}.
            {exclusions.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {exclusions.map(([motif, n]) => (
                  <Chip key={motif} size="small" variant="outlined" label={`${motif} : ${n}`} />
                ))}
              </Box>
            )}
          </Alert>
        )}

        <FormControlLabel
          control={
            <Switch
              checked={includeIneligible}
              onChange={(e) => setIncludeIneligible(e.target.checked)}
            />
          }
          label="Afficher aussi les candidats écartés"
        />

        {!isLoading && candidates.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Aucun candidat ne remplit les exigences de ce mandat. Le bandeau
            ci-dessus indique ce qui bloque.
          </Alert>
        )}

        {candidates.length > 0 && (
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nom</TableCell>
                  <TableCell>Ville</TableCell>
                  <TableCell align="right">Distance</TableCell>
                  <TableCell align="right">Note</TableCell>
                  <TableCell>Constats</TableCell>
                  <TableCell>Points de friction</TableCell>
                  <TableCell>Téléphone</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow
                    key={c.candidateId}
                    hover
                    sx={{ cursor: 'pointer', opacity: c.eligible ? 1 : 0.6 }}
                    onClick={() => navigate(`/candidates/${c.candidateId}`)}
                  >
                    <TableCell>
                      {c.firstName} {c.lastName}
                    </TableCell>
                    <TableCell>{c.city}</TableCell>
                    <TableCell align="right">
                      {c.distanceKm == null ? '—' : `${c.distanceKm} km`}
                    </TableCell>
                    <TableCell align="right">
                      {c.globalRating == null ? '—' : c.globalRating.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {c.blockers.map((b) => (
                          <Chip key={b} size="small" color="error" variant="outlined" label={b} />
                        ))}
                        {c.eligible &&
                          c.reasons.map((r) => (
                            <Chip key={r} size="small" variant="outlined" label={r} />
                          ))}
                      </Box>
                    </TableCell>
                    {/* Écarts entre les exigences du site et ce que la personne
                        dit tolérer. Informatif : ils n'écartent personne, et
                        « aucun questionnaire » se distingue d'« aucun écart ». */}
                    <TableCell>
                      {!c.hasQuestionnaire ? (
                        <Typography variant="caption" color="text.secondary">
                          Pas de questionnaire
                        </Typography>
                      ) : c.frictions.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          Aucun
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {c.frictions.map((f) => (
                            <Chip
                              key={f.dimension}
                              size="small"
                              color="warning"
                              variant="outlined"
                              label={`${DIMENSION_LABELS[f.dimension] ?? f.dimension} : site ${f.siteRating} / tolère ${f.tolerance}`}
                            />
                          ))}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>{c.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
      </DialogActions>
    </Dialog>
  );
}
