import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, Table, TableHead, TableRow, TableCell, TableBody, Chip, Button,
  IconButton, TextField, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Switch, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import SearchIcon from '@mui/icons-material/Search';
import { useSnackbar } from 'notistack';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/store/authStore';
import type { User, UserRole } from '@/types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'RH_RECRUITER', label: 'RH / Recruteur' },
  { value: 'SALES', label: 'Ventes' },
  { value: 'MAGASIN_GESTION', label: 'Magasin (gestion uniformes)' },
  { value: 'MAGASIN', label: 'Magasin (lecture seule)' },
];
const roleLabel = (r: UserRole) => ROLES.find((x) => x.value === r)?.label || r;
const roleColor = (r: UserRole): 'error' | 'primary' | 'info' | 'warning' | 'success' | 'default' =>
  r === 'ADMIN' ? 'error' : r === 'RH_RECRUITER' ? 'primary' : r === 'SALES' ? 'info'
    : r === 'MAGASIN_GESTION' ? 'success' : r === 'MAGASIN' ? 'warning' : 'default';

const emptyCreate = { firstName: '', lastName: '', email: '', password: '', role: 'MAGASIN' as UserRole };

export default function UsersAdminPage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: () => userService.listUsers(search || undefined),
  });
  const users = data?.data || [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const onErr = (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' });

  // ---- Créer ----
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const create = useMutation({
    mutationFn: () => userService.createUser(createForm),
    onSuccess: () => { enqueueSnackbar('Utilisateur créé', { variant: 'success' }); setCreateOpen(false); setCreateForm(emptyCreate); invalidate(); },
    onError: onErr,
  });

  // ---- Modifier ----
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', role: 'SALES' as UserRole, isActive: true });
  const openEdit = (u: User) => { setEditUser(u); setEditForm({ firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, isActive: u.isActive }); };
  const update = useMutation({
    mutationFn: () => userService.updateUser(editUser!.id, editForm),
    onSuccess: () => { enqueueSnackbar('Utilisateur mis à jour', { variant: 'success' }); setEditUser(null); invalidate(); },
    onError: onErr,
  });

  // ---- Activer / désactiver (toggle direct) ----
  const toggleActive = useMutation({
    mutationFn: (u: User) => userService.updateUser(u.id, { isActive: !u.isActive }),
    onSuccess: () => invalidate(),
    onError: onErr,
  });

  // ---- Réinitialiser le mot de passe ----
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [pwd, setPwd] = useState('');
  const resetPwd = useMutation({
    mutationFn: () => userService.resetPassword(pwdUser!.id, pwd),
    onSuccess: () => { enqueueSnackbar('Mot de passe réinitialisé', { variant: 'success' }); setPwdUser(null); setPwd(''); },
    onError: onErr,
  });

  const createValid = useMemo(
    () => createForm.firstName.length >= 2 && createForm.lastName.length >= 2 && /.+@.+\..+/.test(createForm.email) && createForm.password.length >= 8,
    [createForm]
  );

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} mb={2}>
        <Typography variant="h5">Gestion des utilisateurs</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Créer un utilisateur</Button>
      </Stack>

      <TextField
        size="small" placeholder="Chercher (nom, email)…" value={search} onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, maxWidth: 360 }}
        InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }}
      />

      <Paper sx={{ p: 1 }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nom</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Rôle</TableCell>
                <TableCell align="center">Actif</TableCell>
                <TableCell>Dernière connexion</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} sx={u.isActive ? undefined : { opacity: 0.5 }}>
                  <TableCell>{u.firstName} {u.lastName}{u.id === me?.id ? ' (moi)' : ''}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Chip size="small" color={roleColor(u.role)} label={roleLabel(u.role)} /></TableCell>
                  <TableCell align="center">
                    <Tooltip title={u.isActive ? 'Désactiver' : 'Activer'}>
                      <span>
                        <Switch
                          size="small" checked={u.isActive} disabled={u.id === me?.id || toggleActive.isPending}
                          onChange={() => toggleActive.mutate(u)}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('fr-CA') : '—'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Modifier">
                      <IconButton size="small" onClick={() => openEdit(u)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Réinitialiser le mot de passe">
                      <IconButton size="small" onClick={() => { setPwdUser(u); setPwd(''); }}><KeyIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && users.length === 0 && (
                <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Aucun utilisateur.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      {/* Créer */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Créer un utilisateur</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Prénom" value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
            <TextField label="Nom" value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
            <TextField label="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            <TextField label="Mot de passe" type="text" helperText="Min. 8 car., 1 majuscule, 1 minuscule, 1 chiffre" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            <TextField select label="Rôle (niveau d'accès)" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}>
              {ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Annuler</Button>
          <Button variant="contained" disabled={!createValid || create.isPending} onClick={() => create.mutate()}>Créer</Button>
        </DialogActions>
      </Dialog>

      {/* Modifier */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Modifier l'utilisateur</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Prénom" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
            <TextField label="Nom" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
            <TextField label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            <TextField
              select label="Rôle (niveau d'accès)" value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
              disabled={editUser?.id === me?.id}
              helperText={editUser?.id === me?.id ? 'Vous ne pouvez pas changer votre propre rôle' : undefined}
            >
              {ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </TextField>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2">Compte actif</Typography>
              <Switch checked={editForm.isActive} disabled={editUser?.id === me?.id} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUser(null)}>Annuler</Button>
          <Button variant="contained" disabled={update.isPending} onClick={() => update.mutate()}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      {/* Réinitialiser le mot de passe */}
      <Dialog open={!!pwdUser} onClose={() => setPwdUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={1}>{pwdUser?.firstName} {pwdUser?.lastName} — {pwdUser?.email}</Typography>
          <TextField autoFocus fullWidth label="Nouveau mot de passe" type="text" helperText="Min. 8 car., 1 majuscule, 1 minuscule, 1 chiffre" value={pwd} onChange={(e) => setPwd(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdUser(null)}>Annuler</Button>
          <Button variant="contained" color="warning" disabled={pwd.length < 8 || resetPwd.isPending} onClick={() => resetPwd.mutate()}>Réinitialiser</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
