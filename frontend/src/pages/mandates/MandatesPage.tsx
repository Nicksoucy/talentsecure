import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Button,
} from '@mui/material';
import {
  Search as SearchIcon,
  Place as PlaceIcon,
  PeopleAlt as PeopleAltIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { mandateService } from '@/services/mandate.service';
import { SITE_TYPES, SITE_TYPE_LABELS, type Mandate, type SiteType } from '@/types/mandate';
import MandateProfileDialog from './components/MandateProfileDialog';
import MandateCandidatesDialog from './components/MandateCandidatesDialog';

const PAGE_SIZE = 25;
/** Colonnes du tableau — à garder synchronisé avec le colSpan de l'état vide. */
const COLUMN_COUNT = 7;

/** Quarts cochés d'un mandat, en libellés courts. */
function shiftLabels(m: Mandate): string[] {
  const labels: string[] = [];
  if (m.shiftDays) labels.push('Jour');
  if (m.shiftEvenings) labels.push('Soir');
  if (m.shiftNights) labels.push('Nuit');
  if (m.shiftWeekends) labels.push('FDS');
  return labels;
}

/**
 * Écran de répartition : liste des mandats et saisie de leur profil.
 *
 * Le filtre « jamais cotés » est la porte d'entrée du travail : il y a ~146
 * sites à documenter, et sans lui on ne sait pas où on en était.
 */
export default function MandatesPage() {
  const [search, setSearch] = useState('');
  const [siteType, setSiteType] = useState<SiteType | ''>('');
  const [unratedOnly, setUnratedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Mandate | null>(null);
  const [matching, setMatching] = useState<Mandate | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mandates', { search, siteType, unratedOnly, page }],
    queryFn: () =>
      mandateService.getMandates({
        search: search || undefined,
        siteType: siteType || undefined,
        unratedOnly: unratedOnly || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const mandates = data?.data ?? [];
  const meta = data?.meta;

  // Remettre la pagination à 1 dès qu'un filtre change, sinon on atterrit sur
  // une page vide quand le nouveau résultat est plus court que l'ancien.
  const withFilterReset = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Mandats
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Décrivez chaque site pour pouvoir lui proposer les bons candidats. Un
        mandat non coté reste utilisable : le jumelage se rabat alors sur les
        exigences et la distance.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={5}>
              <TextField
                fullWidth
                size="small"
                placeholder="Nom du site, identifiant, adresse, client…"
                value={search}
                onChange={(e) => withFilterReset(setSearch)(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel id="filtre-type-site">Type de site</InputLabel>
                <Select
                  labelId="filtre-type-site"
                  label="Type de site"
                  value={siteType}
                  onChange={(e) => withFilterReset(setSiteType)(e.target.value as SiteType | '')}
                >
                  <MenuItem value="">Tous</MenuItem>
                  {SITE_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {SITE_TYPE_LABELS[t]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={unratedOnly}
                    onChange={(e) => withFilterReset(setUnratedOnly)(e.target.checked)}
                  />
                }
                label="Jamais cotés"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {isError && <Alert severity="error">Impossible de charger les mandats.</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Site</TableCell>
              <TableCell>Ville</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Quarts</TableCell>
              <TableCell>Exigences</TableCell>
              <TableCell>Profil</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            )}

            {!isLoading && mandates.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Aucun mandat trouvé.</Typography>
                </TableCell>
              </TableRow>
            )}

            {mandates.map((m) => {
              const shifts = shiftLabels(m);
              return (
                <TableRow key={m.id} hover>
                  <TableCell>
                    <Typography variant="body2">{m.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.externalId}
                      {m.clientName ? ` · ${m.clientName}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {m.city ?? '—'}
                    {m.lat == null && (
                      <Tooltip title="Site non géolocalisé : aucune distance ne pourra être calculée">
                        <PlaceIcon fontSize="small" color="disabled" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.siteType ? SITE_TYPE_LABELS[m.siteType] : <em>—</em>}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {shifts.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          Tous
                        </Typography>
                      ) : (
                        shifts.map((s) => <Chip key={s} size="small" label={s} />)
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {m.requiresBSP && <Chip size="small" variant="outlined" label="BSP" />}
                      {m.requiresDriverLicense && <Chip size="small" variant="outlined" label="Permis" />}
                      {m.requiresVehicle && <Chip size="small" variant="outlined" label="Véhicule" />}
                      {m.requiredLanguages.map((l) => (
                        <Chip key={l} size="small" variant="outlined" label={l} />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {m.profileUpdatedAt ? (
                      <Chip size="small" color="success" variant="outlined" label="Coté" />
                    ) : (
                      <Chip size="small" color="warning" variant="outlined" label="À coter" />
                    )}
                  </TableCell>
                  {/* Pas d'infobulle sur ces boutons : ils portent déjà un
                      libellé visible, et une Tooltip MUI remplacerait ce
                      libellé comme nom accessible pour les lecteurs d'écran. */}
                  <TableCell align="right">
                    <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(m)}>
                      Profil
                    </Button>
                    <Button size="small" startIcon={<PeopleAltIcon />} onClick={() => setMatching(m)}>
                      Candidats
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {meta && meta.totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination
            count={meta.totalPages}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
          />
        </Box>
      )}

      <MandateProfileDialog mandate={editing} onClose={() => setEditing(null)} />
      <MandateCandidatesDialog mandate={matching} onClose={() => setMatching(null)} />
    </Box>
  );
}
