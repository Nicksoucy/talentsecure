import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { contactService, ContactConflict, ContactSection } from '@/services/contact.service';

const SECTION_LABEL: Record<ContactSection, string> = {
  prospect: 'Candidats Potentiels',
  candidate: 'Candidats',
  employee: 'Employés',
};

const SECTION_ROUTE: Record<ContactSection, string> = {
  prospect: '/prospects',
  candidate: '/candidates',
  employee: '/employees',
};

interface Props {
  conflict: ContactConflict | null;
  /** Section où l'utilisateur essayait de créer le contact. */
  creatingIn: ContactSection;
  onClose: () => void;
  /** Appelé après un déplacement réussi (pour fermer le formulaire parent, refetch…). */
  onMoved?: (toSection: ContactSection) => void;
}

/**
 * S'affiche quand on tente de créer un contact qui existe déjà ailleurs.
 * Propose de déplacer le contact vers la section voulue (choix libre), ou
 * d'aller voir la fiche existante.
 */
export default function ContactConflictDialog({ conflict, creatingIn, onClose, onMoved }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Destination par défaut = la section où on essayait de créer.
  const [target, setTarget] = useState<ContactSection>(creatingIn);

  const moveMutation = useMutation({
    mutationFn: () =>
      contactService.move({
        fromSection: conflict!.section,
        fromId: conflict!.id,
        toSection: target,
      }),
    onSuccess: (res) => {
      enqueueSnackbar(`Contact déplacé vers ${SECTION_LABEL[target]}.`, { variant: 'success' });
      ['prospects', 'candidates', 'employees'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      onMoved?.(target);
      onClose();
      navigate(`${SECTION_ROUTE[res.data.section]}/${res.data.id}`);
    },
    onError: (e: any) => {
      enqueueSnackbar(e.response?.data?.error || 'Erreur lors du déplacement', { variant: 'error' });
    },
  });

  if (!conflict) return null;

  const fullName = `${conflict.firstName} ${conflict.lastName}`.trim();
  const destinations = (['prospect', 'candidate', 'employee'] as ContactSection[]).filter(
    (s) => s !== conflict.section
  );

  return (
    <Dialog open={!!conflict} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Contact déjà existant</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <strong>{fullName}</strong> existe déjà dans <strong>{SECTION_LABEL[conflict.section]}</strong>.
          Un contact ne peut vivre qu'à une seule place.
        </Alert>

        <Typography variant="body2" sx={{ mb: 1 }}>
          Où veux-tu placer ce contact ?
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={target}
          onChange={(_, v) => v && setTarget(v)}
          size="small"
          sx={{ flexWrap: 'wrap' }}
        >
          {destinations.map((s) => (
            <ToggleButton key={s} value={s}>
              {SECTION_LABEL[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="text"
            size="small"
            onClick={() => {
              onClose();
              navigate(`${SECTION_ROUTE[conflict.section]}/${conflict.id}`);
            }}
          >
            Voir la fiche existante
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          variant="contained"
          onClick={() => moveMutation.mutate()}
          disabled={moveMutation.isPending || target === conflict.section}
        >
          {moveMutation.isPending ? 'Déplacement…' : `Déplacer vers ${SECTION_LABEL[target]}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
