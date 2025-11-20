import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Grid,
  Card,
  CardContent,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Chip,
  Box,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

interface BatchResult {
  candidateId: string;
  candidateName?: string;
  success: boolean;
  skillsFound?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

interface BatchSummary {
  total: number;
  processed?: number;
  skipped?: number;
  failed: number;
  totalSkillsExtracted: number;
}

interface BatchResults {
  summary: BatchSummary;
  message: string;
  results: BatchResult[];
}

interface ExtractionResultsDialogProps {
  open: boolean;
  onClose: () => void;
  results: BatchResults | null;
}

const ExtractionResultsDialog = ({ open, onClose, results }: ExtractionResultsDialogProps) => {
  if (!results) return null;

  const { summary, message, results: candidateResults } = results;

  // Calculate success rate
  const successRate = summary.total > 0
    ? Math.round((summary.processed || 0) / summary.total * 100)
    : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" />
          <Typography variant="h6">Résultats de l'Extraction Batch</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <Card sx={{ bgcolor: 'primary.light', color: 'white' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {summary.total}
                </Typography>
                <Typography variant="body2">Total</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card sx={{ bgcolor: 'success.light', color: 'white' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {summary.processed || 0}
                </Typography>
                <Typography variant="body2">Traités</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card sx={{ bgcolor: 'warning.light', color: 'white' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {summary.skipped || 0}
                </Typography>
                <Typography variant="body2">Ignorés</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={6} sm={3}>
            <Card sx={{ bgcolor: 'error.light', color: 'white' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {summary.failed}
                </Typography>
                <Typography variant="body2">Échecs</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card sx={{ bgcolor: 'info.light', color: 'white' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h2" fontWeight="bold">
                  {summary.totalSkillsExtracted}
                </Typography>
                <Typography variant="body1">Compétences Totales Extraites</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Success Message */}
        <Alert
          severity={successRate >= 75 ? "success" : successRate >= 50 ? "warning" : "error"}
          sx={{ mb: 2 }}
          icon={successRate >= 75 ? <CheckCircleIcon /> : successRate >= 50 ? <InfoIcon /> : <ErrorIcon />}
        >
          <Typography variant="body2">
            <strong>{message}</strong>
          </Typography>
          <Typography variant="caption">
            Taux de réussite: {successRate}%
          </Typography>
        </Alert>

        {/* Detailed Results Table */}
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
          Détails par candidat:
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nom du Candidat</TableCell>
                <TableCell>Statut</TableCell>
                <TableCell align="right">Compétences</TableCell>
                <TableCell>Message</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {candidateResults.map((result, index) => (
                <TableRow
                  key={index}
                  sx={{
                    bgcolor: result.success ? 'transparent' : 'error.lighter',
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {result.candidateName || result.candidateId.substring(0, 8) + '...'}
                    </Typography>
                    {result.candidateName && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {result.candidateId.substring(0, 8)}...
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {result.skipped ? (
                      <Chip
                        label="Ignoré"
                        color="warning"
                        size="small"
                        icon={<InfoIcon />}
                      />
                    ) : result.success ? (
                      <Chip
                        label="Succès"
                        color="success"
                        size="small"
                        icon={<CheckCircleIcon />}
                      />
                    ) : (
                      <Chip
                        label="Échec"
                        color="error"
                        size="small"
                        icon={<ErrorIcon />}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      fontWeight={result.skillsFound && result.skillsFound > 0 ? 'bold' : 'normal'}
                      color={result.skillsFound && result.skillsFound > 0 ? 'success.main' : 'text.secondary'}
                    >
                      {result.skillsFound || 0}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {result.reason && (
                      <Typography variant="caption" color="text.secondary">
                        {result.reason}
                      </Typography>
                    )}
                    {result.error && (
                      <Typography variant="caption" color="error">
                        {result.error}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Help Text */}
        {summary.failed > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="caption">
              <strong>Conseils:</strong> Les échecs peuvent être dus à des CVs manquants, des formats non supportés,
              ou des problèmes de lecture. Vérifiez les CVs des candidats concernés.
            </Typography>
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExtractionResultsDialog;
