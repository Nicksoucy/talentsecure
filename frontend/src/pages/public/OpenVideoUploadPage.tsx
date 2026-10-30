import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import {
  ArrowForward as ArrowForwardIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  LockOutlined as LockIcon,
  ShieldOutlined as ShieldIcon,
} from '@mui/icons-material';
import { publicVideoService, OpenVideoContact } from '@/services/public-video.service';
import PublicVideoPicker, { formatMb } from '@/components/video/PublicVideoPicker';
import { MAX_UPLOAD_BYTES } from './VideoUploadPage';

/**
 * Lien vidéo général : /video, sans aucun identifiant dans l'adresse.
 *
 * Le lien /ma-video?c={{contact.id}} ne fonctionne que dans un message envoyé
 * par GoHighLevel, et seulement 72 h. Celui-ci peut être texté, envoyé par
 * courriel ou publié tel quel : le candidat donne son nom, son téléphone et son
 * courriel, puis envoie sa vidéo. Le serveur la range sur sa fiche (ou la crée).
 *
 * Page vue par des candidats, pas par le personnel : elle porte les couleurs
 * de xguard.ca (rouge et marine) plutôt que le bleu de l'outil interne.
 */

const BRAND = {
  red: '#e81c1c',
  redDark: '#b91515',
  redTint: '#fdecec',
  redText: '#a31212',
  navy: '#0b0f19',
  muted: '#5b6170',
  page: '#f7f8fb',
  stepIdle: '#f2f3f6',
};

const brandTheme = createTheme({
  palette: {
    primary: { main: BRAND.red, dark: BRAND.redDark, contrastText: '#fff' },
    text: { primary: BRAND.navy, secondary: BRAND.muted },
    background: { default: BRAND.page },
  },
  shape: { borderRadius: 8 },
  typography: { button: { textTransform: 'none', fontWeight: 600 } },
});

const STEPS = ['Vous', 'Vidéo', 'Fini'];

function StepIndicator({ current }: { current: number }) {
  return (
    <Stack direction="row" spacing={1} mb={3} aria-label={`Étape ${current + 1} sur 3`}>
      {STEPS.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <Box
            key={label}
            sx={{
              flex: 1,
              py: 1,
              borderRadius: 1.5,
              textAlign: 'center',
              bgcolor: active || done ? BRAND.redTint : BRAND.stepIdle,
              color: active || done ? BRAND.redText : BRAND.muted,
            }}
          >
            <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
              {done ? <CheckIcon sx={{ fontSize: 16, verticalAlign: '-3px' }} /> : i + 1}
            </Typography>
            <Typography variant="caption">{label}</Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

const phoneDigits = (phone: string) => phone.replace(/\D/g, '');
const isValidPhone = (phone: string) => {
  const d = phoneDigits(phone);
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
};
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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
    email: !form.email.trim()
      ? 'Votre courriel'
      : !isValidEmail(form.email.trim())
        ? 'Ce courriel ne semble pas valide'
        : '',
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
      email: form.email.trim(),
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

  const step = done ? 2 : contact ? 1 : 0;

  return (
    <ThemeProvider theme={brandTheme}>
      <Box sx={{ minHeight: '100vh', bgcolor: { xs: '#fff', sm: BRAND.page }, py: { xs: 0, sm: 5 } }}>
        <Paper
          elevation={0}
          sx={{
            maxWidth: 480,
            mx: 'auto',
            borderRadius: { xs: 0, sm: 3 },
            border: { xs: 'none', sm: '1px solid #e6e8ee' },
            overflow: 'hidden',
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ px: 3, py: 2, borderBottom: '1px solid #eef0f4' }}
          >
            <ShieldIcon sx={{ color: BRAND.red, fontSize: 22 }} />
            <Typography fontWeight={700} letterSpacing={1} fontSize={15}>
              XGUARD
            </Typography>
          </Stack>

          <Box sx={{ px: 3, pt: 3, pb: 4 }}>
            {step === 0 && (
              <>
                <Typography variant="h5" component="h1" fontWeight={700} lineHeight={1.25} gutterBottom>
                  Montrez-nous qui vous êtes en 30 secondes
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                  Pas besoin d'être parfait. On veut juste vous voir et vous entendre.
                </Typography>
              </>
            )}
            {step === 1 && (
              <>
                <Typography variant="h5" component="h1" fontWeight={700} lineHeight={1.25} gutterBottom>
                  Merci {contact?.firstName} ! À vous de jouer
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                  Environ 30 secondes : qui vous êtes, votre expérience, et pourquoi XGuard.
                </Typography>
              </>
            )}

            <StepIndicator current={step} />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {step === 0 && (
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
                  label="Courriel"
                  value={form.email}
                  onChange={update('email')}
                  error={touched && Boolean(errors.email)}
                  helperText={touched && errors.email}
                  autoComplete="email"
                  inputProps={{ inputMode: 'email' }}
                  required
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disableElevation
                  endIcon={<ArrowForwardIcon />}
                  fullWidth
                >
                  Continuer
                </Button>
                <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center" color="text.secondary">
                  <LockIcon sx={{ fontSize: 14 }} />
                  <Typography variant="caption">Vos informations restent chez XGuard.</Typography>
                </Stack>
              </Stack>
            )}

            {step === 1 && (
              <>
                <PublicVideoPicker
                  maxBytes={MAX_UPLOAD_BYTES}
                  uploading={uploading}
                  progress={progress}
                  onSend={send}
                  recordFirst
                />
                <Button
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={uploading}
                  onClick={() => setContact(null)}
                >
                  Modifier mes coordonnées
                </Button>
                <Typography variant="caption" color="text.secondary" display="block" mt={2}>
                  Un endroit calme, bien éclairé, et le téléphone à la verticale : c'est amplement suffisant.
                </Typography>
              </>
            )}

            {step === 2 && (
              <Box textAlign="center" py={2}>
                <CheckCircleIcon sx={{ fontSize: 64, color: BRAND.red, mb: 1 }} />
                <Typography variant="h5" component="h1" fontWeight={700} gutterBottom>
                  Vidéo bien reçue !
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Merci {contact?.firstName}. Notre équipe de recrutement regarde votre candidature et
                  vous reviendra rapidement. Vous pouvez fermer cette page.
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
