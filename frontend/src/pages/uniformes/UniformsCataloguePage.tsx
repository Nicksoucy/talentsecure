import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Stack, TextField, MenuItem, Accordion, AccordionSummary,
  AccordionDetails, Table, TableHead, TableRow, TableCell, TableBody, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import type { UniformDivision, UniformItem, UniformStockLocation, UniformVariant } from '@/types/uniform';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const locQty = (v: UniformVariant, loc: UniformStockLocation) =>
  v.stockByLocation?.find((s) => s.location === loc)?.quantityOnHand ?? 0;

export default function UniformsCataloguePage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [division, setDivision] = useState<UniformDivision | ''>('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['uniform-items', division, search],
    queryFn: () => uniformService.listItems({ division: division || undefined, search: search || undefined }),
  });
  const items = data?.data || [];

  // ---- Dialog: nouveau morceau ----
  const [itemDlg, setItemDlg] = useState(false);
  const [itemForm, setItemForm] = useState({ division: 'SECURITE', type: 'UNIFORME', name: '', isOneSize: false, defaultReplacementCost: 0 });
  const createItem = useMutation({
    mutationFn: () => uniformService.createItem(itemForm as any),
    onSuccess: () => {
      enqueueSnackbar('Morceau créé', { variant: 'success' });
      setItemDlg(false);
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Dialog: nouvelle grandeur ----
  const [variantDlg, setVariantDlg] = useState<UniformItem | null>(null);
  const [variantForm, setVariantForm] = useState({ size: '', replacementCost: '', reorderThreshold: '', emplacement: '' });
  const createVariant = useMutation({
    mutationFn: () =>
      uniformService.createVariant(variantDlg!.id, {
        size: variantForm.size,
        replacementCost: variantForm.replacementCost ? Number(variantForm.replacementCost) : undefined,
        reorderThreshold: variantForm.reorderThreshold ? Number(variantForm.reorderThreshold) : undefined,
        ...(variantForm.emplacement ? { emplacement: variantForm.emplacement } : {}),
      } as any),
    onSuccess: () => {
      enqueueSnackbar('Grandeur ajoutée', { variant: 'success' });
      setVariantDlg(null);
      setVariantForm({ size: '', replacementCost: '', reorderThreshold: '', emplacement: '' });
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Dialog: réappro ----
  const [replenish, setReplenish] = useState<{ variantId: string; label: string } | null>(null);
  const [replenishQty, setReplenishQty] = useState('');
  const [replenishLoc, setReplenishLoc] = useState<UniformStockLocation>('BACK_OFFICE');
  const doReplenish = useMutation({
    mutationFn: () => uniformService.replenish(replenish!.variantId, Number(replenishQty), undefined, replenishLoc),
    onSuccess: () => {
      enqueueSnackbar('Stock ajouté', { variant: 'success' });
      setReplenish(null);
      setReplenishQty('');
      setReplenishLoc('BACK_OFFICE');
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  const grouped = useMemo(() => items, [items]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Catalogue des uniformes</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setItemDlg(true)}>
          Nouveau morceau
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} mb={2}>
        <TextField select size="small" label="Division" value={division} onChange={(e) => setDivision(e.target.value as any)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Toutes</MenuItem>
          <MenuItem value="SECURITE">Sécurité</MenuItem>
          <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
        </TextField>
        <TextField size="small" label="Recherche" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Stack>

      {isLoading && <Typography>Chargement…</Typography>}
      {!isLoading && grouped.length === 0 && <Typography color="text.secondary">Aucun morceau. Lancez le seed ou créez-en un.</Typography>}

      {grouped.map((item) => (
        <Accordion key={item.id}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center" width="100%">
              <Typography sx={{ flex: 1 }}>{item.name}</Typography>
              <Chip size="small" label={item.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'} />
              <Chip size="small" variant="outlined" label={item.type === 'EQUIPEMENT' ? 'Équipement' : 'Uniforme'} />
              <Chip size="small" color="default" label={`${item.variants?.length || 0} grandeur(s)`} />
              <Typography variant="body2" color="text.secondary">{money(item.defaultReplacementCost)}</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack direction="row" justifyContent="flex-end" mb={1}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setVariantDlg(item)}>
                Ajouter une grandeur
              </Button>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Grandeur</TableCell>
                  <TableCell>Code-barres</TableCell>
                  <TableCell>Emplacement</TableCell>
                  <TableCell align="right">Coût</TableCell>
                  <TableCell align="right">En stock</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(item.variants || []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.size}</TableCell>
                    <TableCell><code>{v.barcode}</code></TableCell>
                    <TableCell>{v.emplacement || '—'}</TableCell>
                    <TableCell align="right">{money(v.replacementCost)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Back ${locQty(v, 'BACK_OFFICE')} · Front ${locQty(v, 'FRONT_OFFICE')}`} arrow>
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                          <Chip size="small" color={v.quantityOnHand > 0 ? 'success' : 'default'} label={v.quantityOnHand} />
                          <Typography variant="caption" color="text.secondary">
                            (B{locQty(v, 'BACK_OFFICE')}/F{locQty(v, 'FRONT_OFFICE')})
                          </Typography>
                        </Stack>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Réapprovisionner">
                        <IconButton size="small" onClick={() => setReplenish({ variantId: v.id, label: `${item.name} — ${v.size}` })}>
                          <Inventory2Icon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Imprimer l'étiquette">
                        <IconButton size="small" component="a" href={uniformService.labelUrl(v.id)} target="_blank">
                          <PrintIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {(item.variants || []).length === 0 && (
                  <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Aucune grandeur.</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Nouveau morceau */}
      <Dialog open={itemDlg} onClose={() => setItemDlg(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau morceau</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField select label="Division" value={itemForm.division} onChange={(e) => setItemForm({ ...itemForm, division: e.target.value })}>
              <MenuItem value="SECURITE">Sécurité</MenuItem>
              <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
            </TextField>
            <TextField select label="Type" value={itemForm.type} onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}>
              <MenuItem value="UNIFORME">Uniforme</MenuItem>
              <MenuItem value="EQUIPEMENT">Équipement</MenuItem>
            </TextField>
            <TextField label="Nom" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
            <TextField select label="Taille unique ?" value={itemForm.isOneSize ? 'oui' : 'non'} onChange={(e) => setItemForm({ ...itemForm, isOneSize: e.target.value === 'oui' })}>
              <MenuItem value="non">Non (avec grandeurs)</MenuItem>
              <MenuItem value="oui">Oui (taille unique)</MenuItem>
            </TextField>
            <TextField type="number" label="Coût unitaire ($)" value={itemForm.defaultReplacementCost} onChange={(e) => setItemForm({ ...itemForm, defaultReplacementCost: Number(e.target.value) })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDlg(false)}>Annuler</Button>
          <Button variant="contained" disabled={!itemForm.name || createItem.isPending} onClick={() => createItem.mutate()}>Créer</Button>
        </DialogActions>
      </Dialog>

      {/* Nouvelle grandeur */}
      <Dialog open={!!variantDlg} onClose={() => setVariantDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Ajouter une grandeur — {variantDlg?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Grandeur (ex. M, 34, Unique)" value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} />
            <TextField type="number" label="Coût ($) — défaut du morceau si vide" value={variantForm.replacementCost} onChange={(e) => setVariantForm({ ...variantForm, replacementCost: e.target.value })} />
            <TextField type="number" label="Seuil de réappro (optionnel)" value={variantForm.reorderThreshold} onChange={(e) => setVariantForm({ ...variantForm, reorderThreshold: e.target.value })} />
            <TextField label="Emplacement (ex. B4, A1-A2, Étagère)" value={variantForm.emplacement} onChange={(e) => setVariantForm({ ...variantForm, emplacement: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariantDlg(null)}>Annuler</Button>
          <Button variant="contained" disabled={!variantForm.size || createVariant.isPending} onClick={() => createVariant.mutate()}>Ajouter</Button>
        </DialogActions>
      </Dialog>

      {/* Réappro */}
      <Dialog open={!!replenish} onClose={() => setReplenish(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Réapprovisionner</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>{replenish?.label}</Typography>
          <Stack spacing={2}>
            <TextField type="number" fullWidth label="Quantité à ajouter" value={replenishQty} onChange={(e) => setReplenishQty(e.target.value)} />
            <TextField select fullWidth label="Emplacement" value={replenishLoc} onChange={(e) => setReplenishLoc(e.target.value as UniformStockLocation)}>
              <MenuItem value="BACK_OFFICE">Back office (entrepôt)</MenuItem>
              <MenuItem value="FRONT_OFFICE">Front office (comptoir)</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplenish(null)}>Annuler</Button>
          <Button variant="contained" disabled={!replenishQty || doReplenish.isPending} onClick={() => doReplenish.mutate()}>Ajouter au stock</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
