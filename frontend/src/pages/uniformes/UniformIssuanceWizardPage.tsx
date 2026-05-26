import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, TextField, MenuItem, Autocomplete, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Divider, Checkbox, FormControlLabel, Alert, IconButton, Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { employeeService } from '@/services/employee.service';
import type { UniformDivision, UniformItem } from '@/types/uniform';
import BarcodeScannerInput from './components/BarcodeScannerInput';
import SignaturePad from './components/SignaturePad';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;

interface RowState {
  variantId: string; // variante sélectionnée (= grandeur)
  qty: number;
}
interface CustomLine {
  name: string;
  cost: number;
  qty: number;
}

export default function UniformIssuanceWizardPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [employee, setEmployee] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [division, setDivision] = useState<UniformDivision>('SECURITE');
  const [dueReturnAt, setDueReturnAt] = useState('');
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [customs, setCustoms] = useState<CustomLine[]>([]);

  const employees = useQuery({
    queryKey: ['emp-search', empSearch],
    queryFn: () => employeeService.getEmployees({ search: empSearch || undefined, limit: 15, status: 'ACTIF' }),
  });
  const itemsQ = useQuery({
    queryKey: ['uniform-items-div', division],
    queryFn: () => uniformService.listItems({ division }),
  });
  const items = itemsQ.data?.data || [];

  // Pré-sélection de l'agent si on arrive depuis sa fiche (?employeeId=...)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('employeeId');
    if (id) employeeService.getEmployeeById(id).then((r) => setEmployee(r.data)).catch(() => {});
  }, [searchParams]);

  // Auto-sélection de la variante pour les pièces "taille unique" / équipement.
  useEffect(() => {
    const next: Record<string, RowState> = {};
    for (const it of items) {
      const single = it.isOneSize || it.type === 'EQUIPEMENT' ? it.variants?.[0] : undefined;
      next[it.id] = { variantId: single?.id || '', qty: 0 };
    }
    setRowState(next);
    setCustoms([]);
  }, [division, itemsQ.data]); // eslint-disable-line

  const effectiveVariant = (it: UniformItem) => {
    const st = rowState[it.id];
    return it.variants?.find((v) => v.id === st?.variantId);
  };
  const rowCost = (it: UniformItem) => Number(effectiveVariant(it)?.replacementCost ?? it.defaultReplacementCost);

  const setQty = (itemId: string, qty: number) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], qty: Math.max(0, qty) } }));
  const setSize = (itemId: string, variantId: string) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], variantId } }));

  const handleScan = async (code: string) => {
    try {
      const { data } = await uniformService.getByBarcode(code);
      const item = items.find((i) => i.id === data.itemId);
      if (!item) {
        enqueueSnackbar(`« ${data.item?.name} » n'est pas dans la division affichée`, { variant: 'warning' });
        return;
      }
      setRowState((p) => ({ ...p, [item.id]: { variantId: data.id, qty: (p[item.id]?.qty || 0) + 1 } }));
      enqueueSnackbar(`+1 ${item.name} (${data.size})`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Code-barres inconnu', { variant: 'error' });
    }
  };

  const uniformeItems = useMemo(() => items.filter((i) => i.type === 'UNIFORME'), [items]);
  const equipItems = useMemo(() => items.filter((i) => i.type === 'EQUIPEMENT'), [items]);

  const grandTotal =
    items.reduce((s, it) => s + (rowState[it.id]?.qty || 0) * rowCost(it), 0) +
    customs.reduce((s, c) => s + c.qty * c.cost, 0);
  const anyPicked = items.some((it) => (rowState[it.id]?.qty || 0) > 0) || customs.some((c) => c.name && c.qty > 0);

  // ---- Finalisation ----
  const [issuanceId, setIssuanceId] = useState<string | null>(null);
  const finalize = useMutation({
    mutationFn: async () => {
      // Validation : une ligne sized avec qté > 0 doit avoir une grandeur choisie.
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
      const created = await uniformService.createIssuance({
        employeeId: employee.id,
        division,
        dueReturnAt: dueReturnAt || undefined,
        lines,
      });
      const id = created.data.id;
      await uniformService.finalizeIssuance(id);
      return id;
    },
    onSuccess: (id) => {
      setIssuanceId(id);
      enqueueSnackbar('Remise finalisée — stock décrémenté', { variant: 'success' });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  // ---- Signature ----
  const [empSig, setEmpSig] = useState<string | null>(null);
  const [emprSig, setEmprSig] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const [cPayroll, setCPayroll] = useState(true);
  const [cPolicy, setCPolicy] = useState(division === 'SECURITE');
  const [cFit, setCFit] = useState(true);
  useEffect(() => setCPolicy(division === 'SECURITE'), [division]);

  const sendSms = useMutation({
    mutationFn: () => uniformService.sendIssuanceSms(issuanceId!),
    onSuccess: () => enqueueSnackbar('SMS de signature envoyé à l’agent', { variant: 'success' }),
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Échec SMS — utilisez la signature au comptoir', { variant: 'warning' }),
  });
  const [employerSigned, setEmployerSigned] = useState(false);
  const saveEmployer = useMutation({
    mutationFn: () => uniformService.counterSignIssuance(issuanceId!, { employerSignatureBase64: emprSig! }),
    onSuccess: () => {
      enqueueSnackbar("Signature de l'employeur enregistrée", { variant: 'success' });
      setEmployerSigned(true);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const counterSign = useMutation({
    mutationFn: () =>
      uniformService.counterSignIssuance(issuanceId!, {
        employeeSignatureBase64: empSig || undefined,
        signedByName,
        consents: { payroll: cPayroll, policy: cPolicy, fit: cFit },
      }),
    onSuccess: () => {
      enqueueSnackbar("Signature de l'agent enregistrée", { variant: 'success' });
      navigate(`/employees/${employee.id}`);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Rendu d'une section (grille type formulaire) ----
  const renderSection = (title: string, list: UniformItem[]) => {
    if (list.length === 0) return null;
    const subtotal = list.reduce((s, it) => s + (rowState[it.id]?.qty || 0) * rowCost(it), 0);
    return (
      <Box mb={2}>
        <Typography variant="subtitle2" sx={{ bgcolor: '#eef1f6', px: 1.5, py: 0.75, borderRadius: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '40%' }}>Pièce</TableCell>
              <TableCell sx={{ width: 150 }}>Taille</TableCell>
              <TableCell align="center" sx={{ width: 150 }}>Quantité</TableCell>
              <TableCell align="right">Coût unit.</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((it) => {
              const st = rowState[it.id] || { variantId: '', qty: 0 };
              const v = effectiveVariant(it);
              const sized = !it.isOneSize && it.type !== 'EQUIPEMENT';
              const overStock = !!v && st.qty > v.quantityOnHand;
              const lineTotal = st.qty * rowCost(it);
              return (
                <TableRow key={it.id} sx={st.qty > 0 ? { bgcolor: '#f5faf5' } : undefined}>
                  <TableCell>{it.name}</TableCell>
                  <TableCell>
                    {sized ? (
                      <TextField
                        select size="small" fullWidth value={st.variantId}
                        onChange={(e) => setSize(it.id, e.target.value)}
                        SelectProps={{ displayEmpty: true }}
                      >
                        <MenuItem value=""><em>— choisir —</em></MenuItem>
                        {(it.variants || []).map((variant) => (
                          <MenuItem key={variant.id} value={variant.id}>
                            {variant.size} ({variant.quantityOnHand})
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {it.isOneSize ? 'Taille unique' : '—'}{v ? ` (${v.quantityOnHand})` : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                      <IconButton size="small" onClick={() => setQty(it.id, (st.qty || 0) - 1)}><RemoveIcon fontSize="small" /></IconButton>
                      <TextField
                        size="small" type="number" value={st.qty}
                        onChange={(e) => setQty(it.id, Number(e.target.value))}
                        inputProps={{ style: { textAlign: 'center', width: 44 }, min: 0 }}
                        error={overStock}
                      />
                      <IconButton size="small" onClick={() => setQty(it.id, (st.qty || 0) + 1)}><AddIcon fontSize="small" /></IconButton>
                    </Stack>
                    {overStock && <Typography variant="caption" color="error">stock: {v?.quantityOnHand}</Typography>}
                  </TableCell>
                  <TableCell align="right">{money(rowCost(it))}</TableCell>
                  <TableCell align="right">{lineTotal > 0 ? money(lineTotal) : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Stack direction="row" justifyContent="flex-end" pr={1} mt={0.5}>
          <Typography variant="body2" color="text.secondary">Sous-total {title.toLowerCase()} : <b>{money(subtotal)}</b></Typography>
        </Stack>
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="h5" mb={2}>Nouvelle remise d'uniforme</Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <Autocomplete
            sx={{ flex: 1, minWidth: 260 }}
            options={employees.data?.data || []}
            getOptionLabel={(o: any) => `${o.firstName} ${o.lastName}${o.assignment ? ' — ' + o.assignment : ''}`}
            value={employee}
            onChange={(_, v) => setEmployee(v)}
            onInputChange={(_, v) => setEmpSearch(v)}
            renderInput={(params) => <TextField {...params} label="Agent" size="small" />}
            isOptionEqualToValue={(o: any, v: any) => o.id === v?.id}
            disabled={!!issuanceId}
          />
          <TextField select size="small" label="Division" value={division} onChange={(e) => setDivision(e.target.value as UniformDivision)} sx={{ minWidth: 170 }} disabled={!!issuanceId}>
            <MenuItem value="SECURITE">Sécurité</MenuItem>
            <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
          </TextField>
          <TextField type="date" size="small" label="Retour prévu" InputLabelProps={{ shrink: true }} value={dueReturnAt} onChange={(e) => setDueReturnAt(e.target.value)} disabled={!!issuanceId} />
        </Stack>
      </Paper>

      {!issuanceId && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <BarcodeScannerInput onScan={handleScan} autoFocus />
            <Typography variant="caption" color="text.secondary">Scannez une étiquette : la quantité de la ligne correspondante s'incrémente.</Typography>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            {itemsQ.isLoading && <Typography>Chargement du catalogue…</Typography>}
            {renderSection('Uniforme', uniformeItems)}
            {renderSection('Équipement', equipItems)}

            {/* Lignes "Autre" */}
            <Divider sx={{ my: 1 }} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center" mb={1}>
              <Typography variant="body2" sx={{ minWidth: 60 }}>Autre :</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCustoms([...customs, { name: '', cost: 0, qty: 1 }])}>
                Ajouter une ligne libre
              </Button>
            </Stack>
            {customs.map((c, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center" mb={1}>
                <TextField size="small" label="Désignation" value={c.name} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} sx={{ flex: 1 }} />
                <TextField size="small" type="number" label="Qté" value={c.qty} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} sx={{ width: 80 }} />
                <TextField size="small" type="number" label="Coût ($)" value={c.cost} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) } : x))} sx={{ width: 110 }} />
                <IconButton size="small" onClick={() => setCustoms(customs.filter((_, j) => j !== i))}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}

            <Divider sx={{ my: 2 }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Chip color={anyPicked ? 'primary' : 'default'} label={`${items.filter((it) => (rowState[it.id]?.qty || 0) > 0).length + customs.filter((c) => c.name && c.qty > 0).length} ligne(s)`} />
              <Typography variant="h6">Coût total du prêt : {money(grandTotal)}</Typography>
            </Stack>
          </Paper>

          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" size="large" disabled={!employee || !anyPicked || finalize.isPending} onClick={() => finalize.mutate()}>
              Finaliser la remise (décrémente le stock)
            </Button>
          </Stack>
        </>
      )}

      {issuanceId && (
        <Paper sx={{ p: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Remise finalisée. <b>L'employeur doit signer en premier</b>, puis l'agent (SMS ou au comptoir).
          </Alert>

          {/* 1) Signature employeur — obligatoire avant tout envoi */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" mb={1}>1. Signature de l'employeur</Typography>
            {employerSigned ? (
              <Alert severity="success">✓ Signature de l'employeur enregistrée.</Alert>
            ) : (
              <>
                <SignaturePad label="Signer au nom de XGuard" onChange={setEmprSig} />
                <Stack direction="row" justifyContent="flex-end" mt={1}>
                  <Button variant="contained" disabled={!emprSig || saveEmployer.isPending} onClick={() => saveEmployer.mutate()}>
                    Enregistrer la signature de l'employeur
                  </Button>
                </Stack>
              </>
            )}
          </Box>

          {/* 2) Signature de l'agent — débloquée une fois l'employeur signé */}
          <Box>
            <Typography variant="subtitle1" mb={1}>2. Signature de l'agent</Typography>
            <Stack direction="row" spacing={2} mb={2}>
              <Button variant="outlined" startIcon={<SendIcon />} onClick={() => sendSms.mutate()} disabled={!employerSigned || sendSms.isPending}>
                Envoyer le lien par SMS à l'agent
              </Button>
              <Button variant="text" onClick={() => navigate(`/employees/${employee.id}`)}>Terminer plus tard</Button>
            </Stack>
            <Divider sx={{ my: 2 }}>ou signature au comptoir</Divider>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                L'agent consent au prélèvement du coût total sur sa dernière paie si non retourné à la fin d'emploi.
              </Typography>
              <FormControlLabel control={<Checkbox checked={cPayroll} onChange={(e) => setCPayroll(e.target.checked)} />} label="Consentement prélèvement dernière paie" />
              {division === 'SECURITE' && (
                <FormControlLabel control={<Checkbox checked={cPolicy} onChange={(e) => setCPolicy(e.target.checked)} />} label="Respect du port de l'uniforme (Sécurité)" />
              )}
              <FormControlLabel control={<Checkbox checked={cFit} onChange={(e) => setCFit(e.target.checked)} />} label="Atteste avoir essayé, taille adéquate" />
              <TextField size="small" label="Nom de l'agent" value={signedByName} onChange={(e) => setSignedByName(e.target.value)} sx={{ maxWidth: 360 }} />
              <SignaturePad label="Signature de l'agent" onChange={setEmpSig} />
              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" disabled={!employerSigned || !empSig || counterSign.isPending} onClick={() => counterSign.mutate()}>
                  Enregistrer la signature de l'agent
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
