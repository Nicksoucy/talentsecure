import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, Table, TableHead, TableRow, TableCell, TableBody, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Card, CardContent, Divider,
  useTheme, useMediaQuery,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import EditIcon from '@mui/icons-material/Edit';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import SignaturePad from './SignaturePad';
import IssuanceLinesEditor from './IssuanceLinesEditor';
import MobileIssuanceSheet from './MobileIssuanceSheet';
import type { UniformIssuance, UniformIssuanceLine } from '@/types/uniform';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const statusLabel: Record<string, string> = {
  DRAFT: 'Brouillon', ISSUED: 'Remis', PARTIALLY_RETURNED: 'Retour partiel',
  RETURNED: 'Retourné', CLOSED_TERMINATION: 'Clôturé (fin emploi)', CANCELLED: 'Annulé',
};

/** Résume les lignes d'une remise en une chaîne lisible :
 *  "2× Chemise grise (ML) L • 1× Pantalon militaire L • 1× Ceinture Unique". */
function summarizeLines(lines: UniformIssuanceLine[] | undefined): string {
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
 * Panneau de gestion d'uniforme pour un agent (détentions, transactions,
 * montant dû, remise/retour, clôture). Réutilisé par la page profil employé
 * (/employees/:id).
 */
export default function UniformFichePanel({ employeeId }: { employeeId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { data, isLoading } = useQuery({
    queryKey: ['uniform-fiche', employeeId],
    queryFn: () => uniformService.getFiche(employeeId),
    enabled: !!employeeId,
  });

  const [settleDlg, setSettleDlg] = useState(false);
  const [settleForm, setSettleForm] = useState({ amount: '', method: 'RETENUE PAIE', notes: '' });
  const settle = useMutation({
    mutationFn: () => uniformService.createSettlement(employeeId, { amount: Number(settleForm.amount), method: settleForm.method, notes: settleForm.notes }),
    onSuccess: () => { enqueueSnackbar('Règlement enregistré', { variant: 'success' }); setSettleDlg(false); qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] }); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const closeTerm = useMutation({
    mutationFn: (id: string) => uniformService.closeTermination(id),
    onSuccess: () => { enqueueSnackbar('Fin d’emploi clôturée', { variant: 'success' }); qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] }); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // Signature employeur a posteriori (cas où l'agent a signé via SMS)
  const [signEmployerFor, setSignEmployerFor] = useState<string | null>(null);
  const [employerSig, setEmployerSig] = useState<string | null>(null);
  const closeEmployerDlg = () => { setSignEmployerFor(null); setEmployerSig(null); };
  const signEmployer = useMutation({
    mutationFn: () => uniformService.counterSignIssuance(signEmployerFor!, { employerSignatureBase64: employerSig! }),
    onSuccess: () => {
      enqueueSnackbar('Signature employeur enregistrée — PDF mis à jour', { variant: 'success' });
      closeEmployerDlg();
      qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  const openPdf = async (kind: 'issuance' | 'return', id: string) => {
    try {
      const r = kind === 'issuance' ? await uniformService.issuancePdfUrl(id) : await uniformService.returnPdfUrl(id);
      window.open(r.data.url, '_blank');
    } catch { enqueueSnackbar('PDF indisponible', { variant: 'error' }); }
  };

  // Édition des lignes d'une remise (DRAFT ou historique sans impact stock).
  const [editLinesFor, setEditLinesFor] = useState<UniformIssuance | null>(null);

  // Panneau de remise mobile (scan + signature) ouvert depuis la fiche.
  const [issueOpen, setIssueOpen] = useState(false);

  // Téléversement du PDF original (utile pour les remises historiques).
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const handleUploadPdf = async (issuanceId: string, file: File) => {
    setUploadingFor(issuanceId);
    try {
      await uniformService.uploadIssuancePdf(issuanceId, file);
      enqueueSnackbar('PDF joint à la remise', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.error || 'Échec téléversement', { variant: 'error' });
    } finally {
      setUploadingFor(null);
    }
  };

  // Boutons d'action d'une remise — réutilisés en tableau (desktop) et en carte (mobile).
  const issuanceActions = (i: UniformIssuance) => (
    <>
      <Button size="small" startIcon={<PictureAsPdfIcon />} onClick={() => openPdf('issuance', i.id)}>PDF</Button>
      <Button size="small" component="label" startIcon={<UploadFileIcon />} disabled={uploadingFor === i.id}>
        {uploadingFor === i.id ? '…' : (i.formPdfStoragePath ? 'Remplacer PDF' : 'Téléverser PDF')}
        <input
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUploadPdf(i.id, f);
            (e.target as HTMLInputElement).value = '';
          }}
        />
      </Button>
      {(i.status === 'DRAFT' || (i.status === 'ISSUED' && i.signatureMethod === 'COUNTER')) && (
        <Button size="small" startIcon={<EditIcon />} onClick={() => setEditLinesFor(i)}>
          Modifier les pièces
        </Button>
      )}
      {!i.employerSignatureStoragePath && i.status !== 'DRAFT' && i.status !== 'CANCELLED' && (
        <Button size="small" color="primary" onClick={() => setSignEmployerFor(i.id)}>Signer employeur</Button>
      )}
      {['ISSUED', 'PARTIALLY_RETURNED'].includes(i.status) && (
        <Button size="small" color="error" onClick={() => closeTerm.mutate(i.id)}>Clôturer fin d'emploi</Button>
      )}
    </>
  );

  if (isLoading) return <Typography>Chargement…</Typography>;
  const fiche = data?.data;
  if (!fiche) return <Typography color="text.secondary">Aucune donnée uniforme.</Typography>;
  const { holdings, owed, issuances, returns, settlements } = fiche;

  return (
    <Box>
      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <Chip label={`Pièces détenues : ${holdings.reduce((s, h) => s + h.quantity, 0)}`} />
        <Chip color={owed.owed > 0 ? 'error' : 'success'} label={`Montant dû : ${money(owed.owed)}`} />
        <Chip variant="outlined" label={`Facturé : ${money(owed.charged)} • Réglé : ${money(owed.settled)}`} />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={2} flexWrap="wrap">
        <Button variant="contained" fullWidth={isMobile} onClick={() => setIssueOpen(true)}>
          Remettre des uniformes
        </Button>
        <Button variant="outlined" fullWidth={isMobile} onClick={() => navigate(`/uniformes/retours?employeeId=${employeeId}`)}>
          Retourner des uniformes
        </Button>
        <Button variant="text" fullWidth={isMobile} onClick={() => setSettleDlg(true)}>Enregistrer un règlement</Button>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" mb={1}>Détentions actuelles</Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Pièce</TableCell><TableCell>Grandeur</TableCell><TableCell align="right">Qté</TableCell><TableCell align="right">Coût unit.</TableCell></TableRow></TableHead>
            <TableBody>
              {holdings.map((h) => (
                <TableRow key={h.variantId}><TableCell>{h.itemName}</TableCell><TableCell>{h.size}</TableCell><TableCell align="right">{h.quantity}</TableCell><TableCell align="right">{money(h.replacementCost)}</TableCell></TableRow>
              ))}
              {holdings.length === 0 && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Aucune pièce détenue.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" mb={1}>Historique des remises</Typography>
        {isMobile ? (
          <Stack spacing={1.5}>
            {issuances.map((i) => (
              <Card key={i.id} variant="outlined">
                <CardContent sx={{ pb: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="body2" fontWeight={600}>
                      {new Date(i.issuedAt || i.createdAt).toLocaleDateString('fr-CA')}
                    </Typography>
                    <Chip size="small" label={statusLabel[i.status] || i.status} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {i.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'} · {money(i.totalLoanCost)}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'normal', lineHeight: 1.3 }}>
                    {summarizeLines(i.lines)}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
                    {issuanceActions(i as UniformIssuance)}
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {issuances.length === 0 && <Typography variant="body2" color="text.secondary">Aucune remise.</Typography>}
          </Stack>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Division</TableCell><TableCell>Statut</TableCell><TableCell>Pièces</TableCell><TableCell align="right">Coût</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
              <TableBody>
                {issuances.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{new Date(i.issuedAt || i.createdAt).toLocaleDateString('fr-CA')}</TableCell>
                    <TableCell>{i.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                    <TableCell><Chip size="small" label={statusLabel[i.status] || i.status} /></TableCell>
                    <TableCell sx={{ maxWidth: 360, fontSize: '0.85rem' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.3 }}>
                        {summarizeLines(i.lines)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{money(i.totalLoanCost)}</TableCell>
                    <TableCell align="right">{issuanceActions(i as UniformIssuance)}</TableCell>
                  </TableRow>
                ))}
                {issuances.length === 0 && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Aucune remise.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" mb={1}>Historique des retours</Typography>
        <Box sx={{ overflowX: 'auto' }}>
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
        </Box>
      </Paper>

      {settlements.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" mb={1}>Règlements</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Méthode</TableCell><TableCell>Note</TableCell><TableCell align="right">Montant</TableCell></TableRow></TableHead>
              <TableBody>
                {settlements.map((s: any) => (
                  <TableRow key={s.id}><TableCell>{new Date(s.createdAt).toLocaleDateString('fr-CA')}</TableCell><TableCell>{s.method}</TableCell><TableCell>{s.notes}</TableCell><TableCell align="right">{money(s.amount)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {editLinesFor && (
        <IssuanceLinesEditor
          open={!!editLinesFor}
          onClose={() => setEditLinesFor(null)}
          issuance={editLinesFor}
          employeeId={employeeId}
        />
      )}

      <MobileIssuanceSheet
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        employeeId={employeeId}
        onDone={() => qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] })}
      />

      <Dialog open={!!signEmployerFor} onClose={closeEmployerDlg} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Signature de l'employeur</DialogTitle>
        <DialogContent>
          <SignaturePad label="Signature" onChange={setEmployerSig} />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEmployerDlg}>Annuler</Button>
          <Button variant="contained" disabled={!employerSig || signEmployer.isPending} onClick={() => signEmployer.mutate()}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={settleDlg} onClose={() => setSettleDlg(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
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
    </Box>
  );
}
