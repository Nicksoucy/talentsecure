import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Alert,
  useTheme, useMediaQuery,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useSnackbar } from 'notistack';
import { sendDraftIssuance } from '../sendDraftIssuance';
import SignaturePad from './SignaturePad';

interface Props {
  open: boolean;
  onClose: () => void;
  issuanceId: string | null;
  /** Appelé après un envoi réussi (pour invalider les caches du parent). */
  onSent?: () => void;
}

/**
 * Fenêtre d'envoi rapide d'un brouillon de remise. Propose de SIGNER côté
 * EMPLOYEUR tout de suite, puis : finalise (stock OUT) → enregistre la
 * signature employeur (si fournie) → envoie le SMS de signature à l'agent.
 * L'agent signe ensuite via le lien reçu par SMS.
 *
 * Permissions : gating côté appelant (les boutons « Envoyer » ne sont rendus
 * que si canWriteUniforms) ; le backend reste l'autorité.
 */
export default function SendIssuanceDialog({ open, onClose, issuanceId, onSent }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [employerSig, setEmployerSig] = useState<string | null>(null);

  // Réinitialise la signature à chaque ouverture.
  useEffect(() => { if (open) setEmployerSig(null); }, [open]);

  const send = useMutation({
    mutationFn: (sig?: string) => sendDraftIssuance(issuanceId!, sig),
    onSuccess: (res) => {
      if (!res.smsSent) {
        enqueueSnackbar(
          `Remise finalisée, mais l'envoi du SMS a échoué${res.smsError ? ` : ${res.smsError}` : ''}. Utilisez « Renvoyer le SMS ».`,
          { variant: 'warning', autoHideDuration: 12000 },
        );
      } else if (res.employerSignError) {
        enqueueSnackbar(
          "Remise envoyée (SMS à l'agent), mais la signature employeur a échoué — réessayez via « Signer employeur ».",
          { variant: 'warning', autoHideDuration: 12000 },
        );
      } else if (res.employerSigned) {
        enqueueSnackbar("Remise envoyée et signée côté employeur — SMS envoyé à l'agent", { variant: 'success' });
      } else {
        enqueueSnackbar("Remise envoyée — SMS de signature envoyé à l'agent", { variant: 'success' });
      }
      onSent?.();
      onClose();
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  return (
    <Dialog open={open} onClose={send.isPending ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      <DialogTitle>Envoyer la remise</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Le stock sera décrémenté et un SMS de signature sera envoyé à l'agent.
        </Alert>
        <Typography variant="subtitle2">Veux-tu signer côté employeur maintenant ?</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Optionnel — tu pourras aussi signer plus tard via « Signer employeur ».
        </Typography>
        <SignaturePad label="Signature de l'employeur (XGuard)" onChange={setEmployerSig} />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} disabled={send.isPending}>Annuler</Button>
        <Button onClick={() => send.mutate(undefined)} disabled={send.isPending}>
          Envoyer sans signer
        </Button>
        <Button
          variant="contained" startIcon={<SendIcon />}
          disabled={!employerSig || send.isPending}
          onClick={() => send.mutate(employerSig!)}
        >
          {send.isPending ? 'Envoi…' : 'Signer et envoyer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
