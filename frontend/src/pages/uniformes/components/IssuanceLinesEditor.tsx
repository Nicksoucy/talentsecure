import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TextField, MenuItem, IconButton, Stack, Typography, Divider, Box, Alert,
  Card, CardContent, useTheme, useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import type { UniformDivision, UniformItem, UniformIssuance } from '@/types/uniform';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;

interface Props {
  open: boolean;
  onClose: () => void;
  issuance: UniformIssuance;
  employeeId: string;
}

interface RowState {
  variantId: string;
  qty: number;
}
interface CustomLine {
  name: string;
  cost: number;
  qty: number;
}

/**
 * Dialog d'édition des lignes d'une remise (DRAFT ou historique sans impact stock).
 * Réplique la grille du wizard mais en mode "edit" — pré-remplit avec les lignes
 * existantes, sauvegarde via PUT updateIssuance.
 */
export default function IssuanceLinesEditor({ open, onClose, issuance, employeeId }: Props) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const division = issuance.division as UniformDivision;

  const itemsQ = useQuery({
    queryKey: ['uniform-items-div', division],
    queryFn: () => uniformService.listItems({ division }),
    enabled: open,
  });
  const items = itemsQ.data?.data || [];
  const uniformeItems = useMemo(() => items.filter((i) => i.type === 'UNIFORME'), [items]);
  const equipItems = useMemo(() => items.filter((i) => i.type === 'EQUIPEMENT'), [items]);

  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [customs, setCustoms] = useState<CustomLine[]>([]);

  // Pré-remplit à l'ouverture avec les lignes existantes de la remise
  useEffect(() => {
    if (!open || items.length === 0) return;
    const initRows: Record<string, RowState> = {};
    for (const it of items) {
      const single = it.isOneSize || it.type === 'EQUIPEMENT' ? it.variants?.[0] : undefined;
      initRows[it.id] = { variantId: single?.id || '', qty: 0 };
    }
    const initCustoms: CustomLine[] = [];
    for (const line of issuance.lines || []) {
      if (line.variantId) {
        const owningItem = items.find((it) => it.variants?.some((v) => v.id === line.variantId));
        if (owningItem) {
          initRows[owningItem.id] = { variantId: line.variantId, qty: line.quantity };
        }
      } else if (line.customItemName) {
        initCustoms.push({ name: line.customItemName, qty: line.quantity, cost: Number(line.unitCostSnapshot ?? 0) });
      }
    }
    setRowState(initRows);
    setCustoms(initCustoms);
  }, [open, items, issuance.id]); // eslint-disable-line

  const effectiveVariant = (it: UniformItem) => {
    const st = rowState[it.id];
    return it.variants?.find((v) => v.id === st?.variantId);
  };
  const rowCost = (it: UniformItem) => Number(effectiveVariant(it)?.replacementCost ?? it.defaultReplacementCost);
  const setQty = (itemId: string, qty: number) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], qty: Math.max(0, qty) } }));
  const setSize = (itemId: string, variantId: string) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], variantId } }));

  const grandTotal =
    items.reduce((s, it) => s + (rowState[it.id]?.qty || 0) * rowCost(it), 0) +
    customs.reduce((s, c) => s + c.qty * c.cost, 0);

  const save = useMutation({
    mutationFn: async () => {
      for (const it of items) {
        const st = rowState[it.id];
        if (st && st.qty > 0 && !st.variantId) {
          throw new Error(`Choisissez une grandeur pour « ${it.name} »`);
        }
      }
      const lines = [
        ...items
          .filter((it) => (rowState[it.id]?.qty || 0) > 0)
          .map((it) => ({ variantId: rowState[it.id].variantId, quantity: rowState[it.id].qty, unitCost: rowCost(it) })),
        ...customs.filter((c) => c.name && c.qty > 0).map((c) => ({ customItemName: c.name, quantity: c.qty, unitCost: c.cost })),
      ];
      return uniformService.updateIssuance(issuance.id, { lines });
    },
    onSuccess: () => {
      enqueueSnackbar('Pièces mises à jour', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['uniform-fiche', employeeId] });
      onClose();
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  const renderSection = (title: string, list: UniformItem[]) => {
    if (list.length === 0) return null;
    return (
      <Box mb={2}>
        <Typography variant="subtitle2" sx={{ bgcolor: '#eef1f6', px: 1.5, py: 0.75, borderRadius: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        {isMobile ? (
          <Stack spacing={1} mt={1}>
            {list.map((it) => {
              const st = rowState[it.id] || { variantId: '', qty: 0 };
              const sized = !it.isOneSize && it.type !== 'EQUIPEMENT';
              const lineTotal = st.qty * rowCost(it);
              return (
                <Card key={it.id} variant="outlined" sx={{ bgcolor: st.qty > 0 ? '#f5faf5' : undefined }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Typography sx={{ fontWeight: 600, flex: 1 }}>{it.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{money(rowCost(it))}</Typography>
                    </Stack>
                    {sized ? (
                      <TextField select size="small" fullWidth value={st.variantId} onChange={(e) => setSize(it.id, e.target.value)} sx={{ mt: 1 }}>
                        <MenuItem value=""><em>— choisir —</em></MenuItem>
                        {(it.variants || []).filter((v) => v.isActive).map((v) => (
                          <MenuItem key={v.id} value={v.id}>{v.size}</MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Taille unique</Typography>
                    )}
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                      <IconButton onClick={() => setQty(it.id, (st.qty || 0) - 1)}><RemoveIcon /></IconButton>
                      <TextField size="small" type="number" value={st.qty} onChange={(e) => setQty(it.id, Number(e.target.value))} inputProps={{ style: { textAlign: 'center', width: 60 }, min: 0 }} />
                      <IconButton onClick={() => setQty(it.id, (st.qty || 0) + 1)}><AddIcon /></IconButton>
                      {lineTotal > 0 && <Typography sx={{ ml: 'auto', fontWeight: 600 }}>{money(lineTotal)}</Typography>}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '40%' }}>Pièce</TableCell>
                <TableCell sx={{ width: 140 }}>Taille</TableCell>
                <TableCell align="center" sx={{ width: 120 }}>Qté</TableCell>
                <TableCell align="right">Coût unit.</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((it) => {
                const st = rowState[it.id] || { variantId: '', qty: 0 };
                const sized = !it.isOneSize && it.type !== 'EQUIPEMENT';
                const lineTotal = st.qty * rowCost(it);
                return (
                  <TableRow key={it.id}>
                    <TableCell>{it.name}</TableCell>
                    <TableCell>
                      {sized ? (
                        <TextField select size="small" value={st.variantId} onChange={(e) => setSize(it.id, e.target.value)} sx={{ minWidth: 110 }}>
                          <MenuItem value=""><em>—</em></MenuItem>
                          {(it.variants || []).filter((v) => v.isActive).map((v) => (
                            <MenuItem key={v.id} value={v.id}>{v.size}</MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <Typography variant="body2" color="text.secondary">Unique</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <TextField size="small" type="number" value={st.qty} onChange={(e) => setQty(it.id, Number(e.target.value))} sx={{ width: 80 }} inputProps={{ min: 0 }} />
                    </TableCell>
                    <TableCell align="right">{money(rowCost(it))}</TableCell>
                    <TableCell align="right">{lineTotal > 0 ? money(lineTotal) : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>Modifier les pièces — {division === 'SECURITE' ? 'Sécurité' : 'Signalisation'}</DialogTitle>
      <DialogContent>
        {issuance.status !== 'DRAFT' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Remise historique (papier) — modification autorisée car aucun mouvement de stock n'a eu lieu.
          </Alert>
        )}
        {itemsQ.isLoading && <Typography>Chargement…</Typography>}
        {renderSection('Uniforme', uniformeItems)}
        {renderSection('Équipement', equipItems)}

        <Divider sx={{ my: 1 }} />
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <Typography variant="body2" sx={{ minWidth: 60 }}>Autre :</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setCustoms([...customs, { name: '', cost: 0, qty: 1 }])}>
            Ajouter une ligne libre
          </Button>
        </Stack>
        {customs.map((c, i) => (
          <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} mb={1}>
            <TextField size="small" label="Désignation" value={c.name} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} sx={{ flex: 1, width: { xs: '100%', sm: 'auto' } }} />
            <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              <TextField size="small" type="number" label="Qté" value={c.qty} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} sx={{ width: { xs: '50%', sm: 80 } }} />
              <TextField size="small" type="number" label="Coût ($)" value={c.cost} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) } : x))} sx={{ width: { xs: '50%', sm: 110 } }} />
              <IconButton size="small" onClick={() => setCustoms(customs.filter((_, j) => j !== i))}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          </Stack>
        ))}

        <Divider sx={{ my: 2 }} />
        <Stack direction="row" justifyContent="flex-end">
          <Typography variant="h6">Total : {money(grandTotal)}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()}>
          Enregistrer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
