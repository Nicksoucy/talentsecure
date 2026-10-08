import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  employeeService,
  type ChannelStatus,
  type ClosureOverview,
  type ClosureTrackingStatus,
} from '@/services/employee.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { printHtml } from '@/utils/printHtml';

const money = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;
const fmtDay = (d: string) => new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('fr-CA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const CHANNEL: Record<ChannelStatus, { label: string; color: 'success' | 'error' | 'default' }> = {
  SENT: { label: 'envoyé', color: 'success' },
  FAILED: { label: 'échec', color: 'error' },
  SKIPPED: { label: 'non envoyé', color: 'default' },
};

function trackingChip(status: ClosureTrackingStatus, daysLeft: number | null, owed: number) {
  switch (status) {
    case 'EN_ATTENTE':
      return (
        <Chip
          color="warning"
          label={daysLeft === 0 ? 'En attente — échéance aujourd’hui' : `En attente — ${daysLeft} jour(s) restant(s)`}
        />
      );
    case 'RAPPORTE':
      return <Chip color="success" label="Uniformes rapportés" />;
    case 'TRANSMIS_PAIE':
      return <Chip color="error" label={`Transmis à la paie — ${money(owed)}`} />;
    default:
      return <Chip label="Aucun uniforme à récupérer" />;
  }
}

/** Suivi « Fermeture de dossier » sur la fiche employé : dernier avis + état. */
export default function FileClosureCard({ overview, canWrite }: { overview: ClosureOverview; canWrite: boolean }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const notice = overview.notices[0];

  const resendMut = useMutation({
    mutationFn: () => employeeService.resendClosure(overview.employee.id, notice!.id),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['employee-closure', overview.employee.id] });
      const failed = [n.emailStatus, n.smsStatus].includes('FAILED');
      enqueueSnackbar(failed ? 'Renvoi encore en échec' : 'Avis renvoyé', { variant: failed ? 'warning' : 'success' });
    },
    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Erreur lors du renvoi'), { variant: 'error' }),
  });

  const printMut = useMutation({
    mutationFn: () => employeeService.getClosureLetter(overview.employee.id, notice!.id),
    onSuccess: (html) => printHtml(html),
    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Impossible d’ouvrir la lettre'), { variant: 'error' }),
  });

  const smsMut = useMutation({
    mutationFn: () => employeeService.sendClosureSms(overview.employee.id, notice!.id),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['employee-closure', overview.employee.id] });
      qc.invalidateQueries({ queryKey: ['employee-history', overview.employee.id] });
      const ok = n.smsStatus === 'SENT';
      enqueueSnackbar(ok ? 'Texto envoyé' : `Texto non envoyé : ${n.smsError ?? 'erreur'}`, { variant: ok ? 'success' : 'error' });
    },
    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Erreur lors de l’envoi du texto'), { variant: 'error' }),
  });

  if (!notice || !overview.tracking) return null;
  // Texto jamais demandé (case non cochée) : on peut l'envoyer après coup.
  const canSendSmsLater = canWrite && !!overview.employee.phone && !notice.smsTo;
  const email = CHANNEL[notice.emailStatus];
  const sms = CHANNEL[notice.smsStatus];
  const anyFailed = notice.emailStatus === 'FAILED' || (notice.smsTo && notice.smsStatus === 'FAILED');

  return (
    <Paper sx={{ p: 2, mb: 3 }} variant="outlined">
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
        <Typography variant="subtitle1" fontWeight="bold">Fermeture de dossier</Typography>
        {trackingChip(overview.tracking.status, overview.tracking.daysLeft, overview.tracking.owed)}
      </Stack>
      <Typography variant="body2">
        Avis envoyé le {fmtDateTime(notice.sentAt)}
        {notice.sentByName ? ` par ${notice.sentByName}` : ''} — date limite de retour :{' '}
        <strong>{fmtDay(notice.returnDeadlineAt)}</strong>
        {notice.estimatedAmount > 0 ? ` — montant annoncé : ${money(notice.estimatedAmount)}` : ''}
      </Typography>
      <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" color={email.color}
          label={`Courriel ${email.label}${notice.emailTo ? ` · ${notice.emailTo}` : ''}`} />
        <Chip size="small" variant="outlined" label={`CC ${notice.emailCc.join(', ')}`} />
        {notice.smsTo && (
          <Chip size="small" variant="outlined" color={sms.color} label={`Texto ${sms.label} · ${notice.smsTo}`} />
        )}
      </Stack>
      <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
        <Button size="small" variant="outlined" disabled={printMut.isPending} onClick={() => printMut.mutate()}>
          {printMut.isPending ? 'Ouverture…' : 'Imprimer la lettre'}
        </Button>
        {canSendSmsLater && (
          <Button size="small" variant="outlined" disabled={smsMut.isPending} onClick={() => smsMut.mutate()}>
            {smsMut.isPending ? 'Envoi…' : `Envoyer le texto au ${overview.employee.phone}`}
          </Button>
        )}
      </Stack>
      {anyFailed && (
        <Alert
          severity="error"
          sx={{ mt: 1.5 }}
          action={
            canWrite ? (
              <Button color="inherit" size="small" disabled={resendMut.isPending} onClick={() => resendMut.mutate()}>
                {resendMut.isPending ? 'Envoi…' : 'Renvoyer'}
              </Button>
            ) : undefined
          }
        >
          <Box>
            {notice.emailStatus === 'FAILED' && <div>Courriel : {notice.emailError}</div>}
            {notice.smsTo && notice.smsStatus === 'FAILED' && <div>Texto : {notice.smsError}</div>}
          </Box>
        </Alert>
      )}
      {notice.emailStatus === 'SKIPPED' && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Aucun courriel au dossier : la lettre n’est pas partie. Ajoutez le courriel (Modifier) puis « Renvoyer ».
          {canWrite && (
            <Button size="small" sx={{ ml: 1 }} disabled={resendMut.isPending} onClick={() => resendMut.mutate()}>
              Renvoyer
            </Button>
          )}
        </Alert>
      )}
    </Paper>
  );
}
