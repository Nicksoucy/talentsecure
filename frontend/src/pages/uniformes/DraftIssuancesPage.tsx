import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, Table, TableHead, TableRow, TableCell, TableBody, Button,
  Chip, Alert, useTheme, useMediaQuery, Card, CardContent, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { sendDraftIssuance } from './sendDraftIssuance';
import { usePerms } from '@/hooks/usePerms';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;

/** "2× Chemise grise (ML) L • 1× Pantalon militaire L • 1× Ceinture XL". */
function summarizeLines(lines: any[] | undefined): string {
  if (!lines || lines.length === 0) return '—';
  return lines
    .map((l) => {
      const name = l.variant?.item?.name || l.customItemName || '?';
      const size = l.variant?.size;
      const sizeStr = size && size !== 'Unique' ? ` ${size}` : '';
      return `${l.quantity}× ${name}${sizeStr}`;
    })
    .join(' • ');
}

/**
 * Onglet « Planifiées » : liste les remises en BROUILLON préparées d'avance par
 * l'équipe. Tout le monde (accès module) peut préparer/ajuster un brouillon ; le
 * magasin/gestion l'ouvre pour finaliser → signer → envoyer.
 */
export default function DraftIssuancesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { canWriteUniforms, canPrepareUniformDraft } = usePerms();

  const { data, isLoading } = useQuery({
    queryKey: ['issuances', 'DRAFT'],
    queryFn: () => uniformService.listIssuances({ status: 'DRAFT', limit: 100 }),
    staleTime: 0,
  });
  const drafts = (data?.data || []) as any[];

  const cancel = useMutation({
    mutationFn: (id: string) => uniformService.cancelIssuance(id),
    onSuccess: () => {
      enqueueSnackbar('Brouillon supprimé', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['issuances'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // Envoi rapide : finalise (décrémente le stock) + envoie le SMS de signature
  // à l'agent, sans ouvrir le wizard. L'employeur signe ensuite (fiche agent).
  const send = useMutation({
    mutationFn: (id: string) => sendDraftIssuance(id),
    onSuccess: (res) => {
      if (res.smsSent) {
        enqueueSnackbar("Remise envoyée — SMS de signature envoyé à l'agent", { variant: 'success' });
      } else {
        enqueueSnackbar(
          `Remise finalisée, mais l'envoi du SMS a échoué${res.smsError ? ` : ${res.smsError}` : ''}.`,
          { variant: 'warning', autoHideDuration: 12000 },
        );
      }
      qc.invalidateQueries({ queryKey: ['issuances'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  const openDraft = (id: string) => navigate(`/uniformes/remises/brouillon/${id}`);

  const actions = (d: any) => (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="flex-end">
      {canWriteUniforms && (
        <Button
          size="small" variant="contained" startIcon={<SendIcon />}
          disabled={send.isPending}
          onClick={() => {
            if (window.confirm("Envoyer cette remise maintenant ?\n\nLe stock sera décrémenté et un SMS de signature sera envoyé à l'agent. L'employeur pourra signer ensuite.")) {
              send.mutate(d.id);
            }
          }}
        >
          Envoyer
        </Button>
      )}
      {canWriteUniforms ? (
        <Button size="small" variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => openDraft(d.id)}>
          Ouvrir / Finaliser
        </Button>
      ) : (
        <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openDraft(d.id)}>
          Modifier
        </Button>
      )}
      {canWriteUniforms && (
        <Button
          size="small" color="error" startIcon={<DeleteOutlineIcon />}
          disabled={cancel.isPending}
          onClick={() => { if (window.confirm('Supprimer ce brouillon ?')) cancel.mutate(d.id); }}
        >
          Supprimer
        </Button>
      )}
    </Stack>
  );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
        <Box>
          <Typography variant="h5">Remises planifiées</Typography>
          <Typography variant="body2" color="text.secondary">
            Brouillons préparés d'avance. {canWriteUniforms ? 'Ouvrez-en un pour finaliser, signer et envoyer.' : 'Le magasin les finalisera et enverra.'}
          </Typography>
        </Box>
        {canPrepareUniformDraft && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/uniformes/remises/nouvelle')}>
            Préparer une remise
          </Button>
        )}
      </Stack>

      {isLoading && <Typography>Chargement…</Typography>}
      {!isLoading && drafts.length === 0 && (
        <Alert severity="info">
          Aucune remise planifiée. Cliquez « Préparer une remise » pour en créer un brouillon — l'agent, les pièces et
          les grandeurs sont enregistrés sans toucher au stock.
        </Alert>
      )}

      {!isLoading && drafts.length > 0 && (
        isMobile ? (
          <Stack spacing={1.5}>
            {drafts.map((d) => (
              <Card key={d.id} variant="outlined">
                <CardContent sx={{ pb: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="body1" fontWeight={600}>{d.employeeName}</Typography>
                    <Chip size="small" label={d.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'} />
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.3 }}>{summarizeLines(d.lines)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Préparé le {new Date(d.createdAt).toLocaleDateString('fr-CA')} · {money(d.totalLoanCost)}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  {actions(d)}
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <Paper>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Agent</TableCell>
                    <TableCell>Division</TableCell>
                    <TableCell>Pièces</TableCell>
                    <TableCell>Préparé le</TableCell>
                    <TableCell align="right">Coût</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {drafts.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{d.employeeName}</TableCell>
                      <TableCell>{d.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                      <TableCell sx={{ maxWidth: 420 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.3 }}>
                          {summarizeLines(d.lines)}
                        </Typography>
                      </TableCell>
                      <TableCell>{new Date(d.createdAt).toLocaleDateString('fr-CA')}</TableCell>
                      <TableCell align="right">{money(d.totalLoanCost)}</TableCell>
                      <TableCell align="right">{actions(d)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        )
      )}
    </Box>
  );
}
