import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, Table, TableHead, TableRow, TableCell, TableBody, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const statusLabel: Record<string, string> = {
  DRAFT: 'Brouillon', ISSUED: 'Remis', PARTIALLY_RETURNED: 'Retour partiel',
  RETURNED: 'Retourné', CLOSED_TERMINATION: 'Clôturé (fin emploi)', CANCELLED: 'Annulé',
};

export default function UniformAgentFichePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data, isLoading } = useQuery({
    queryKey: ['uniform-fiche', employeeId],
    queryFn: () => uniformService.getFiche(employeeId!),
    enabled: !!employeeId,
  });

  const [settleDlg, setSettleDlg] = useState(false);
  const [settleForm, setSettleForm] = useState({ amount: '', method: 'RETENUE PAIE', notes: '' });
  const settle = useMutation({
    mutationFn: () => uniformService.createSettlement(employeeId!, { amount: Number(settleForm.amount), method: settleForm.method, notes: settleForm.notes }),
    onSuccess: () => { enqueueSnackbar('Règlement enregistré', { variant: 'success' }); setSettleDlg(false); qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] }); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const closeTerm = useMutation({
    mutationFn: (id: string) => uniformService.closeTermination(id),
    onSuccess: () => { enqueueSnackbar('Fin d’emploi clôturée', { variant: 'success' }); qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] }); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  const openPdf = async (kind: 'issuance' | 'return', id: string) => {
    try {
      const r = kind === 'issuance' ? await uniformService.issuancePdfUrl(id) : await uniformService.returnPdfUrl(id);
      window.open(r.data.url, '_blank');
    } catch { enqueueSnackbar('PDF indisponible', { variant: 'error' }); }
  };

  if (isLoading) return <Typography>Chargement…</Typography>;
  const fiche = data?.data;
  if (!fiche) return <Typography>Fiche introuvable</Typography>;
  const { employee, holdings, owed, issuances, returns, settlements } = fiche;

  return (
    <Box>
      <Typography variant="h5" mb={0.5}>
        Fiche uniforme — {employee ? `${employee.firstName} ${employee.lastName}` : employeeId}
      </Typography>
      {employee?.assignment && <Typography color="text.secondary" mb={2}>{employee.assignment}</Typography>}

      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <Chip label={`Pièces détenues : ${holdings.reduce((s, h) => s + h.quantity, 0)}`} />
        <Chip color={owed.owed > 0 ? 'error' : 'success'} label={`Montant dû : ${money(owed.owed)}`} />
        <Chip variant="outlined" label={`Facturé : ${money(owed.charged)} • Réglé : ${money(owed.settled)}`} />
      </Stack>

      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <Button variant="contained" onClick={() => navigate(`/uniformes/remises/nouvelle?employeeId=${employeeId}`)}>
          Remettre des uniformes
        </Button>
        <Button variant="outlined" onClick={() => navigate(`/uniformes/retours?employeeId=${employeeId}`)}>
          Retourner des uniformes
        </Button>
        <Button size="small" variant="text" onClick={() => setSettleDlg(true)}>Enregistrer un règlement</Button>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" mb={1}>Détentions actuelles</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Pièce</TableCell><TableCell>Grandeur</TableCell><TableCell align="right">Qté</TableCell><TableCell align="right">Coût unit.</TableCell></TableRow></TableHead>
          <TableBody>
            {holdings.map((h) => (
              <TableRow key={h.variantId}><TableCell>{h.itemName}</TableCell><TableCell>{h.size}</TableCell><TableCell align="right">{h.quantity}</TableCell><TableCell align="right">{money(h.replacementCost)}</TableCell></TableRow>
            ))}
            {holdings.length === 0 && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Aucune pièce détenue.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" mb={1}>Historique des remises</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Division</TableCell><TableCell>Statut</TableCell><TableCell align="right">Coût</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
          <TableBody>
            {issuances.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{new Date(i.issuedAt || i.createdAt).toLocaleDateString('fr-CA')}</TableCell>
                <TableCell>{i.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                <TableCell><Chip size="small" label={statusLabel[i.status] || i.status} /></TableCell>
                <TableCell align="right">{money(i.totalLoanCost)}</TableCell>
                <TableCell align="right">
                  <Button size="small" startIcon={<PictureAsPdfIcon />} onClick={() => openPdf('issuance', i.id)}>PDF</Button>
                  {['ISSUED', 'PARTIALLY_RETURNED'].includes(i.status) && (
                    <Button size="small" color="error" onClick={() => closeTerm.mutate(i.id)}>Clôturer fin d'emploi</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {issuances.length === 0 && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Aucune remise.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" mb={1}>Historique des retours</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Statut</TableCell><TableCell align="right">PDF</TableCell></TableRow></TableHead>
          <TableBody>
            {returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.returnedAt || r.createdAt).toLocaleDateString('fr-CA')}</TableCell>
                <TableCell><Chip size="small" label={statusLabel[r.status] || r.status} /></TableCell>
                <TableCell align="right"><Button size="small" startIcon={<PictureAsPdfIcon />} onClick={() => openPdf('return', r.id)}>PDF</Button></TableCell>
              </TableRow>
            ))}
            {returns.length === 0 && <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">Aucun retour.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      {settlements.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" mb={1}>Règlements</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Méthode</TableCell><TableCell>Note</TableCell><TableCell align="right">Montant</TableCell></TableRow></TableHead>
            <TableBody>
              {settlements.map((s: any) => (
                <TableRow key={s.id}><TableCell>{new Date(s.createdAt).toLocaleDateString('fr-CA')}</TableCell><TableCell>{s.method}</TableCell><TableCell>{s.notes}</TableCell><TableCell align="right">{money(s.amount)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={settleDlg} onClose={() => setSettleDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Enregistrer un règlement</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField type="number" label="Montant ($)" value={settleForm.amount} onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })} />
            <TextField select label="Méthode" value={settleForm.method} onChange={(e) => setSettleForm({ ...settleForm, method: e.target.value })} SelectProps={{ native: true }}>
              <option value="RETENUE PAIE">Retenue sur paie</option>
              <option value="PAYÉ">Payé</option>
              <option value="RADIÉ">Radié</option>
            </TextField>
            <TextField label="Note" value={settleForm.notes} onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettleDlg(false)}>Annuler</Button>
          <Button variant="contained" disabled={!settleForm.amount || settle.isPending} onClick={() => settle.mutate()}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
      <Divider sx={{ mt: 4 }} />
    </Box>
  );
}
