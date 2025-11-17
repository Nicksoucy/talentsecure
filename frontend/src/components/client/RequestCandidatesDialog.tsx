import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  Chip,
} from '@mui/material';
import { LocationOn as LocationIcon, Person as PersonIcon } from '@mui/icons-material';

interface RequestCandidatesDialogProps {
  open: boolean;
  onClose: () => void;
  city: string;
  count: number;
  catalogueTitle: string;
  onSubmit: (message: string) => void;
}

const RequestCandidatesDialog: React.FC<RequestCandidatesDialogProps> = ({
  open,
  onClose,
  city,
  count,
  catalogueTitle,
  onSubmit,
}) => {
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    onSubmit(message);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setMessage('');
      onClose();
    }, 2000);
  };

  const handleClose = () => {
    if (!submitted) {
      setMessage('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <LocationIcon color="primary" />
          <Typography variant="h6" component="span">
            Demande de candidats - {city}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {submitted ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Votre demande a été envoyée avec succès! Nous vous contactons sous peu.
          </Alert>
        ) : (
          <>
            <Box sx={{ mb: 3, mt: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Catalogue: <strong>{catalogueTitle}</strong>
              </Typography>
              <Box display="flex" alignItems="center" gap={2} mt={2}>
                <Chip
                  icon={<LocationIcon />}
                  label={city}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  icon={<PersonIcon />}
                  label={`${count} candidat${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`}
                  color="success"
                />
              </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 2 }}>
              Vous êtes sur le point de demander des informations sur les candidats disponibles à {city}.
            </Alert>

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Message (optionnel)"
              placeholder="Décrivez vos besoins spécifiques, le type de poste, la date de début souhaitée, etc."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              variant="outlined"
            />

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Notre équipe vous contactera dans les plus brefs délais avec les profils correspondants.
            </Typography>
          </>
        )}
      </DialogContent>

      {!submitted && (
        <DialogActions>
          <Button onClick={handleClose} color="inherit">
            Annuler
          </Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            Envoyer la demande
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default RequestCandidatesDialog;
