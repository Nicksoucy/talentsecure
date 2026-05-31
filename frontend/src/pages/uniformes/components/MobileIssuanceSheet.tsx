import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Stack, Typography, Button, IconButton,
  TextField, MenuItem, Card, CardContent, Chip, Divider, Alert, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import SendIcon from '@mui/icons-material/Send';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import type { UniformDivision, UniformStockLocation, UniformVariant } from '@/types/uniform';
import CameraScanner from './CameraScanner';
import BarcodeScannerInput from './BarcodeScannerInput';
import SignaturePad from './SignaturePad';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const locLabel: Record<UniformStockLocation, string> = {
  FRONT_OFFICE: 'Front office',
  BACK_OFFICE: 'Back office',
};

interface LineState {
  variant: UniformVariant;
  qty: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  /** Appelé à la fermeture après une remise créée — pour rafraîchir la fiche. */
  onDone?: () => void;
}

/** Stock disponible d'une variante à un emplacement donné (0 si inconnu). */
const locQty = (v: UniformVariant, loc: UniformStockLocation) =>
  v.stockByLocation?.find((s) => s.location === loc)?.quantityOnHand ?? 0;

/**
 * Remise d'uniformes « terrain » : plein écran sur mobile, scan caméra/USB,
 * choix de l'emplacement source, puis signature (employeur → SMS agent → repli
 * sur la page publique du même appareil). Ouvert depuis la fiche de l'agent.
 */
export default function MobileIssuanceSheet({ open, onClose, employeeId, onDone }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();

  const [division, setDivision] = useState<UniformDivision>('SECURITE');
  const [sourceLocation, setSourceLocation] = useState<UniformStockLocation>('FRONT_OFFICE');
  const [dueReturnAt, setDueReturnAt] = useState('');
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [showCamera, setShowCamera] = useState(false);

  // Après finalisation : on passe à l'étape signature.
  const [issuanceId, setIssuanceId] = useState<string | null>(null);
  const [signToken, setSignToken] = useState<string | null>(null);
  const [emprSig, setEmprSig] = useState<string | null>(null);
  const [employerSigned, setEmployerSigned] = useState(false);

  const otherLocation: UniformStockLocation = sourceLocation === 'FRONT_OFFICE' ? 'BACK_OFFICE' : 'FRONT_OFFICE';

  const lineArr = useMemo(() => Object.values(lines).filter((l) => l.qty > 0), [lines]);
  const grandTotal = lineArr.reduce((s, l) => s + l.qty * Number(l.variant.replacementCost), 0);

  const reset = () => {
    setDivision('SECURITE');
    setSourceLocation('FRONT_OFFICE');
    setDueReturnAt('');
    setLines({});
    setShowCamera(false);
    setIssuanceId(null);
    setSignToken(null);
    setEmprSig(null);
    setEmployerSigned(false);
  };

  const handleClose = () => {
    const created = !!issuanceId;
    reset();
    onClose();
    if (created) onDone?.();
  };

  const addVariant = (variant: UniformVariant) => {
    if (variant.item && variant.item.division !== division) {
      enqueueSnackbar(
        `« ${variant.item.name} » est en division ${variant.item.division === 'SECURITE' ? 'Sécurité' : 'Signalisation'} — vérifiez la division`,
        { variant: 'warning' }
      );
    }
    setLines((p) => {
      const cur = p[variant.id];
      return { ...p, [variant.id]: { variant, qty: (cur?.qty || 0) + 1 } };
    });
    enqueueSnackbar(`+1 ${variant.item?.name || 'pièce'} (${variant.size})`, { variant: 'success' });
  };

  const handleScan = async (code: string) => {
    try {
      const { data } = await uniformService.getByBarcode(code);
      addVariant(data);
    } catch {
      enqueueSnackbar('Code-barres inconnu', { variant: 'error' });
    }
  };

  const setQty = (variantId: string, qty: number) =>
    setLines((p) => ({ ...p, [variantId]: { ...p[variantId], qty: Math.max(0, qty) } }));
  const removeLine = (variantId: string) =>
    setLines((p) => {
      const next = { ...p };
      delete next[variantId];
      return next;
    });

  // ---- Finalisation : créer + finaliser (décrémente l'emplacement source) ----
  const finalize = useMutation({
    mutationFn: async () => {
      const payload = lineArr.map((l) => ({
        variantId: l.variant.id,
        quantity: l.qty,
        unitCost: Number(l.variant.replacementCost),
      }));
      const created = await uniformService.createIssuance({
        employeeId,
        division,
        sourceLocation,
        dueReturnAt: dueReturnAt || undefined,
        lines: payload,
      });
      const id = created.data.id;
      await uniformService.finalizeIssuance(id);
      const full = await uniformService.getIssuance(id);
      return { id, token: full.data.signToken ?? created.data.signToken ?? null };
    },
    onSuccess: ({ id, token }) => {
      setIssuanceId(id);
      setSignToken(token);
      enqueueSnackbar(`Remise finalisée — ${locLabel[sourceLocation]} décrémenté`, { variant: 'success' });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  // ---- Signatures ----
  const saveEmployer = useMutation({
    mutationFn: () => uniformService.counterSignIssuance(issuanceId!, { employerSignatureBase64: emprSig! }),
    onSuccess: () => {
      enqueueSnackbar("Signature de l'employeur enregistrée", { variant: 'success' });
      setEmployerSigned(true);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const sendSms = useMutation({
    mutationFn: () => uniformService.sendIssuanceSms(issuanceId!),
    onSuccess: () => enqueueSnackbar("SMS de signature envoyé à l'agent", { variant: 'success' }),
    onError: (e: any) =>
      enqueueSnackbar(
        e?.response?.data?.message || e?.response?.data?.error || 'Échec SMS — utilisez la signature sur cet appareil',
        { variant: 'warning', autoHideDuration: 12000 }
      ),
  });

  const openLocalSign = () => {
    if (!signToken) return;
    window.open(`/uniformes/signer/${signToken}`, '_blank', 'noopener');
  };

  const composing = !issuanceId;

  return (
    <Dialog open={open} onClose={handleClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {composing ? "Remettre des uniformes" : "Signature de la remise"}
        <IconButton onClick={handleClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {composing ? (
          <Stack spacing={2}>
            {/* Entête : division, emplacement source, date de retour */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select size="small" label="Division" value={division} fullWidth
                onChange={(e) => setDivision(e.target.value as UniformDivision)}
              >
                <MenuItem value="SECURITE">Sécurité</MenuItem>
                <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
              </TextField>
              <TextField
                select size="small" label="Emplacement source" value={sourceLocation} fullWidth
                onChange={(e) => setSourceLocation(e.target.value as UniformStockLocation)}
              >
                <MenuItem value="FRONT_OFFICE">Front office</MenuItem>
                <MenuItem value="BACK_OFFICE">Back office</MenuItem>
              </TextField>
            </Stack>
            <TextField
              type="date" size="small" label="Retour prévu (optionnel)" InputLabelProps={{ shrink: true }}
              value={dueReturnAt} onChange={(e) => setDueReturnAt(e.target.value)}
            />

            {/* Scan */}
            <Divider />
            {showCamera ? (
              <CameraScanner onScan={handleScan} onClose={() => setShowCamera(false)} />
            ) : (
              <Button variant="contained" startIcon={<PhotoCameraIcon />} onClick={() => setShowCamera(true)}>
                Scanner avec la caméra
              </Button>
            )}
            <BarcodeScannerInput onScan={handleScan} />
            <Typography variant="caption" color="text.secondary">
              Scannez le QR/code-barres d'une pièce : elle s'ajoute à la liste (+1 par scan).
            </Typography>

            {/* Liste en cartes */}
            <Divider />
            {lineArr.length === 0 && (
              <Typography variant="body2" color="text.secondary">Aucune pièce ajoutée pour l'instant.</Typography>
            )}
            <Stack spacing={1.5}>
              {lineArr.map((l) => {
                const avail = locQty(l.variant, sourceLocation);
                const otherAvail = locQty(l.variant, otherLocation);
                const insufficient = l.qty > avail;
                return (
                  <Card key={l.variant.id} variant="outlined" sx={insufficient ? { borderColor: 'error.main' } : undefined}>
                    <CardContent sx={{ pb: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="subtitle2">{l.variant.item?.name || 'Pièce'}</Typography>
                          <Stack direction="row" spacing={1} mt={0.5} alignItems="center">
                            <Chip size="small" label={l.variant.size} />
                            <Typography variant="caption" color={insufficient ? 'error' : 'text.secondary'}>
                              Dispo {locLabel[sourceLocation]} : {avail}
                            </Typography>
                          </Stack>
                        </Box>
                        <IconButton size="small" onClick={() => removeLine(l.variant.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <IconButton size="small" onClick={() => setQty(l.variant.id, l.qty - 1)}><RemoveIcon fontSize="small" /></IconButton>
                          <TextField
                            size="small" type="number" value={l.qty}
                            onChange={(e) => setQty(l.variant.id, Number(e.target.value))}
                            inputProps={{ style: { textAlign: 'center', width: 44 }, min: 0 }}
                            error={insufficient}
                          />
                          <IconButton size="small" onClick={() => setQty(l.variant.id, l.qty + 1)}><AddIcon fontSize="small" /></IconButton>
                        </Stack>
                        <Typography variant="body2"><b>{money(l.qty * Number(l.variant.replacementCost))}</b></Typography>
                      </Stack>
                      {insufficient && (
                        <Typography variant="caption" color="error" display="block" mt={0.5}>
                          Stock insuffisant à {locLabel[sourceLocation]}
                          {otherAvail > 0 ? ` — ${otherAvail} dispo à ${locLabel[otherLocation]}` : ''}.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>

            {lineArr.length > 0 && (
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Chip color="primary" label={`${lineArr.length} ligne(s)`} />
                <Typography variant="h6">{money(grandTotal)}</Typography>
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Alert severity="success">
              Remise finalisée. <b>L'employeur signe en premier</b>, puis l'agent (SMS ou sur cet appareil).
            </Alert>

            {/* 1) Employeur */}
            <Box>
              <Typography variant="subtitle1" mb={1}>1. Signature de l'employeur</Typography>
              {employerSigned ? (
                <Alert severity="success">✓ Signature de l'employeur enregistrée.</Alert>
              ) : (
                <>
                  <SignaturePad label="Signer au nom de XGuard" onChange={setEmprSig} />
                  <Stack direction="row" justifyContent="flex-end" mt={1}>
                    <Button variant="contained" disabled={!emprSig || saveEmployer.isPending} onClick={() => saveEmployer.mutate()}>
                      Enregistrer
                    </Button>
                  </Stack>
                </>
              )}
            </Box>

            {/* 2) Agent */}
            <Divider />
            <Box>
              <Typography variant="subtitle1" mb={1}>2. Signature de l'agent</Typography>
              <Stack spacing={1.5}>
                <Button
                  variant="contained" startIcon={<SendIcon />}
                  disabled={!employerSigned || sendSms.isPending}
                  onClick={() => sendSms.mutate()}
                >
                  Envoyer le lien par SMS à l'agent
                </Button>
                <Typography variant="caption" color="text.secondary">
                  L'agent signe lui-même depuis son téléphone (trace de signature personnelle).
                </Typography>
                <Divider>SMS pas reçu ?</Divider>
                <Button
                  variant="outlined" startIcon={<OpenInNewIcon />}
                  disabled={!employerSigned || !signToken}
                  onClick={openLocalSign}
                >
                  Faire signer l'agent sur cet appareil
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Ouvre la page de signature : tendez le téléphone à l'agent pour qu'il signe.
                </Typography>
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {composing ? (
          <>
            <Button onClick={handleClose}>Annuler</Button>
            <Button
              variant="contained"
              disabled={lineArr.length === 0 || finalize.isPending}
              onClick={() => finalize.mutate()}
            >
              Finaliser la remise
            </Button>
          </>
        ) : (
          <Button variant="text" onClick={handleClose}>Terminer</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
