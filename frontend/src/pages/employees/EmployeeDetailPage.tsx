import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Grid, Chip, Button, Stack, Divider, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Checkbox,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useSnackbar } from 'notistack';
import { employeeService } from '@/services/employee.service';
import type { UniformOffboardingWarning } from '@/services/employee.service';
import { uniformService } from '@/services/uniform.service';
import { usePerms } from '@/hooks/usePerms';
import UniformFichePanel from '../uniformes/components/UniformFichePanel';

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value ?? '—'}</Typography>
    </Grid>
  );
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('fr-CA') : '—');

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { canViewUniforms, canWriteUniforms, canWriteEmployees } = usePerms();

  const { data, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeeService.getEmployeeById(id!),
    enabled: !!id,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [warning, setWarning] = useState<UniformOffboardingWarning | null>(null);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: any = { ...form };
      // Champs optionnels vides → null (évite de stocker des chaînes vides).
      ['employeeNumber', 'email', 'address', 'city', 'postalCode', 'position', 'assignment', 'bspNumber'].forEach((k) => {
        if (payload[k] === '') payload[k] = null;
      });
      payload.hireDate = form.hireDate || null;
      if (!form.hasBSP) payload.bspNumber = null;
      return employeeService.updateEmployee(id!, payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['employee', id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['uniform-fiche', id] });
      enqueueSnackbar('Employé mis à jour', { variant: 'success' });
      setEditOpen(false);
      // Fin d'emploi avec uniformes encore détenus → avertissement non bloquant.
      if (res?.uniformWarning && res.uniformWarning.totalPieces > 0) {
        setWarning(res.uniformWarning);
      }
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.error || 'Erreur lors de la mise à jour', { variant: 'error' }),
  });

  const closeTerminationMut = useMutation({
    // allSettled : une remise en échec ne doit pas laisser les autres non clôturées.
    mutationFn: async (issuanceIds: string[]) => {
      const results = await Promise.allSettled(issuanceIds.map((iid) => uniformService.closeTermination(iid)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === issuanceIds.length) throw new Error('all-failed');
      return { failed, total: issuanceIds.length };
    },
    onSuccess: ({ failed, total }) => {
      qc.invalidateQueries({ queryKey: ['uniform-fiche', id] });
      qc.invalidateQueries({ queryKey: ['rep-inactive-holdings'] });
      enqueueSnackbar(
        failed > 0 ? `${total - failed}/${total} remise(s) clôturée(s) — ${failed} en échec` : 'Fin d’emploi clôturée — dette figée',
        { variant: failed > 0 ? 'warning' : 'success' },
      );
      setWarning(null);
    },
    onError: () => enqueueSnackbar('Erreur lors de la clôture', { variant: 'error' }),
  });

  if (isLoading) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }
  const e: any = data?.data;
  if (!e) return <Typography>Employé introuvable</Typography>;

  const openEdit = () => {
    setForm({
      firstName: e.firstName || '', lastName: e.lastName || '',
      employeeNumber: e.employeeNumber || '', status: e.status || 'ACTIF',
      email: e.email || '', phone: e.phone || '',
      address: e.address || '', city: e.city || '', province: e.province || 'QC', postalCode: e.postalCode || '',
      position: e.position || '', assignment: e.assignment || '',
      hireDate: e.hireDate ? String(e.hireDate).slice(0, 10) : '',
      hasBSP: !!e.hasBSP, bspNumber: e.bspNumber || '', hasVehicle: !!e.hasVehicle,
    });
    setEditOpen(true);
  };
  const canSave = !!(form.firstName?.trim() && form.lastName?.trim() && form.phone?.trim());

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/employees')} sx={{ mb: 1 }}>
        Retour aux employés
      </Button>

      {/* En-tête profil */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Typography variant="h5" fontWeight="bold">{e.firstName} {e.lastName}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={e.status === 'ACTIF' ? 'Actif' : 'Inactif'}
              color={e.status === 'ACTIF' ? 'success' : 'default'}
            />
            {canWriteEmployees && (
              <Button startIcon={<EditIcon />} variant="outlined" size="small" onClick={openEdit}>
                Modifier
              </Button>
            )}
          </Stack>
        </Stack>
        <Grid container spacing={2}>
          <Info label="Matricule" value={e.employeeNumber} />
          <Info label="Courriel" value={e.email} />
          <Info label="Téléphone" value={e.phone} />
          <Info label="Adresse" value={e.address} />
          <Info label="Ville" value={e.city} />
          <Info label="Code postal" value={e.postalCode} />
          <Info label="Poste" value={e.position} />
          <Info label="Mandat / site" value={e.assignment} />
          <Info label="Date d'embauche" value={fmtDate(e.hireDate)} />
          <Info label="BSP" value={e.hasBSP ? (e.bspNumber || 'Oui') : 'Non'} />
          <Info label="Véhicule" value={e.hasVehicle ? 'Oui' : 'Non'} />
        </Grid>
      </Paper>

      {/* Gestion des uniformes */}
      <Divider sx={{ mb: 2 }}>
        <Typography variant="overline" color="text.secondary">Gestion des uniformes</Typography>
      </Divider>
      {canViewUniforms ? (
        <UniformFichePanel employeeId={id!} />
      ) : (
        <Typography color="text.secondary">Accès à la gestion des uniformes réservé.</Typography>
      )}

      {/* Dialogue de modification */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Modifier l'employé</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={6}><TextField label="Prénom" fullWidth size="small" required value={form.firstName || ''} onChange={(ev) => set('firstName', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Nom" fullWidth size="small" required value={form.lastName || ''} onChange={(ev) => set('lastName', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Matricule" fullWidth size="small" value={form.employeeNumber || ''} onChange={(ev) => set('employeeNumber', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Statut" select fullWidth size="small" value={form.status || 'ACTIF'} onChange={(ev) => set('status', ev.target.value)}>
                <MenuItem value="ACTIF">Actif</MenuItem>
                <MenuItem value="INACTIF">Inactif</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}><TextField label="Courriel" fullWidth size="small" value={form.email || ''} onChange={(ev) => set('email', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Téléphone" fullWidth size="small" required value={form.phone || ''} onChange={(ev) => set('phone', ev.target.value)} /></Grid>
            <Grid item xs={12}><TextField label="Adresse" fullWidth size="small" value={form.address || ''} onChange={(ev) => set('address', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={5}><TextField label="Ville" fullWidth size="small" value={form.city || ''} onChange={(ev) => set('city', ev.target.value)} /></Grid>
            <Grid item xs={6} sm={3}><TextField label="Province" fullWidth size="small" value={form.province || ''} onChange={(ev) => set('province', ev.target.value)} /></Grid>
            <Grid item xs={6} sm={4}><TextField label="Code postal" fullWidth size="small" value={form.postalCode || ''} onChange={(ev) => set('postalCode', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Poste" fullWidth size="small" value={form.position || ''} onChange={(ev) => set('position', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Mandat / site" fullWidth size="small" value={form.assignment || ''} onChange={(ev) => set('assignment', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Date d'embauche" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} value={form.hireDate || ''} onChange={(ev) => set('hireDate', ev.target.value)} /></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={!!form.hasVehicle} onChange={(ev) => set('hasVehicle', ev.target.checked)} />} label="Véhicule" /></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={!!form.hasBSP} onChange={(ev) => set('hasBSP', ev.target.checked)} />} label="BSP" /></Grid>
            {form.hasBSP && (
              <Grid item xs={12} sm={6}><TextField label="N° BSP" fullWidth size="small" value={form.bspNumber || ''} onChange={(ev) => set('bspNumber', ev.target.value)} /></Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Annuler</Button>
          <Button variant="contained" disabled={!canSave || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Avertissement fin d'emploi : uniformes encore détenus */}
      <Dialog open={!!warning} onClose={() => setWarning(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" /> Uniformes encore détenus
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" gutterBottom>
            {e.firstName} {e.lastName} est maintenant <strong>inactif</strong> mais détient encore{' '}
            <strong>{warning?.totalPieces} pièce(s)</strong>.
            {warning?.deadline && (
              <> Échéance de retour fixée au <strong>{fmtDate(warning.deadline)}</strong> (5 jours ouvrables).</>
            )}
          </Typography>
          {warning && warning.owed > 0 && (
            <Typography variant="body2" color="error" gutterBottom>
              Montant à risque/dû : <strong>$ {Number(warning.owed).toFixed(2)}</strong>
            </Typography>
          )}
          {warning && warning.holdings.length > 0 && (
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {warning.holdings.map((h) => (
                <Typography key={h.variantId} variant="body2" color="text.secondary">
                  • {h.quantity}× {h.itemName}{h.size && h.size !== 'Unique' ? ` (${h.size})` : ''}
                </Typography>
              ))}
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Récupérez les pièces (Retour) ou clôturez la fin d’emploi pour figer la dette à prélever sur la dernière paie.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setWarning(null)}>Plus tard</Button>
          <Button variant="outlined" onClick={() => navigate(`/uniformes/retours?employeeId=${id}`)}>
            Aller au retour
          </Button>
          {canWriteUniforms && warning && warning.activeIssuanceIds.length > 0 && (
            <Button
              variant="contained"
              color="warning"
              disabled={closeTerminationMut.isPending}
              onClick={() => closeTerminationMut.mutate(warning.activeIssuanceIds)}
            >
              {closeTerminationMut.isPending ? 'Clôture…' : 'Clôturer fin d’emploi'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
