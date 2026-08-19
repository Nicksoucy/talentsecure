import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { mandateService } from '@/services/mandate.service';
import {
  CONTEXT_DIMENSIONS,
  SITE_TYPES,
  SITE_TYPE_LABELS,
  type Mandate,
  type MandateProfileInput,
  type SiteType,
} from '@/types/mandate';

/** Langues proposées — codes normalisés côté serveur de toute façon. */
const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'FR', label: 'Français' },
  { code: 'EN', label: 'Anglais' },
  { code: 'ES', label: 'Espagnol' },
  { code: 'AR', label: 'Arabe' },
  { code: 'HT', label: 'Créole' },
];

interface Props {
  mandate: Mandate | null;
  onClose: () => void;
}

/**
 * Saisie du profil d'un mandat par la répartition.
 *
 * Le formulaire est délibérément court : ~10 décisions par site, et 146 sites à
 * couvrir. Chaque cote garde un état « non coté » distinct de « faible » — un
 * site jamais évalué ne doit pas se retrouver noté 1 par défaut, sinon le
 * jumelage traiterait une absence de donnée comme une information.
 */
export default function MandateProfileDialog({ mandate, onClose }: Props) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = useState<MandateProfileInput>({});

  // Réinitialise à chaque ouverture : sans ça, le profil du site précédent
  // resterait affiché une frame et pourrait être enregistré sur le mauvais site.
  useEffect(() => {
    if (!mandate) return;
    setForm({
      requiresBSP: mandate.requiresBSP,
      requiresDriverLicense: mandate.requiresDriverLicense,
      requiresVehicle: mandate.requiresVehicle,
      requiredLanguages: mandate.requiredLanguages,
      shiftDays: mandate.shiftDays,
      shiftEvenings: mandate.shiftEvenings,
      shiftNights: mandate.shiftNights,
      shiftWeekends: mandate.shiftWeekends,
      siteType: mandate.siteType,
      conflictFrequency: mandate.conflictFrequency,
      publicContact: mandate.publicContact,
      monotony: mandate.monotony,
      autonomy: mandate.autonomy,
      outdoorExposure: mandate.outdoorExposure,
      physicalDemand: mandate.physicalDemand,
      clientName: mandate.clientName,
      headcount: mandate.headcount,
      notes: mandate.notes,
      isActive: mandate.isActive,
    });
  }, [mandate]);

  const mutation = useMutation({
    mutationFn: (input: MandateProfileInput) => mandateService.updateProfile(mandate!.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandates'] });
      enqueueSnackbar('Profil du mandat enregistré', { variant: 'success' });
      onClose();
    },
    onError: () => {
      enqueueSnackbar("Impossible d'enregistrer le profil", { variant: 'error' });
    },
  });

  if (!mandate) return null;

  const set = <K extends keyof MandateProfileInput>(key: K, value: MandateProfileInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={Boolean(mandate)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mandate.name}
        <Typography variant="body2" color="text.secondary">
          {mandate.externalId}
          {mandate.address ? ` · ${mandate.address}` : ''}
          {mandate.city ? `, ${mandate.city}` : ''}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Ne jamais écrire ici de code de porte, de mot de passe ni de consigne
          confidentielle : ces notes sont visibles par toute l'équipe.
        </Alert>

        <Typography variant="subtitle2" gutterBottom>
          Exigences — elles écartent un candidat, elles ne le notent pas
        </Typography>
        <FormGroup row sx={{ mb: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.requiresBSP ?? true}
                onChange={(e) => set('requiresBSP', e.target.checked)}
              />
            }
            label="Permis BSP"
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.requiresDriverLicense ?? false}
                onChange={(e) => set('requiresDriverLicense', e.target.checked)}
              />
            }
            label="Permis de conduire"
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.requiresVehicle ?? false}
                onChange={(e) => set('requiresVehicle', e.target.checked)}
              />
            }
            label="Véhicule"
          />
        </FormGroup>

        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel id="langues-label">Langues exigées</InputLabel>
          <Select
            labelId="langues-label"
            multiple
            value={form.requiredLanguages ?? []}
            onChange={(e) => set('requiredLanguages', e.target.value as string[])}
            input={<OutlinedInput label="Langues exigées" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {selected.map((code) => (
                  <Chip key={code} size="small" label={LANGUAGES.find((l) => l.code === code)?.label ?? code} />
                ))}
              </Box>
            )}
          >
            {LANGUAGES.map((l) => (
              <MenuItem key={l.code} value={l.code}>
                {l.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          Quarts à couvrir
        </Typography>
        <FormGroup row sx={{ mb: 1 }}>
          {(
            [
              ['shiftDays', 'Jour'],
              ['shiftEvenings', 'Soir'],
              ['shiftNights', 'Nuit'],
              ['shiftWeekends', 'Fin de semaine'],
            ] as Array<[keyof MandateProfileInput, string]>
          ).map(([key, label]) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={Boolean(form[key])}
                  onChange={(e) => set(key, e.target.checked as never)}
                />
              }
              label={label}
            />
          ))}
        </FormGroup>
        <Typography variant="caption" color="text.secondary">
          Aucun quart coché = aucun filtre sur les disponibilités.
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          Contexte de travail
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Coté de 1 à 5. Laisser vide tant que vous n'êtes pas sûr : « non coté »
          et « faible » ne veulent pas dire la même chose.
        </Typography>

        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel id="type-site-label">Type de site</InputLabel>
          <Select
            labelId="type-site-label"
            label="Type de site"
            value={form.siteType ?? ''}
            onChange={(e) => set('siteType', (e.target.value || null) as SiteType | null)}
          >
            <MenuItem value="">
              <em>Non coté</em>
            </MenuItem>
            {SITE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {SITE_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {CONTEXT_DIMENSIONS.map((dim) => (
          <Box key={dim.key} sx={{ mb: 1.5 }}>
            <Typography variant="body2">{dim.label}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110 }}>
                {dim.low}
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={form[dim.key] ?? null}
                // Recliquer la valeur active renvoie null : c'est le seul geste
                // qui permet de revenir à « non coté » après s'être trompé.
                onChange={(_, value) => set(dim.key, value as number | null)}
                aria-label={dim.label}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <ToggleButton key={n} value={n} aria-label={`${dim.label} ${n}`}>
                    {n}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110 }}>
                {dim.high}
              </Typography>
            </Box>
          </Box>
        ))}

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Client"
              value={form.clientName ?? ''}
              onChange={(e) => set('clientName', e.target.value || null)}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Postes à pourvoir"
              value={form.headcount ?? ''}
              onChange={(e) =>
                set('headcount', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive ?? true}
                  onChange={(e) => set('isActive', e.target.checked)}
                />
              }
              label="Mandat actif"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="Consignes de jumelage"
              placeholder="Ex. : clientèle difficile en fin de soirée, prévoir un agent d'expérience."
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          variant="contained"
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
        >
          Enregistrer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
