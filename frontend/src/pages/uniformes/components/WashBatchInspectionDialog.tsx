import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Typography, Card,
  CardContent, ToggleButtonGroup, ToggleButton, TextField, Alert, Box, useTheme, useMediaQuery,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpIcon from '@mui/icons-material/Help';
import { useSnackbar } from 'notistack';
import { washBatchService, type WashBatch } from '@/services/uniform-wash-batch.service';
import type { UniformItemCondition } from '@/types/uniform';

interface Props {
  batch: WashBatch;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Dialog d'inspection post-lavage : 1 carte par pièce physique (qty=1),
 * choix GOOD / DAMAGED / LOST. Quand toutes les pièces ont été inspectées,
 * le bouton "Finaliser" devient actif.
 */
export default function WashBatchInspectionDialog({ batch, open, onClose, onSuccess }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [inspections, setInspections] = useState<Record<string, UniformItemCondition | null>>(() => {
    const init: Record<string, UniformItemCondition | null> = {};
    for (const item of batch.items) {
      init[item.id] = item.postWashCondition;
    }
    return init;
  });

  const setCondition = (itemId: string, condition: UniformItemCondition | null) => {
    setInspections((prev) => ({ ...prev, [itemId]: condition }));
  };

  const markAllGood = () => {
    const next: Record<string, UniformItemCondition | null> = {};
    for (const item of batch.items) next[item.id] = 'GOOD';
    setInspections(next);
  };

  const counts = batch.items.reduce(
    (acc, item) => {
      const c = inspections[item.id];
      if (c === 'GOOD') acc.good++;
      else if (c === 'DAMAGED') acc.damaged++;
      else if (c === 'LOST') acc.lost++;
      else acc.pending++;
      return acc;
    },
    { good: 0, damaged: 0, lost: 0, pending: 0 },
  );

  const allInspected = counts.pending === 0;

  const submit = useMutation({
    mutationFn: () => {
      const payload = batch.items
        .filter((i) => inspections[i.id] != null)
        .map((i) => ({ itemId: i.id, postWashCondition: inspections[i.id]! }));
      return washBatchService.inspect(batch.id, payload);
    },
    onSuccess: () => {
      enqueueSnackbar('Inspection finalisée', { variant: 'success' });
      onSuccess();
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>
        Inspection du lot #{batch.id.slice(0, 8)} — {batch.items.length} pièce(s)
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Inspecter chaque pièce après lavage : marquer <strong>Bonne</strong> (retour stock),
          <strong> Endommagée</strong> (poubelle), ou <strong>Perdue</strong>.
        </Alert>

        <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
          <Typography variant="body2">
            <CheckCircleIcon color="success" sx={{ verticalAlign: 'middle', fontSize: 18 }} /> Bonnes : <strong>{counts.good}</strong>
          </Typography>
          <Typography variant="body2">
            <CancelIcon color="error" sx={{ verticalAlign: 'middle', fontSize: 18 }} /> Endommagées : <strong>{counts.damaged}</strong>
          </Typography>
          <Typography variant="body2">
            🔴 Perdues : <strong>{counts.lost}</strong>
          </Typography>
          <Typography variant="body2" color="warning.main">
            <HelpIcon sx={{ verticalAlign: 'middle', fontSize: 18 }} /> À décider : <strong>{counts.pending}</strong>
          </Typography>
          <Box flex={1} />
          <Button size="small" onClick={markAllGood} disabled={counts.pending === 0}>
            Tout marquer Bonne
          </Button>
        </Stack>

        <Stack spacing={1.5}>
          {batch.items.map((item, idx) => {
            const current = inspections[item.id];
            return (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Pièce {idx + 1} / {batch.items.length}
                      </Typography>
                      <Typography variant="body1" fontWeight={500}>
                        {item.variant?.item.name || 'Pièce'} — taille {item.variant?.size}
                      </Typography>
                    </Box>
                    <ToggleButtonGroup
                      value={current}
                      exclusive
                      onChange={(_, v) => setCondition(item.id, v as UniformItemCondition | null)}
                      size="small"
                    >
                      <ToggleButton value="GOOD" color="success">
                        <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} /> Bonne
                      </ToggleButton>
                      <ToggleButton value="DAMAGED" color="error">
                        <CancelIcon fontSize="small" sx={{ mr: 0.5 }} /> Endommagée
                      </ToggleButton>
                      <ToggleButton value="LOST" color="error">
                        Perdue
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          variant="contained"
          onClick={() => submit.mutate()}
          disabled={!allInspected || submit.isPending}
        >
          Finaliser l'inspection
        </Button>
      </DialogActions>
    </Dialog>
  );
}
