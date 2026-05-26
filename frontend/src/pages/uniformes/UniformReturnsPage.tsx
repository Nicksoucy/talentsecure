import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, TextField, MenuItem, Autocomplete, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Divider, Alert,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { employeeService } from '@/services/employee.service';
import type { UniformItemCondition } from '@/types/uniform';
import SignaturePad from './components/SignaturePad';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;

interface Row {
  variantId: string;
  name: string;
  size: string;
  unitCost: number;
  remaining: number;
  qty: number;
  condition: UniformItemCondition;
}

export default function UniformReturnsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [employee, setEmployee] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [issuanceId, setIssuanceId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [returnId, setReturnId] = useState<string | null>(null);

  // Pré-sélection de l'agent si on arrive depuis sa fiche (?employeeId=...)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('employeeId');
    if (id) employeeService.getEmployeeById(id).then((r) => setEmployee(r.data)).catch(() => {});
  }, [searchParams]);

  const employees = useQuery({
    queryKey: ['emp-search-ret', empSearch],
    queryFn: () => employeeService.getEmployees({ search: empSearch || undefined, limit: 15 }),
  });

  const issuances = useQuery({
    queryKey: ['emp-issuances', employee?.id],
    queryFn: () => uniformService.listIssuances({ employeeId: employee.id, limit: 50 }),
    enabled: !!employee?.id,
  });
  const activeIssuances = useMemo(
    () => (issuances.data?.data || []).filter((i) => ['ISSUED', 'PARTIALLY_RETURNED'].includes(i.status)),
    [issuances.data]
  );

  const loadIssuance = async (id: string) => {
    setIssuanceId(id);
    const { data } = await uniformService.getIssuance(id);
    const returnedMap = new Map<string, number>();
    (data as any).returns?.forEach((ret: any) => {
      if (ret.status !== 'RETURNED') return;
      ret.lines.forEach((rl: any) => {
        if (rl.variantId) returnedMap.set(rl.variantId, (returnedMap.get(rl.variantId) || 0) + rl.quantity);
      });
    });
    const built: Row[] = (data.lines || [])
      .filter((l) => l.variantId)
      .map((l) => {
        const remaining = l.quantity - (returnedMap.get(l.variantId!) || 0);
        return {
          variantId: l.variantId!,
          name: l.variant?.item?.name || 'Pièce',
          size: l.variant?.size || '—',
          unitCost: Number(l.unitCostSnapshot),
          remaining,
          qty: remaining > 0 ? remaining : 0,
          condition: 'GOOD' as UniformItemCondition,
        };
      })
      .filter((r) => r.remaining > 0);
    setRows(built);
  };

  const createAndFinalize = useMutation({
    mutationFn: async () => {
      const lines = rows.filter((r) => r.qty > 0).map((r) => ({
        variantId: r.variantId,
        quantity: r.qty,
        condition: r.condition,
        unitReplacementCost: r.unitCost,
      }));
      const created = await uniformService.createReturn({ issuanceId, lines });
      const id = created.data.id;
      await uniformService.finalizeReturn(id);
      return id;
    },
    onSuccess: (id) => { setReturnId(id); enqueueSnackbar('Retour finalisé', { variant: 'success' }); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // Signature
  const [empSig, setEmpSig] = useState<string | null>(null);
  const [emprSig, setEmprSig] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const sendSms = useMutation({
    mutationFn: () => uniformService.sendReturnSms(returnId!),
    onSuccess: () => enqueueSnackbar('SMS envoyé', { variant: 'success' }),
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Échec SMS', { variant: 'warning' }),
  });
  const counterSign = useMutation({
    mutationFn: () => uniformService.counterSignReturn(returnId!, { employeeSignatureBase64: empSig || undefined, employerSignatureBase64: emprSig || undefined, signedByName }),
    onSuccess: () => { enqueueSnackbar('Signature enregistrée', { variant: 'success' }); navigate(`/employees/${employee.id}`); },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  return (
    <Box>
      <Typography variant="h5" mb={2}>Retour d'uniforme</Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Autocomplete
            sx={{ flex: 1, minWidth: 280 }}
            options={employees.data?.data || []}
            getOptionLabel={(o: any) => `${o.firstName} ${o.lastName}`}
            value={employee}
            onChange={(_, v) => { setEmployee(v); setIssuanceId(''); setRows([]); setReturnId(null); }}
            onInputChange={(_, v) => setEmpSearch(v)}
            renderInput={(params) => <TextField {...params} label="Agent" size="small" />}
            isOptionEqualToValue={(o: any, v: any) => o.id === v?.id}
            disabled={!!returnId}
          />
          <TextField select size="small" label="Remise" value={issuanceId} onChange={(e) => loadIssuance(e.target.value)} sx={{ minWidth: 280 }} disabled={!employee || !!returnId}>
            {activeIssuances.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {new Date(i.issuedAt || i.createdAt).toLocaleDateString('fr-CA')} — {i.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'} ({i.itemsCount} pièces)
              </MenuItem>
            ))}
            {employee && activeIssuances.length === 0 && <MenuItem disabled value="">Aucune remise active</MenuItem>}
          </TextField>
        </Stack>
      </Paper>

      {rows.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pièce</TableCell><TableCell>Grandeur</TableCell><TableCell align="right">Détenu</TableCell>
                <TableCell align="right">Qté retournée</TableCell><TableCell>État</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.variantId}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.size}</TableCell>
                  <TableCell align="right">{r.remaining}</TableCell>
                  <TableCell align="right">
                    <TextField type="number" size="small" value={r.qty} disabled={!!returnId}
                      onChange={(e) => { const v = Math.max(0, Math.min(r.remaining, Number(e.target.value))); setRows(rows.map((x, j) => j === i ? { ...x, qty: v } : x)); }}
                      sx={{ width: 90 }} />
                  </TableCell>
                  <TableCell>
                    <TextField select size="small" value={r.condition} disabled={!!returnId}
                      onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, condition: e.target.value as UniformItemCondition } : x))} sx={{ minWidth: 150 }}>
                      <MenuItem value="GOOD">Bon (réutilisable)</MenuItem>
                      <MenuItem value="DAMAGED">Endommagé</MenuItem>
                      <MenuItem value="LOST">Perdu</MenuItem>
                    </TextField>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!returnId && (
            <Stack direction="row" justifyContent="flex-end" mt={2}>
              <Button variant="contained" disabled={createAndFinalize.isPending || rows.every((r) => r.qty === 0)} onClick={() => createAndFinalize.mutate()}>
                Finaliser le retour
              </Button>
            </Stack>
          )}
        </Paper>
      )}

      {returnId && (
        <Paper sx={{ p: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>Retour finalisé. Le stock en bon état a été réintégré ; pertes/dommages portés au montant dû.</Alert>
          <Stack direction="row" spacing={2} mb={2}>
            <Button variant="outlined" startIcon={<SendIcon />} onClick={() => sendSms.mutate()} disabled={sendSms.isPending}>Envoyer le lien par SMS</Button>
            <Button variant="text" onClick={() => navigate(`/employees/${employee.id}`)}>Terminer plus tard</Button>
          </Stack>
          <Divider sx={{ my: 2 }}>ou signature au comptoir</Divider>
          <Stack spacing={2}>
            <TextField size="small" label="Nom signataire" value={signedByName} onChange={(e) => setSignedByName(e.target.value)} sx={{ maxWidth: 360 }} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
              <Box sx={{ flex: 1 }}><SignaturePad label="Signature de l'employé" onChange={setEmpSig} /></Box>
              <Box sx={{ flex: 1 }}><SignaturePad label="Signature de l'employeur" onChange={setEmprSig} /></Box>
            </Stack>
            <Stack direction="row" justifyContent="flex-end">
              <Button variant="contained" disabled={!empSig || counterSign.isPending} onClick={() => counterSign.mutate()}>Enregistrer la signature</Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
