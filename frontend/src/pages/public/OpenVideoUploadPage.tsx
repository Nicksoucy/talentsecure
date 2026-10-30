import { useState } from 'react';
import { Alert, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle as CheckCircleIcon, Videocam as VideocamIcon } from '@mui/icons-material';
import { publicVideoService, OpenVideoContact } from '@/services/public-video.service';
import PublicVideoPicker, { formatMb } from '@/components/video/PublicVideoPicker';
import { MAX_UPLOAD_BYTES } from './VideoUploadPage';

/**
 * Lien vidéo général : /video, sans aucun identifiant dans l'adresse.
 *
 * Le lien /ma-video?c={{contact.id}} ne fonctionne que dans un message envoyé
 * par GoHighLevel, et seulement 72 h. Celui-ci peut être texté, envoyé par
 * courriel ou publié tel quel : le candidat donne son nom et son téléphone,
 * puis envoie sa vidéo. Le serveur la range sur sa fiche (ou la crée).
 */

const phoneDigits = (phone: string) => phone.replace(/\D/g, '');
const isValidPhone = (phone: string) => {
  const d = phoneDigits(phone);
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
};
const isValidEmail = (email: string) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function OpenVideoUploadPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [touched, setTouched] = useState(false);
  const [contact, setContact] = useState<OpenVideoContact | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const errors = {
    firstName: !form.firstName.trim() ? 'Votre prénom' : '',
    lastName: !form.lastName.trim() ? 'Votre nom' : '',
    phone: !isValidPhone(form.phone) ? 'Un numéro à 10 chiffres, ex. 514 555-1234' : '',
    email: !isValidEmail(form.email.trim()) ? 'Ce courriel ne semble pas valide' : '',
  };
  const formValid = !Object.values(errors).some(Boolean);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!formValid) return;
    setContact({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
    });
  };

  const send = async (blob: Blob, filename: string) => {
    if (!contact) return;
    if (blob.size > MAX_UPLOAD_BYTES) {
      setError(
        `Cette vidéo fait ${formatMb(blob.size)}, au-delà de la limite de ${formatMb(MAX_UPLOAD_BYTES)}. ` +
          "Essayez l'onglet « Enregistrer maintenant » : le fichier produit est beaucoup plus léger."
      );
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      await publicVideoService.uploadOpen(contact, blob, filename, setProgress);
      setDone(true);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez."
      );
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Vidéo bien reçue !
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Merci {contact?.firstName}. Notre équipe de recrutement regarde votre candidature et
            vous reviendra rapidement. Vous pouvez fermer cette page.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" gutterBottom>
        {contact ? `Merci ${contact.firstName} !` : 'Envoyez-nous votre vidéo'}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {contact
          ? "Il ne reste qu'à nous envoyer votre vidéo de présentation. Prenez une minute ou deux pour vous présenter — c'est ce qui fait la différence."
          : 'Dites-nous qui vous êtes, puis enregistrez ou téléversez une courte vidéo de présentation.'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!contact ? (
        <Paper elevation={2} sx={{ p: 3 }}>
          <Stack component="form" spacing={2} onSubmit={handleContinue} noValidate>
            <TextField
              label="Prénom"
              value={form.firstName}
              onChange={update('firstName')}
              error={touched && Boolean(errors.firstName)}
              helperText={touched && errors.firstName}
              autoComplete="given-name"
              required
              fullWidth
            />
            <TextField
              label="Nom"
              value={form.lastName}
              onChange={update('lastName')}
              error={touched && Boolean(errors.lastName)}
              helperText={touched && errors.lastName}
              autoComplete="family-name"
              required
              fullWidth
            />
            <TextField
              label="Téléphone"
              value={form.phone}
              onChange={update('phone')}
              error={touched && Boolean(errors.phone)}
              helperText={touched && errors.phone}
              autoComplete="tel"
              inputProps={{ inputMode: 'tel' }}
              required
              fullWidth
            />
            <TextField
              label="Courriel (facultatif)"
              value={form.email}
              onChange={update('email')}
              error={touched && Boolean(errors.email)}
              helperText={touched && errors.email}
              autoComplete="email"
              inputProps={{ inputMode: 'email' }}
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" fullWidth>
              Continuer
            </Button>
          </Stack>
        </Paper>
      ) : (
        <>
          <PublicVideoPicker
            maxBytes={MAX_UPLOAD_BYTES}
            uploading={uploading}
            progress={progress}
            onSend={send}
          />
          <Button
            size="small"
            sx={{ mt: 1 }}
            disabled={uploading}
            onClick={() => setContact(null)}
          >
            Modifier mes coordonnées
          </Button>
        </>
      )}

      <Stack direction="row" spacing={1} alignItems="center" mt={3} color="text.secondary">
        <VideocamIcon fontSize="small" />
        <Typography variant="caption">
          Un endroit calme, bien éclairé, et le téléphone à la verticale : c'est amplement suffisant.
        </Typography>
      </Stack>
    </Container>
  );
}
