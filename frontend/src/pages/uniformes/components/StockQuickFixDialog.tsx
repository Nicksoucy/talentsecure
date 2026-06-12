import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Tabs, Tab,
  TextField, MenuItem, Typography, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TuneIcon from '@mui/icons-material/Tune';
import AddBoxIcon from '@mui/icons-material/AddBox';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { invalidateUniformCaches } from '@/utils/uniformCache';
import type { UniformStockLocation } from '@/types/uniform';

/**
 * Correction rapide du stock d'UNE variante (morceau + taille) sans quitter la
 * page appelante : Transférer (back ↔ front), Ajuster (delta signé OU quantité
 * réelle comptée — l'écart est alors calculé côté serveur) et Réappro.
 *
 * Permissions : aucun gating interne — les appelants n'affichent les points
 * d'entrée que si `canWriteUniforms` (le backend reste l'autorité).
 */
export interface StockQuickFixTarget {
  variantId: string;
  /** Ex. « Chemise grise (ML) — M » */
  label: string;
  front: number;
  back: number;
}

export type StockQuickFixTab = 'transfer' | 'adjust' | 'replenish';

interface Props {
  open: boolean;
  onClose: () => void;
  target: StockQuickFixTarget | null;
  /** Onglet ouvert à l'arrivée (défaut : transfert). */
  initialTab?: StockQuickFixTab;
  /** Qté de transfert pré-remplie (ex. le manque constaté sur la ligne de remise). */
  suggestedTransferQty?: number;
  /** Emplacement par défaut de l'onglet Ajuster (remise : FRONT, inventaire : BACK). */
  defaultLocation?: UniformStockLocation;
  onSuccess?: () => void;
}

const locName: Record<UniformStockLocation, string> = {
  BACK_OFFICE: 'Back office (entrepôt)',
  FRONT_OFFICE: 'Front office (comptoir)',
};

export default function StockQuickFixDialog({
  open, onClose, target, initialTab = 'transfer', suggestedTransferQty, defaultLocation = 'BACK_OFFICE', onSuccess,
}: Props) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [tab, setTab] = useState<StockQuickFixTab>(initialTab);
  // Transférer
  const [transferFrom, setTransferFrom] = useState<UniformStockLocation>('BACK_OFFICE');
  const [transferQty, setTransferQty] = useState('');
  // Ajuster
  const [adjustMode, setAdjustMode] = useState<'delta' | 'absolute'>('delta');
  const [adjustLoc, setAdjustLoc] = useState<UniformStockLocation>(defaultLocation);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  // Réappro
  const [replenishLoc, setReplenishLoc] = useState<UniformStockLocation>('BACK_OFFICE');
  const [replenishQty, setReplenishQty] = useState('');
  const [replenishReason, setReplenishReason] = useState('');

  // (Ré)initialise les champs à chaque OUVERTURE seulement — si `target` se
  // rafraîchit pendant que le dialog est ouvert (refetch), la saisie est gardée.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setTransferFrom('BACK_OFFICE');
    const avail = target?.back ?? 0;
    setTransferQty(suggestedTransferQty ? String(Math.min(suggestedTransferQty, avail) || '') : '');
    setAdjustMode('delta');
    setAdjustLoc(defaultLocation);
    setAdjustQty('');
    setAdjustReason('');
    setReplenishLoc('BACK_OFFICE');
    setReplenishQty('');
    setReplenishReason('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const transferTo: UniformStockLocation = transferFrom === 'BACK_OFFICE' ? 'FRONT_OFFICE' : 'BACK_OFFICE';
  const transferAvail = target ? (transferFrom === 'BACK_OFFICE' ? target.back : target.front) : 0;
  const adjustCurrent = target ? (adjustLoc === 'FRONT_OFFICE' ? target.front : target.back) : 0;
  const absoluteDelta = adjustQty === '' ? null : Number(adjustQty) - adjustCurrent;

  const afterSuccess = (message?: string) => {
    enqueueSnackbar(message || 'Stock mis à jour', { variant: 'success' });
    invalidateUniformCaches(qc);
    onSuccess?.();
    onClose();
  };
  const onErr = (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' });

  const doTransfer = useMutation({
    mutationFn: () => uniformService.transfer(target!.variantId, { quantity: Number(transferQty), from: transferFrom, to: transferTo }),
    onSuccess: (r: any) => afterSuccess(r?.message || 'Transfert effectué'),
    onError: onErr,
  });
  const doAdjust = useMutation({
    mutationFn: () =>
      adjustMode === 'absolute'
        ? uniformService.adjust(target!.variantId, { setTo: Number(adjustQty) }, adjustReason || undefined, adjustLoc)
        : uniformService.adjust(target!.variantId, Number(adjustQty), adjustReason || undefined, adjustLoc),
    onSuccess: (r: any) => afterSuccess(r?.message || 'Inventaire ajusté'),
    onError: onErr,
  });
  const doReplenish = useMutation({
    mutationFn: () => uniformService.replenish(target!.variantId, Number(replenishQty), replenishReason || undefined, replenishLoc),
    onSuccess: (r: any) => afterSuccess(r?.message || 'Stock ajouté'),
    onError: onErr,
  });

  const transferInvalid = !transferQty || Number(transferQty) <= 0 || Number(transferQty) > transferAvail;
  const adjustInvalid =
    adjustQty === '' ||
    (adjustMode === 'delta'
      ? Number(adjustQty) === 0 || !Number.isInteger(Number(adjustQty))
      : Number(adjustQty) < 0 || !Number.isInteger(Number(adjustQty)));
  const replenishInvalid = !replenishQty || Number(replenishQty) <= 0;

  const busy = doTransfer.isPending || doAdjust.isPending || doReplenish.isPending;

  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, pb: 0.5 }}>Corriger le stock</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">{target?.label}</Typography>
        <Typography variant="caption" color="text.secondary">
          Actuel — Front {target?.front ?? 0} · Back {target?.back ?? 0}
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mt: 1, mb: 2, minHeight: 38, '& .MuiTab-root': { minHeight: 38, textTransform: 'none' } }}>
          <Tab value="transfer" icon={<SwapHorizIcon fontSize="small" />} iconPosition="start" label="Transférer" />
          <Tab value="adjust" icon={<TuneIcon fontSize="small" />} iconPosition="start" label="Ajuster" />
          <Tab value="replenish" icon={<AddBoxIcon fontSize="small" />} iconPosition="start" label="Réappro" />
        </Tabs>

        {tab === 'transfer' && (
          <Stack spacing={2}>
            <TextField select size="small" label="De" value={transferFrom} onChange={(e) => setTransferFrom(e.target.value as UniformStockLocation)}>
              <MenuItem value="BACK_OFFICE">{locName.BACK_OFFICE}</MenuItem>
              <MenuItem value="FRONT_OFFICE">{locName.FRONT_OFFICE}</MenuItem>
            </TextField>
            <Typography variant="body2" color="text.secondary">
              Vers <b>{transferTo === 'FRONT_OFFICE' ? 'Front office' : 'Back office'}</b> · disponible à la source : {transferAvail}
            </Typography>
            <TextField
              type="number" size="small" label="Quantité" value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              error={!!transferQty && Number(transferQty) > transferAvail}
              helperText={!!transferQty && Number(transferQty) > transferAvail ? 'Dépasse le stock disponible' : ' '}
              inputProps={{ min: 1 }}
            />
          </Stack>
        )}

        {tab === 'adjust' && (
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive fullWidth size="small" value={adjustMode}
              onChange={(_, v) => { if (v) { setAdjustMode(v); setAdjustQty(''); } }}
            >
              <ToggleButton value="delta" sx={{ textTransform: 'none' }}>+/− Delta</ToggleButton>
              <ToggleButton value="absolute" sx={{ textTransform: 'none' }}>= Quantité réelle</ToggleButton>
            </ToggleButtonGroup>
            <TextField select size="small" label="Emplacement" value={adjustLoc} onChange={(e) => setAdjustLoc(e.target.value as UniformStockLocation)}>
              <MenuItem value="BACK_OFFICE">{locName.BACK_OFFICE}</MenuItem>
              <MenuItem value="FRONT_OFFICE">{locName.FRONT_OFFICE}</MenuItem>
            </TextField>
            <TextField
              type="number" size="small"
              label={adjustMode === 'delta' ? 'Delta (ex. +5 ou -3)' : 'Quantité réelle comptée'}
              value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)}
              inputProps={adjustMode === 'absolute' ? { min: 0 } : undefined}
              helperText={
                adjustMode === 'absolute'
                  ? `Actuel : ${adjustCurrent}${absoluteDelta === null ? '' : ` → écart : ${absoluteDelta > 0 ? `+${absoluteDelta}` : absoluteDelta}`}`
                  : ' '
              }
            />
            <TextField size="small" label="Raison" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </Stack>
        )}

        {tab === 'replenish' && (
          <Stack spacing={2}>
            <TextField select size="small" label="Emplacement" value={replenishLoc} onChange={(e) => setReplenishLoc(e.target.value as UniformStockLocation)}>
              <MenuItem value="BACK_OFFICE">{locName.BACK_OFFICE}</MenuItem>
              <MenuItem value="FRONT_OFFICE">{locName.FRONT_OFFICE}</MenuItem>
            </TextField>
            <TextField
              type="number" size="small" label="Quantité reçue" value={replenishQty}
              onChange={(e) => setReplenishQty(e.target.value)} inputProps={{ min: 1 }}
            />
            <TextField size="small" label="Raison" placeholder="Réapprovisionnement" value={replenishReason} onChange={(e) => setReplenishReason(e.target.value)} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>Annuler</Button>
        {tab === 'transfer' && (
          <Button variant="contained" disabled={transferInvalid || busy} onClick={() => doTransfer.mutate()} sx={{ textTransform: 'none' }}>
            Transférer
          </Button>
        )}
        {tab === 'adjust' && (
          <Button variant="contained" disabled={adjustInvalid || busy} onClick={() => doAdjust.mutate()} sx={{ textTransform: 'none' }}>
            Ajuster
          </Button>
        )}
        {tab === 'replenish' && (
          <Button variant="contained" disabled={replenishInvalid || busy} onClick={() => doReplenish.mutate()} sx={{ textTransform: 'none' }}>
            Ajouter au stock
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
