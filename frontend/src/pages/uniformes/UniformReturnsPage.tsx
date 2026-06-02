import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, TextField, MenuItem, Autocomplete, Button, Alert, Card,
  CardContent, ToggleButtonGroup, ToggleButton, Divider, Chip, Grid,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpIcon from '@mui/icons-material/Help';
import SendIcon from '@mui/icons-material/Send';
import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { employeeService } from '@/services/employee.service';
import { usePerms } from '@/hooks/usePerms';
import type { UniformItemCondition } from '@/types/uniform';
import SignaturePad from './components/SignaturePad';

// =============================================================================
// UI carte-par-pièce : 1 carte = 1 pièce physique = 1 ligne de retour (qty=1).
// =============================================================================

interface Piece {
  /** Identifiant local pour la carte (variantId + index) */
  key: string;
  variantId: string;
  name: string;
  size: string;
  unitCost: number;
  condition: UniformItemCondition | null;
  note?: string;
}

export default function UniformReturnsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { canWriteUniforms } = usePerms();
  const [employee, setEmployee] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [issuanceId, setIssuanceId] = useState('');
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [washBatchId, setWashBatchId] = useState<string | null>(null);

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
    [issuances.data],
  );

  // Charge l'émission et génère N cartes par variante (1 par pièce détenue).
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
    const newPieces: Piece[] = [];
    (data.lines || []).forEach((l) => {
      if (!l.variantId) return;
      const remaining = l.quantity - (returnedMap.get(l.variantId) || 0);
      for (let i = 0; i < remaining; i++) {
        newPieces.push({
          key: `${l.variantId}-${i}`,
          variantId: l.variantId,
          name: l.variant?.item?.name || 'Pièce',
          size: l.variant?.size || '—',
          unitCost: Number(l.unitCostSnapshot),
          condition: null,
        });
      }
    });
    setPieces(newPieces);
  };

  const setCondition = (key: string, condition: UniformItemCondition | null) => {
    setPieces((prev) => prev.map((p) => (p.key === key ? { ...p, condition } : p)));
  };
  const setNote = (key: string, note: string) => {
    setPieces((prev) => prev.map((p) => (p.key === key ? { ...p, note } : p)));
  };
  const markAllGood = () => setPieces((prev) => prev.map((p) => ({ ...p, condition: 'GOOD' })));

  const counts = useMemo(() => {
    const c = { good: 0, damaged: 0, lost: 0, pending: 0 };
    for (const p of pieces) {
      if (p.condition === 'GOOD') c.good++;
      else if (p.condition === 'DAMAGED') c.damaged++;
      else if (p.condition === 'LOST') c.lost++;
      else c.pending++;
    }
    return c;
  }, [pieces]);

  const allTagged = pieces.length > 0 && counts.pending === 0;

  const createAndFinalize = useMutation({
    mutationFn: async () => {
      // 1 ligne par pièce (qty=1) — granularité maximale pour audit + wash batch.
      const lines = pieces
        .filter((p) => p.condition != null)
        .map((p) => ({
          variantId: p.variantId,
          quantity: 1,
          condition: p.condition!,
          unitReplacementCost: p.unitCost,
        }));
      const created = await uniformService.createReturn({ issuanceId, lines });
      const id = created.data.id;
      const fin = await uniformService.finalizeReturn(id);
      return { id, washBatchId: (fin?.data as any)?.washBatchId ?? null };
    },
    onSuccess: ({ id, washBatchId: wbId }) => {
      setReturnId(id);
      setWashBatchId(wbId);
      enqueueSnackbar(
        wbId ? `Retour finalisé — lot de lavage créé (${counts.good} pièce(s))` : 'Retour finalisé',
        { variant: 'success' },
      );
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // Signature
  const [empSig, setEmpSig] = useState<string | null>(null);
  const [emprSig, setEmprSig] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const sendSms = useMutation({
    mutationFn: () => uniformService.sendReturnSms(returnId!),
    onSuccess: () => enqueueSnackbar('SMS envoyé', { variant: 'success' }),
    onError: (e: any) =>
      enqueueSnackbar(
        e?.response?.data?.message || e?.response?.data?.error || 'Échec SMS — utilisez la signature au comptoir',
        { variant: 'warning', autoHideDuration: 12000 }
      ),
  });
  const counterSign = useMutation({
    mutationFn: () =>
      uniformService.counterSignReturn(returnId!, {
        employeeSignatureBase64: empSig || undefined,
        employerSignatureBase64: emprSig || undefined,
        signedByName,
      }),
    onSuccess: () => {
      enqueueSnackbar('Signature enregistrée', { variant: 'success' });
      navigate(`/employees/${employee.id}`);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  if (!canWriteUniforms) {
    return <Alert severity="info">Accès en lecture seule — le retour d'uniformes n'est pas disponible pour votre profil.</Alert>;
  }

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
            onChange={(_, v) => { setEmployee(v); setIssuanceId(''); setPieces([]); setReturnId(null); }}
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

      {pieces.length > 0 && !returnId && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Triage pièce par pièce</strong> :
            <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
              <li>🟢 <strong>Bon</strong> → la pièce part en <strong>lot de lavage</strong> avant ré-intégration au stock.</li>
              <li>🔴 <strong>Endommagé</strong> → poubelle immédiate (sortie définitive). Coût en dette pour l'agent.</li>
              <li>⚫ <strong>Perdu</strong> → dette pour l'agent (pas de retour stock).</li>
            </ul>
          </Alert>

          <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
            <Chip icon={<CheckCircleIcon />} label={`Bon : ${counts.good}`} color={counts.good > 0 ? 'success' : 'default'} />
            <Chip icon={<CancelIcon />} label={`Endommagé : ${counts.damaged}`} color={counts.damaged > 0 ? 'error' : 'default'} />
            <Chip label={`Perdu : ${counts.lost}`} color={counts.lost > 0 ? 'error' : 'default'} variant="outlined" />
            <Chip icon={<HelpIcon />} label={`À décider : ${counts.pending}`} color={counts.pending > 0 ? 'warning' : 'default'} />
            <Box flex={1} />
            <Button size="small" onClick={markAllGood} disabled={counts.pending === 0}>
              Tout marquer Bon
            </Button>
          </Stack>

          <Grid container spacing={1.5}>
            {pieces.map((p, idx) => (
              <Grid item xs={12} md={6} key={p.key}>
                <Card variant="outlined" sx={{
                  borderColor:
                    p.condition === 'GOOD' ? 'success.main' :
                    p.condition === 'DAMAGED' ? 'error.main' :
                    p.condition === 'LOST' ? 'error.light' : 'divider',
                  borderWidth: p.condition ? 2 : 1,
                }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="caption" color="text.secondary">Pièce {idx + 1}/{pieces.length}</Typography>
                          <Typography variant="body1" fontWeight={500}>
                            {p.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Taille : {p.size} · {p.unitCost.toFixed(2)} $
                          </Typography>
                        </Box>
                      </Stack>
                      <ToggleButtonGroup
                        value={p.condition}
                        exclusive
                        onChange={(_, v) => setCondition(p.key, v as UniformItemCondition | null)}
                        size="small"
                        fullWidth
                      >
                        <ToggleButton value="GOOD" color="success">
                          <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} /> Bon
                        </ToggleButton>
                        <ToggleButton value="DAMAGED" color="error">
                          <CancelIcon fontSize="small" sx={{ mr: 0.5 }} /> Endommagé
                        </ToggleButton>
                        <ToggleButton value="LOST" color="error">
                          Perdu
                        </ToggleButton>
                      </ToggleButtonGroup>
                      {(p.condition === 'DAMAGED' || p.condition === 'LOST') && (
                        <TextField
                          size="small"
                          placeholder="Note (optionnel)"
                          value={p.note || ''}
                          onChange={(e) => setNote(p.key, e.target.value)}
                        />
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" justifyContent="flex-end" mt={2}>
            <Button
              variant="contained"
              disabled={!allTagged || createAndFinalize.isPending}
              onClick={() => createAndFinalize.mutate()}
            >
              Finaliser le retour ({pieces.length} pièce{pieces.length > 1 ? 's' : ''})
            </Button>
          </Stack>
        </Paper>
      )}

      {pieces.length === 0 && employee && issuanceId && (
        <Alert severity="info">Aucune pièce à retourner pour cette remise (déjà tout retourné).</Alert>
      )}

      {returnId && (
        <Paper sx={{ p: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Retour finalisé.
            {washBatchId && (
              <> Un <strong>lot de lavage</strong> a été créé avec les pièces en bon état.</>
            )}
            {' '}Pertes/dommages portés au montant dû.
          </Alert>

          {washBatchId && (
            <Box mb={2}>
              <Button
                variant="outlined"
                startIcon={<LocalLaundryServiceIcon />}
                onClick={() => navigate(`/uniformes/lavage/${washBatchId}`)}
              >
                Ouvrir le lot de lavage
              </Button>
            </Box>
          )}

          <Stack direction="row" spacing={2} mb={2}>
            <Button variant="outlined" startIcon={<SendIcon />} onClick={() => sendSms.mutate()} disabled={sendSms.isPending}>
              Envoyer le lien par SMS
            </Button>
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
              <Button variant="contained" disabled={!empSig || counterSign.isPending} onClick={() => counterSign.mutate()}>
                Enregistrer la signature
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
