import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Table, TableHead, TableRow, TableCell, TableBody, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Tabs, Tab, Tooltip,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const moveLabel: Record<string, string> = { IN: 'Entrée', OUT: 'Sortie', ADJUST: 'Ajustement', LOST: 'Perdu', DAMAGED: 'Endommagé' };

export default function UniformInventoryPage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);

  const stock = useQuery({ queryKey: ['uniform-stock'], queryFn: () => uniformService.reportStock() });
  const movements = useQuery({ queryKey: ['uniform-movements'], queryFn: () => uniformService.listMovements({ limit: 100 }) });

  const [adjust, setAdjust] = useState<{ variantId: string; label: string } | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const doAdjust = useMutation({
    mutationFn: () => uniformService.adjust(adjust!.variantId, Number(qty), reason),
    onSuccess: () => {
      enqueueSnackbar('Inventaire ajusté', { variant: 'success' });
      setAdjust(null); setQty(''); setReason('');
      qc.invalidateQueries({ queryKey: ['uniform-stock'] });
      qc.invalidateQueries({ queryKey: ['uniform-movements'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  const rows = stock.data?.data.rows || [];
  const totals = stock.data?.data.totals;

  return (
    <Box>
      <Typography variant="h5" mb={2}>Inventaire</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stock" />
        <Tab label="Mouvements" />
      </Tabs>

      {tab === 0 && (
        <>
          {totals && (
            <Stack direction="row" spacing={3} mb={2}>
              <Chip label={`Unités en stock : ${totals.totalUnits}`} />
              <Chip color="primary" label={`Valeur totale : ${money(totals.totalValue)}`} />
            </Stack>
          )}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Morceau</TableCell>
                <TableCell>Division</TableCell>
                <TableCell>Grandeur</TableCell>
                <TableCell>Emplacement</TableCell>
                <TableCell align="right">En stock</TableCell>
                <TableCell align="right">Coût</TableCell>
                <TableCell align="right">Valeur</TableCell>
                <TableCell align="right">Ajuster</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.variantId} sx={r.lowStock ? { bgcolor: '#fff4e5' } : undefined}>
                  <TableCell>{r.itemName}</TableCell>
                  <TableCell>{r.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                  <TableCell>{r.size}</TableCell>
                  <TableCell>{r.emplacement || '—'}</TableCell>
                  <TableCell align="right">
                    <Chip size="small" color={r.lowStock ? 'warning' : r.quantityOnHand > 0 ? 'success' : 'default'} label={r.quantityOnHand} />
                  </TableCell>
                  <TableCell align="right">{money(r.replacementCost)}</TableCell>
                  <TableCell align="right">{money(r.value)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Ajuster l'inventaire">
                      <IconButton size="small" onClick={() => setAdjust({ variantId: r.variantId, label: `${r.itemName} — ${r.size}` })}>
                        <TuneIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {tab === 1 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Morceau</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Δ Qté</TableCell>
              <TableCell>Raison</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(movements.data?.data || []).map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>{new Date(m.createdAt).toLocaleString('fr-CA')}</TableCell>
                <TableCell>{m.variant ? `${m.variant.item?.name} — ${m.variant.size}` : m.variantId}</TableCell>
                <TableCell><Chip size="small" label={moveLabel[m.type] || m.type} /></TableCell>
                <TableCell align="right" sx={{ color: m.quantity < 0 ? 'error.main' : 'success.main' }}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </TableCell>
                <TableCell>{m.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!adjust} onClose={() => setAdjust(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Ajuster l'inventaire</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>{adjust?.label}</Typography>
          <Stack spacing={2}>
            <TextField type="number" fullWidth label="Delta (ex. +5 ou -3)" value={qty} onChange={(e) => setQty(e.target.value)} />
            <TextField fullWidth label="Raison" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjust(null)}>Annuler</Button>
          <Button variant="contained" disabled={!qty || doAdjust.isPending} onClick={() => doAdjust.mutate()}>Ajuster</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
