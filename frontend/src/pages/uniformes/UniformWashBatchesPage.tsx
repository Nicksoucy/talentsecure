import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateUniformCaches } from '@/utils/uniformCache';
import {
  Box, Typography, Tabs, Tab, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
  Alert, Divider,
} from '@mui/material';
import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useSnackbar } from 'notistack';
import { washBatchService, type WashBatch, type WashBatchStatus } from '@/services/uniform-wash-batch.service';
import { usePerms } from '@/hooks/usePerms';
import WashBatchInspectionDialog from './components/WashBatchInspectionDialog';

const STATUS_LABELS: Record<WashBatchStatus, string> = {
  CREATED: 'Créé',
  SENT_TO_LAUNDRY: 'Envoyé au lavage',
  RETURNED_FROM_LAUNDRY: 'Revenu (à inspecter)',
  INSPECTED: 'Inspecté',
  CANCELLED: 'Annulé',
};
const STATUS_COLORS: Record<WashBatchStatus, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  CREATED: 'default',
  SENT_TO_LAUNDRY: 'primary',
  RETURNED_FROM_LAUNDRY: 'warning',
  INSPECTED: 'success',
  CANCELLED: 'error',
};

const ACTIVE_STATUSES: WashBatchStatus[] = ['CREATED', 'SENT_TO_LAUNDRY', 'RETURNED_FROM_LAUNDRY'];
const ARCHIVE_STATUSES: WashBatchStatus[] = ['INSPECTED', 'CANCELLED'];

export default function UniformWashBatchesPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const [openBatchId, setOpenBatchId] = useState<string | null>(routeId ?? null);

  const { data } = useQuery({
    queryKey: ['wash-batches', tab],
    queryFn: () => washBatchService.list({ status: tab === 'active' ? ACTIVE_STATUSES : ARCHIVE_STATUSES }),
  });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <LocalLaundryServiceIcon color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h5">Lots de lavage</Typography>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Actifs" value="active" />
        <Tab label="Archives" value="archive" />
      </Tabs>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell>Fournisseur</TableCell>
              <TableCell align="right">Pièces</TableCell>
              <TableCell>Envoyé le</TableCell>
              <TableCell>Revenu le</TableCell>
              <TableCell>Inspecté le</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.data || []).map((b) => (
              <TableRow key={b.id} hover>
                <TableCell>{b.id.slice(0, 8)}</TableCell>
                <TableCell>
                  <Chip label={STATUS_LABELS[b.status]} color={STATUS_COLORS[b.status]} size="small" />
                </TableCell>
                <TableCell>{b.vendor || '—'}</TableCell>
                <TableCell align="right">{b.items.length}</TableCell>
                <TableCell>{b.sentAt ? new Date(b.sentAt).toLocaleDateString('fr-CA') : '—'}</TableCell>
                <TableCell>{b.returnedAt ? new Date(b.returnedAt).toLocaleDateString('fr-CA') : '—'}</TableCell>
                <TableCell>{b.inspectedAt ? new Date(b.inspectedAt).toLocaleDateString('fr-CA') : '—'}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => setOpenBatchId(b.id)}>Ouvrir</Button>
                </TableCell>
              </TableRow>
            ))}
            {(data?.data || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" align="center">
                    Aucun lot {tab === 'active' ? 'actif' : 'archivé'}.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {openBatchId && (
        <WashBatchDialog
          batchId={openBatchId}
          onClose={() => {
            setOpenBatchId(null);
            if (routeId) navigate('/uniformes/lavage');
          }}
        />
      )}
    </Box>
  );
}

// =============================================================================
// Detail dialog
// =============================================================================

function WashBatchDialog({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const { canWriteUniforms } = usePerms();
  const [showSend, setShowSend] = useState(false);
  const [showInspect, setShowInspect] = useState(false);
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['wash-batch', batchId],
    queryFn: () => washBatchService.get(batchId),
  });
  const batch = data?.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wash-batch', batchId] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    invalidateUniformCaches(qc); // sync stock/items après inspection (pièces réintégrées)
  };

  const sendMutation = useMutation({
    mutationFn: () => washBatchService.send(batchId, { vendor: vendor || undefined, notes: notes || undefined }),
    onSuccess: () => { enqueueSnackbar('Lot envoyé au lavage', { variant: 'success' }); setShowSend(false); invalidate(); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const returnMutation = useMutation({
    mutationFn: () => washBatchService.markReturned(batchId),
    onSuccess: () => { enqueueSnackbar('Lot marqué comme revenu — inspection requise', { variant: 'success' }); invalidate(); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => washBatchService.cancel(batchId),
    onSuccess: () => { enqueueSnackbar('Lot annulé — pièces réinjectées au stock', { variant: 'success' }); invalidate(); onClose(); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const allGoodMutation = useMutation({
    mutationFn: () => washBatchService.inspectAllGood(batchId),
    onSuccess: () => { enqueueSnackbar('Lot réceptionné — toutes les pièces retournées au stock', { variant: 'success' }); invalidate(); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Lot de lavage #{batchId.slice(0, 8)}
        {batch && (
          <Chip
            label={STATUS_LABELS[batch.status]}
            color={STATUS_COLORS[batch.status]}
            size="small"
            sx={{ ml: 2 }}
          />
        )}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <Typography>Chargement…</Typography>}
        {batch && (
          <>
            <Stack spacing={1} mb={2}>
              <Typography variant="body2"><strong>Fournisseur :</strong> {batch.vendor || '—'}</Typography>
              <Typography variant="body2"><strong>Notes :</strong> {batch.notes || '—'}</Typography>
              <Typography variant="body2"><strong>Créé le :</strong> {new Date(batch.createdAt).toLocaleString('fr-CA')}</Typography>
              {batch.sentAt && <Typography variant="body2"><strong>Envoyé le :</strong> {new Date(batch.sentAt).toLocaleString('fr-CA')}</Typography>}
              {batch.returnedAt && <Typography variant="body2"><strong>Revenu le :</strong> {new Date(batch.returnedAt).toLocaleString('fr-CA')}</Typography>}
              {batch.inspectedAt && <Typography variant="body2"><strong>Inspecté le :</strong> {new Date(batch.inspectedAt).toLocaleString('fr-CA')}</Typography>}
            </Stack>

            {batch.status === 'CREATED' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>Lot ouvert</strong> — les retours d'agents marqués « Bon » s'ajoutent automatiquement ici jusqu'à l'envoi au lavage.
                Quand vous l'envoyez, un nouveau lot ouvert est créé pour les prochains retours.
              </Alert>
            )}
            {batch.status === 'RETURNED_FROM_LAUNDRY' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>Réception requise</strong> — 2 options :<br/>
                ✅ <strong>« Tout est OK »</strong> en 1 clic (cas normal — toutes les pièces retournent au stock)<br/>
                🔍 <strong>Inspection détaillée</strong> si une ou plusieurs pièces ont un problème
              </Alert>
            )}

            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" gutterBottom>Pièces ({batch.items.length})</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pièce</TableCell>
                  <TableCell>Taille</TableCell>
                  <TableCell>État post-lavage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batch.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.variant?.item.name || item.variantId.slice(0, 8)}</TableCell>
                    <TableCell>{item.variant?.size}</TableCell>
                    <TableCell>
                      {item.postWashCondition === 'GOOD' && <Chip icon={<CheckCircleIcon />} label="Bon" color="success" size="small" />}
                      {item.postWashCondition === 'DAMAGED' && <Chip icon={<CancelIcon />} label="Endommagé" color="error" size="small" />}
                      {item.postWashCondition === 'LOST' && <Chip label="Perdu" color="error" size="small" />}
                      {!item.postWashCondition && <Typography variant="caption" color="text.secondary">—</Typography>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {canWriteUniforms && batch?.status === 'CREATED' && (
          <>
            <Button color="error" onClick={() => cancelMutation.mutate()}>Annuler le lot</Button>
            <Button variant="contained" startIcon={<LocalShippingIcon />} onClick={() => setShowSend(true)}>
              Envoyer au lavage
            </Button>
          </>
        )}
        {canWriteUniforms && batch?.status === 'SENT_TO_LAUNDRY' && (
          <Button variant="contained" startIcon={<InventoryIcon />} onClick={() => returnMutation.mutate()}>
            Marquer comme revenu
          </Button>
        )}
        {canWriteUniforms && batch?.status === 'RETURNED_FROM_LAUNDRY' && (
          <>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => allGoodMutation.mutate()}
              disabled={allGoodMutation.isPending}
            >
              Tout est OK ({batch.items.length} pièces)
            </Button>
            <Button variant="outlined" color="warning" onClick={() => setShowInspect(true)}>
              Inspection détaillée…
            </Button>
          </>
        )}
        <Button onClick={onClose}>Fermer</Button>
      </DialogActions>

      {/* Send sub-dialog */}
      <Dialog open={showSend} onClose={() => setShowSend(false)}>
        <DialogTitle>Envoyer au lavage</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1} minWidth={400}>
            <TextField label="Fournisseur" value={vendor} onChange={(e) => setVendor(e.target.value)} fullWidth />
            <TextField label="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSend(false)}>Annuler</Button>
          <Button variant="contained" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>Envoyer</Button>
        </DialogActions>
      </Dialog>

      {showInspect && batch && (
        <WashBatchInspectionDialog
          batch={batch}
          open
          onClose={() => setShowInspect(false)}
          onSuccess={() => { setShowInspect(false); invalidate(); }}
        />
      )}
    </Dialog>
  );
}
