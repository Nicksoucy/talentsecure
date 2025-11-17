import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  Alert,
  Divider,
  Stack,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';

interface ShareCatalogueDialogProps {
  open: boolean;
  onClose: () => void;
  catalogue: {
    id: string;
    title: string;
    client: {
      id: string;
      name: string;
      companyName?: string;
      email: string;
    };
  };
}

const ShareCatalogueDialog = ({ open, onClose, catalogue }: ShareCatalogueDialogProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const [copied, setCopied] = useState(false);

  const frontendUrl = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:5173';
  const loginUrl = `${frontendUrl}/client/login`;

  const handleCopyLoginUrl = () => {
    navigator.clipboard.writeText(loginUrl);
    setCopied(true);
    enqueueSnackbar('Lien copié !', { variant: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(catalogue.client.email);
    enqueueSnackbar('Email copié !', { variant: 'success' });
  };

  const handleCopyAll = () => {
    const text = `Bonjour ${catalogue.client.name},

Vous pouvez maintenant accéder à votre catalogue de candidats "${catalogue.title}" via notre portail client sécurisé.

🔗 Lien de connexion : ${loginUrl}

📧 Email : ${catalogue.client.email}
🔑 Mot de passe : [Votre mot de passe]

Une fois connecté, vous pourrez :
- Consulter tous vos catalogues
- Visionner les entrevues vidéo
- Télécharger les CV
- Voir les détails complets des candidats

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
L'équipe TalentSecure`;

    navigator.clipboard.writeText(text);
    enqueueSnackbar('Message complet copié !', { variant: 'success' });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Partager le catalogue</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Catalogue Info */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Catalogue
            </Typography>
            <Typography variant="h6">{catalogue.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {catalogue.client.companyName || catalogue.client.name}
            </Typography>
          </Box>

          <Divider />

          {/* Portal Login URL */}
          <Box>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
              🔗 Lien du portail client
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                fullWidth
                value={loginUrl}
                InputProps={{
                  readOnly: true,
                }}
                size="small"
              />
              <IconButton
                color={copied ? 'success' : 'primary'}
                onClick={handleCopyLoginUrl}
                title="Copier le lien"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            </Box>
          </Box>

          <Divider />

          {/* Client Credentials */}
          <Box>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
              🔐 Identifiants du client
            </Typography>

            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Email
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    fullWidth
                    value={catalogue.client.email}
                    InputProps={{
                      readOnly: true,
                    }}
                    size="small"
                  />
                  <IconButton
                    color="primary"
                    onClick={handleCopyEmail}
                    title="Copier l'email"
                  >
                    <CopyIcon />
                  </IconButton>
                </Box>
              </Box>

              <Alert severity="info" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>Important :</strong> Assurez-vous que le client a un mot de passe configuré.
                  Si ce n'est pas le cas, utilisez le script <code>set-client-password-cli.ts</code> pour en créer un.
                </Typography>
              </Alert>
            </Stack>
          </Box>

          <Divider />

          {/* Quick Copy */}
          <Box>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
              📋 Message prêt à envoyer
            </Typography>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<CopyIcon />}
              onClick={handleCopyAll}
            >
              Copier le message complet
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Copie un message formaté avec le lien et les instructions pour le client
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShareCatalogueDialog;
