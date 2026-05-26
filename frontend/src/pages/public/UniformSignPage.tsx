import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Container, Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, Stack,
  Checkbox, FormControlLabel, TextField, Button, Alert, CircularProgress, Divider,
} from '@mui/material';
import { publicUniformService } from '@/services/public-uniform.service';
import SignaturePad from '../uniformes/components/SignaturePad';

const condLabel: Record<string, string> = { GOOD: 'Bon', DAMAGED: 'Endommagé', LOST: 'Perdu', NOT_RETURNED: 'Non retourné' };
const money = (n: any) => `$ ${Number(n || 0).toFixed(2)}`;

export default function UniformSignPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['sign', token],
    queryFn: () => publicUniformService.getSignPayload(token!),
    enabled: !!token,
    retry: false,
  });

  const [sig, setSig] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [cPayroll, setCPayroll] = useState(false);
  const [cPolicy, setCPolicy] = useState(false);
  const [cFit, setCFit] = useState(false);
  const [done, setDone] = useState(false);

  const payload = data?.data;

  const submit = useMutation({
    mutationFn: () =>
      publicUniformService.submitSignature(token!, {
        signatureBase64: sig!,
        signedByName: name,
        consents: { payroll: cPayroll, policy: cPolicy, fit: cFit },
      }),
    onSuccess: () => setDone(true),
  });

  if (isLoading) {
    return <Box display="flex" justifyContent="center" mt={10}><CircularProgress /></Box>;
  }
  if (isError) {
    const status = (error as any)?.response?.status;
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity={status === 410 ? 'warning' : 'error'}>
          {status === 410 ? 'Ce lien de signature a expiré. Contactez XGuard.' : 'Lien de signature invalide.'}
        </Alert>
      </Container>
    );
  }
  if (done) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="success">Merci ! Votre signature a été enregistrée.</Alert>
      </Container>
    );
  }
  if (payload?.alreadySigned) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="info">Ce formulaire a déjà été signé. Merci.</Alert>
      </Container>
    );
  }

  const isPret = payload?.kind === 'pret';
  const requiredConsents = isPret ? cPayroll && cFit && (payload?.consents.policy ? cPolicy : true) : true;

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" align="center" color="#1b2a4a" fontWeight={700} mb={0.5}>XGUARD SÉCURITÉ</Typography>
      <Typography variant="subtitle1" align="center" mb={3}>
        Formulaire de {isPret ? "prêt" : 'retour'} d'uniforme
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Typography mb={1}>Bonjour {payload?.employeeFirstName || ''}, veuillez vérifier puis signer.</Typography>

        <Table size="small" sx={{ mb: 1 }}>
          <TableHead><TableRow>
            <TableCell>Pièce</TableCell><TableCell>Grandeur</TableCell><TableCell align="right">Qté</TableCell>
            {!isPret && <TableCell>État</TableCell>}
            <TableCell align="right">Coût unit.</TableCell><TableCell align="right">Total</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {payload?.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>{l.name}</TableCell>
                <TableCell>{l.size}</TableCell>
                <TableCell align="right">{l.quantity}</TableCell>
                {!isPret && <TableCell>{condLabel[l.condition || ''] || l.condition}</TableCell>}
                <TableCell align="right">{money(l.unitCost)}</TableCell>
                <TableCell align="right">{money(l.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {isPret ? 'Coût total du prêt' : 'Valeur totale'} : {money(payload?.total)}
          </Typography>
        </Box>

        {isPret && (
          <Stack spacing={1} mb={2}>
            <Alert severity="warning" sx={{ fontWeight: 600 }}>
              Montant qui pourrait être prélevé de votre paie si non retourné : {money(payload?.total)}
            </Alert>
            <Typography variant="body2" color="text.secondary">{payload?.consents.payroll}</Typography>
            <FormControlLabel control={<Checkbox checked={cPayroll} onChange={(e) => setCPayroll(e.target.checked)} />} label="J'accepte le prélèvement sur ma dernière paie si non retourné." />
            {payload?.consents.policy && (
              <>
                <Divider />
                <Typography variant="body2" color="text.secondary">{payload.consents.policy}</Typography>
                <FormControlLabel control={<Checkbox checked={cPolicy} onChange={(e) => setCPolicy(e.target.checked)} />} label="J'accepte le respect du port de l'uniforme." />
              </>
            )}
            {payload?.consents.fit && (
              <FormControlLabel control={<Checkbox checked={cFit} onChange={(e) => setCFit(e.target.checked)} />} label={payload.consents.fit} />
            )}
          </Stack>
        )}

        <TextField fullWidth size="small" label="Votre nom complet" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />
        <SignaturePad label="Votre signature" onChange={setSig} />

        {submit.isError && <Alert severity="error" sx={{ mt: 2 }}>Erreur lors de l'envoi. Réessayez.</Alert>}

        <Button fullWidth variant="contained" size="large" sx={{ mt: 2 }}
          disabled={!sig || !name || !requiredConsents || submit.isPending}
          onClick={() => submit.mutate()}>
          Signer et envoyer
        </Button>
      </Paper>
    </Container>
  );
}
