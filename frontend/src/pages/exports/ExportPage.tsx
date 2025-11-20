import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  Button,
  Typography,
  Stack,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Paper,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Download as DownloadIcon, Search as SearchIcon } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { skillsService } from '@/services/skills.service';
import { useAuthStore } from '@/store/authStore';

const ExportPage = () => {
  const [searchParams] = useSearchParams();
  const { accessToken } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [minConfidence, setMinConfidence] = useState(Number(searchParams.get('minConfidence')) || 0);
  const [limit, setLimit] = useState<number>(Number(searchParams.get('limit')) || 250);
  const [preview, setPreview] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'excel' | 'pdf' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!query && !category && minConfidence === 0) {
        setPreview([]);
        return;
      }
      setIsLoadingPreview(true);
      try {
        const data = await skillsService.searchSkills(query, category || undefined, minConfidence || undefined, accessToken);
        if (!cancelled) {
          setPreview(data.results || []);
        }
      } catch (error) {
        if (!cancelled) {
          enqueueSnackbar("Impossible de charger l'aperçu des compétences", { variant: 'error' });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    const debounce = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [query, category, minConfidence, accessToken, enqueueSnackbar]);

  const handleDownload = async (format: 'csv' | 'excel' | 'pdf') => {
    if (!accessToken) {
      enqueueSnackbar('Vous devez être connecté pour exporter les résultats', { variant: 'warning' });
      return;
    }
    setDownloadingFormat(format);
    try {
      const response = await skillsService.exportSkills(
        format,
        {
          query,
          category: category || undefined,
          minConfidence: minConfidence || undefined,
          limit,
        },
        accessToken
      );

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = response.headers['content-disposition'];
      let filename = `skills-export.${format === 'excel' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv'}`;
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      enqueueSnackbar('Export généré avec succès', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar("Échec de l'export", { variant: 'error' });
    } finally {
      setDownloadingFormat(null);
    }
  };

  const flattenedPreview = useMemo(() => {
    return preview.flatMap((skill) =>
      (skill.candidates || []).map((candidate: any) => ({
        skillName: skill.skillName,
        category: skill.category,
        candidateName: `${candidate.candidate?.firstName || ''} ${candidate.candidate?.lastName || ''}`.trim(),
        confidence: candidate.confidence,
        city: candidate.candidate?.city,
        province: candidate.candidate?.province,
        level: candidate.level,
        years: candidate.yearsExperience,
      }))
    );
  }, [preview]);

  const formatConfidence = (value?: number) =>
    typeof value === 'number' ? `${Math.round(value * 100)} %` : 'N/A';

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Exports de compétences
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Préparez un export CSV, Excel ou PDF basés sur les filtres de la page « Autres Compétences ».
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Filtres
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="Rechercher"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Compétence, mot-clé..."
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Catégorie"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="TECHNICAL, SOFT_SKILL, ..."
                />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Confiance minimale ({Math.round((minConfidence || 0) * 100)} %)
                  </Typography>
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={minConfidence}
                    onChange={(_event, value) => setMinConfidence(Array.isArray(value) ? value[0] : value)}
                  />
                </Box>
                <TextField
                  label="Limite"
                  type="number"
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value) || 100)}
                  helperText="Nombre maximum de compétences exportées"
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={() => handleDownload('csv')}
                    disabled={downloadingFormat !== null}
                  >
                    Export CSV
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => handleDownload('excel')}
                    disabled={downloadingFormat !== null}
                  >
                    Export Excel
                  </Button>
                </Stack>
                <Button
                  fullWidth
                  color="secondary"
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleDownload('pdf')}
                  disabled={downloadingFormat !== null}
                >
                  Export PDF
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Prévisualisation</Typography>
                {isLoadingPreview && <CircularProgress size={20} />}
              </Box>

              {flattenedPreview.length === 0 && !isLoadingPreview && (
                <Box textAlign="center" py={6}>
                  <Typography variant="body2" color="text.secondary">
                    Ajustez les filtres pour voir un aperçu avant export.
                  </Typography>
                </Box>
              )}

              {flattenedPreview.length > 0 && (
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Compétence</TableCell>
                        <TableCell>Candidat</TableCell>
                        <TableCell>Ville</TableCell>
                        <TableCell>Niveau</TableCell>
                        <TableCell align="right">Confiance</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {flattenedPreview.slice(0, 15).map((row, index) => (
                        <TableRow key={`${row.skillName}-${index}`}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">
                              {row.skillName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.category}
                            </Typography>
                          </TableCell>
                          <TableCell>{row.candidateName || '—'}</TableCell>
                          <TableCell>{[row.city, row.province].filter(Boolean).join(', ') || '—'}</TableCell>
                          <TableCell>
                            <Chip label={row.level || 'N/A'} size="small" />
                          </TableCell>
                          <TableCell align="right">{formatConfidence(row.confidence)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ExportPage;
