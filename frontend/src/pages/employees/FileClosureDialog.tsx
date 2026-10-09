import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  employeeService,
  type ClosureInput,
  type ClosureOverview,
  type ClosurePreview,
  type ClosureReason,
} from '@/services/employee.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { printHtml } from '@/utils/printHtml';

const money = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
const REASONS: ClosureReason[] = ['INACTIVITE', 'DEMISSION', 'FIN_EMPLOI', 'AUTRE'];

interface Props {
  open: boolean;
  onClose: () => void;
  overview: ClosureOverview;
}

// LETTRE : lettre à l'employé (CC paie + RH). RECEPTION : uniformes reçus, la
// paie et les RH en sont avisées, rien à l'employé. SANS_ENVOI : rien à
// l'employé, courriel général à la paie facultatif.
type Mode = 'LETTRE' | 'RECEPTION' | 'SANS_ENVOI';

/**
 * « Fermer le dossier » : étape 1 = motif, date limite, texto ; étape 2 = aperçu
 * exact du courriel (À employé, CC paie + RH) et du texto, puis envoi.
 * Mode « sans rien envoyer » (uniformes déjà rapportés, aucun uniforme…) :
 * motif seulement, le dossier est fermé directement, sans aperçu.
 */
export default function FileClosureDialog({ open, onClose, overview }: Props) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { employee, defaults, estimate } = overview;
  const hasPieces = estimate.pieces.length > 0;

  const defaultMode: Mode = hasPieces ? 'LETTRE' : 'SANS_ENVOI';
  const [mode, setMode] = useState<Mode>(defaultMode);
  const silent = mode !== 'LETTRE';
  const reception = mode === 'RECEPTION';
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<ClosureReason>('INACTIVITE');
  const [reasonText, setReasonText] = useState(defaults.reasonTexts.INACTIVITE);
  const [deadline, setDeadline] = useState(defaults.deadline);
  const [sendSms, setSendSms] = useState(!!employee.phone);
  const [notifyPayroll, setNotifyPayroll] = useState(true);
  const payrollEmail = reception || notifyPayroll;
  const [uniformsReceived, setUniformsReceived] = useState(false);
  const [payrollNote, setPayrollNote] = useState('');
  const [preview, setPreview] = useState<ClosurePreview | null>(null);

  // Réouverture : repartir d'un formulaire propre. Volontairement sur `open`
  // seulement : un rafraîchissement des données ne doit pas effacer la saisie.
  useEffect(() => {
    if (open) {
      setStep(1);
      setMode(defaultMode);
      setNotifyPayroll(true);
      setPayrollNote('');
      setReason('INACTIVITE');
      setReasonText(defaults.reasonTexts.INACTIVITE);
      setDeadline(defaults.deadline);
      setSendSms(!!employee.phone);
      setUniformsReceived(false);
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Case grisée dès que le système montre des pièces : la valeur ne part qu'à vide.
  const received = uniformsReceived && !hasPieces;
  const input: ClosureInput = { reason, reasonText, deadline, sendSms, ...(received ? { uniformsReceived: true } : {}) };

  const previewMut = useMutation({
    mutationFn: () => employeeService.previewClosure(employee.id, input),
    onSuccess: (p) => {
      setPreview(p);
      setStep(2);
    },
    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, "Impossible de préparer l'aperçu"), { variant: 'error' }),
  });

  const sendMut = useMutation({
    mutationFn: () => employeeService.sendClosure(employee.id, input),
    onSuccess: (notice) => {
      qc.invalidateQueries({ queryKey: ['employee', employee.id] });
      qc.invalidateQueries({ queryKey: ['employee-closure', employee.id] });
      qc.invalidateQueries({ queryKey: ['employee-history', employee.id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['uniform-fiche', employee.id] });
      qc.invalidateQueries({ queryKey: ['rep-inactive-holdings'] });
      const failed = [notice.emailStatus, notice.smsStatus].includes('FAILED');
      enqueueSnackbar(
        failed
          ? 'Dossier fermé, mais un envoi a échoué — voir « Fermeture de dossier » pour renvoyer'
          : 'Dossier fermé — avis envoyé',
        { variant: failed ? 'warning' : 'success' },
      );
      onClose();
    },
    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Erreur lors de la fermeture du dossier'), { variant: 'error' }),
  });

  const silentMut = useMutation({
    mutationFn: () =>
      employeeService.closeSilently(employee.id, {
        reason,
        ...(hasPieces ? { deadline } : {}),
        notifyPayroll: payrollEmail,
        ...(reception ? { uniformsReceived: true } : {}),
        ...(payrollEmail && payrollNote.trim() ? { note: payrollNote.trim() } : {}),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['employee', employee.id] });
      qc.invalidateQueries({ queryKey: ['employee-closure', employee.id] });
      qc.invalidateQueries({ queryKey: ['employee-history', employee.id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['uniform-fiche', employee.id] });
      qc.invalidateQueries({ queryKey: ['rep-inactive-holdings'] });
      enqueueSnackbar(
        r.payrollNotified ? 'Dossier fermé — paie et RH avisées' : 'Dossier fermé — rien n’a été envoyé',
        { variant: 'success' },
      );
      onClose();
    },
    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Erreur lors de la fermeture du dossier'), { variant: 'error' }),
  });

  const pickReason = (r: ClosureReason) => {
    setReason(r);
    setReasonText(defaults.reasonTexts[r]);
  };

  const validDeadline = /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const canPreview = reasonText.trim().length > 0 && validDeadline;
  const canCloseSilently = !hasPieces || validDeadline;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Fermer le dossier — {employee.firstName} {employee.lastName}
      </DialogTitle>

      {step === 1 && (
        <DialogContent dividers>
          <Stack spacing={2}>
            <RadioGroup value={mode} onChange={(ev) => setMode(ev.target.value as Mode)}>
              <FormControlLabel
                value="LETTRE"
                control={<Radio />}
                label="Envoyer une lettre à l’employé (courriel, paie et RH en copie)"
              />
              <FormControlLabel
                value="RECEPTION"
                control={<Radio />}
                disabled={hasPieces}
                label={
                  hasPieces
                    ? 'Fermeture avec réception des uniformes — enregistrez d’abord le retour (« Retourner des uniformes »)'
                    : 'Fermeture avec réception des uniformes (la paie et les RH sont avisées, rien à l’employé)'
                }
              />
              <FormControlLabel
                value="SANS_ENVOI"
                control={<Radio />}
                label="Fermer sans rien envoyer à l’employé (employé déjà avisé, fermeture faite par une autre personne…)"
              />
            </RadioGroup>
            {!silent && !employee.email && (
              <Alert severity="warning">
                Aucun courriel au dossier : la lettre ne pourra pas être envoyée. Ajoutez le courriel sur la fiche
                (Modifier), ou continuez et remettez la lettre autrement.
              </Alert>
            )}
            {!silent && estimate.issuancesWithoutLines > 0 && (
              <Alert severity="warning">
                {estimate.issuancesWithoutLines} remise(s) sans pièces inscrites (import historique) : le montant ci-dessous
                est incomplet. Complétez la remise avant d’envoyer.
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Motif"
                size="small"
                value={reason}
                onChange={(ev) => pickReason(ev.target.value as ClosureReason)}
                sx={{ minWidth: 200 }}
              >
                {REASONS.map((r) => (
                  <MenuItem key={r} value={r}>{defaults.reasonLabels[r]}</MenuItem>
                ))}
              </TextField>
              {((!silent && !received) || (silent && hasPieces)) && <TextField
                label="Date limite de retour"
                type="date"
                size="small"
                value={deadline}
                onChange={(ev) => setDeadline(ev.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Par défaut : aujourd’hui + 14 jours"
              />}
            </Stack>

            {!silent && (
              <TextField
                label="Paragraphe d’ouverture (modifiable)"
                multiline
                minRows={4}
                value={reasonText}
                onChange={(ev) => setReasonText(ev.target.value)}
                fullWidth
              />
            )}

            <Box>
              <Typography variant="subtitle2" gutterBottom>Uniformes à rapporter</Typography>
              {hasPieces ? (
                <>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Pièce</TableCell>
                        <TableCell>Taille</TableCell>
                        <TableCell align="right">Qté</TableCell>
                        <TableCell align="right">Valeur</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {estimate.pieces.map((p, i) => (
                        <TableRow key={`${p.itemName}-${p.size}-${i}`}>
                          <TableCell>{p.itemName}</TableCell>
                          <TableCell>{p.size}</TableCell>
                          <TableCell align="right">{p.quantity}</TableCell>
                          <TableCell align="right">{money(p.lineTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Montant déduit de la paie si rien ne revient : <strong>{money(estimate.total)}</strong>
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {silent
                    ? 'Aucun uniforme détenu selon nos registres.'
                    : received
                    ? 'Aucun uniforme détenu selon nos registres — la lettre confirmera la réception des uniformes.'
                    : 'Aucun uniforme détenu selon nos registres — la lettre demandera seulement le retour des biens de la Compagnie.'}
                </Typography>
              )}
              {!silent && (
                <FormControlLabel
                  sx={{ mt: 1 }}
                  control={
                    <Checkbox
                      checked={received}
                      disabled={hasPieces}
                      onChange={(ev) => setUniformsReceived(ev.target.checked)}
                    />
                  }
                  label={
                    hasPieces
                      ? 'Uniformes reçus — enregistrez d’abord le retour (« Retourner des uniformes »)'
                      : 'Uniformes reçus — la lettre confirme la réception en date d’aujourd’hui (rien à retenir)'
                  }
                />
              )}
            </Box>

            {silent ? (
              <Stack spacing={1.5}>
                {!reception && (
                  <FormControlLabel
                    control={<Checkbox checked={notifyPayroll} onChange={(ev) => setNotifyPayroll(ev.target.checked)} />}
                    label={
                      hasPieces
                        ? 'Aviser la paie et les RH par courriel (dossier fermé, uniformes encore détenus)'
                        : 'Aviser la paie et les RH par courriel (dossier fermé, aucune retenue d’uniforme)'
                    }
                  />
                )}
                {payrollEmail && (
                  <TextField
                    label="Note pour la paie et les RH (optionnel)"
                    multiline
                    minRows={2}
                    value={payrollNote}
                    onChange={(ev) => setPayrollNote(ev.target.value)}
                    inputProps={{ maxLength: 2000 }}
                    fullWidth
                  />
                )}
                {hasPieces ? (
                  <Alert severity="warning">
                    Rien ne sera envoyé à l’employé, mais il détient encore des uniformes. Si rien ne revient d’ici la date
                    limite, le dossier uniformes sera fermé automatiquement et <strong>la paie recevra le montant à retenir</strong>.
                  </Alert>
                ) : reception ? (
                  <Alert severity="info">
                    L’employé passera à <strong>Inactif</strong>. Rien ne sera envoyé à l’employé ; la paie (RH en copie)
                    recevra « Retour d’uniformes — {employee.firstName} {employee.lastName} » : uniformes reçus le{' '}
                    {new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}, rien à
                    retenir, avec son nom, son téléphone et son courriel. La fermeture sera inscrite à l’historique du dossier.
                  </Alert>
                ) : (
                  <Alert severity="info">
                    L’employé passera à <strong>Inactif</strong>. Rien ne sera envoyé à l’employé
                    {notifyPayroll ? ' ; la paie (RH en copie) recevra un courriel général « dossier fermé, aucune retenue »' : ', ni à la paie'}.
                    La fermeture sera inscrite à l’historique du dossier.
                  </Alert>
                )}
              </Stack>
            ) : (
            <FormControlLabel
              control={
                <Checkbox checked={sendSms} disabled={!employee.phone} onChange={(ev) => setSendSms(ev.target.checked)} />
              }
              label={employee.phone ? `Envoyer aussi un texto au ${employee.phone}` : 'Aucun téléphone au dossier'}
            />
            )}
          </Stack>
        </DialogContent>
      )}

      {step === 2 && preview && (
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography variant="body2">
              <strong>À :</strong> {preview.to || <em>aucun courriel — la lettre ne partira pas</em>}
              <br />
              <strong>CC :</strong> {preview.cc.join(', ')}
              <br />
              <strong>Objet :</strong> {preview.subject}
            </Typography>
            <Box
              component="iframe"
              title="Aperçu du courriel"
              srcDoc={preview.html}
              sandbox=""
              sx={{ width: '100%', height: 480, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}
            />
            {sendSms && (
              <Alert severity="info" icon={false}>
                <strong>Texto :</strong> {preview.sms}
              </Alert>
            )}
            {received ? (
              <Alert severity="info">
                L’employé passera à <strong>Inactif</strong>. La lettre confirme la réception des uniformes en date
                d’aujourd’hui ; la paie et les RH la reçoivent en copie : rien à retenir.
              </Alert>
            ) : (
            <Alert severity="warning">
              L’employé passera à <strong>Inactif</strong>. Si aucun uniforme n’est revenu le{' '}
              {new Date(`${deadline}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}, le dossier
              uniformes sera fermé automatiquement et la paie recevra le montant à retenir. S’il en rapporte avant, même en
              partie, le retour compte comme complet et la paie reçoit un courriel « rien à retenir ».
            </Alert>
            )}
          </Stack>
        </DialogContent>
      )}

      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        {step === 1 && silent ? (
          <Button
            variant="contained"
            color="error"
            disabled={!canCloseSilently || silentMut.isPending}
            onClick={() => silentMut.mutate()}
            startIcon={silentMut.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {reception ? 'Fermer et confirmer la réception' : notifyPayroll ? 'Fermer et aviser la paie' : 'Fermer le dossier sans envoi'}
          </Button>
        ) : step === 1 ? (
          <Button
            variant="contained"
            disabled={!canPreview || previewMut.isPending}
            onClick={() => previewMut.mutate()}
            startIcon={previewMut.isPending ? <CircularProgress size={16} /> : undefined}
          >
            Voir l’aperçu
          </Button>
        ) : (
          <>
            <Button onClick={() => setStep(1)} disabled={sendMut.isPending}>Modifier</Button>
            <Button onClick={() => preview && printHtml(preview.html)} disabled={!preview}>Imprimer</Button>
            <Button
              variant="contained"
              color="error"
              disabled={sendMut.isPending}
              onClick={() => sendMut.mutate()}
              startIcon={sendMut.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Envoyer et fermer le dossier
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
