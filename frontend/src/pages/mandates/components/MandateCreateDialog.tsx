import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
} from '@mui/material';
import { mandateService } from '@/services/mandate.service';
import type { Mandate, MandateCreateInput } from '@/types/mandate';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Appelé avec le mandat créé — la page enchaîne sur la saisie du profil. */
  onCreated: (mandate: Mandate) => void;
}

const EMPTY: MandateCreateInput = {
  name: '',
  externalId: '',
  address: '',
  city: '',
  postalCode: '',
  clientName: '',
};

/**
 * Ajout manuel d'un mandat, pour les sites qui ne sont pas (encore) dans
 * Agendrix. Seulement l'identité et l'adresse : le profil (quarts, exigences…)
 * se remplit ensuite dans la fenêtre habituelle, ouverte automatiquement.
 */
export default function MandateCreateDialog({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = useState<MandateCreateInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (input: MandateCreateInput) => mandateService.createMandate(input),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['mandates'] });
      enqueueSnackbar(`Mandat ajouté (${res.data.externalId})`, { variant: 'success' });
      onCreated(res.data);
    },
    onError: (err: any) => {
      // 409 = identifiant déjà pris : le message du serveur nomme le site en conflit.
      setError(err?.response?.data?.message ?? "Impossible d'ajouter le mandat");
    },
  });

  const set = (key: keyof MandateCreateInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const canSubmit = form.name.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate(form);
        }}
      >
        <DialogTitle>Ajouter un mandat</DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label="Nom du site"
                required
                fullWidth
                autoFocus
                value={form.name}
                onChange={set('name')}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Adresse" fullWidth value={form.address} onChange={set('address')} />
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField label="Ville" fullWidth value={form.city} onChange={set('city')} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                label="Code postal"
                fullWidth
                value={form.postalCode}
                onChange={set('postalCode')}
              />
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField label="Client" fullWidth value={form.clientName} onChange={set('clientName')} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                label="Identifiant Agendrix"
                fullWidth
                value={form.externalId}
                onChange={set('externalId')}
                helperText="Facultatif — sinon MAN-0001…"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="contained" disabled={!canSubmit}>
            Ajouter
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
