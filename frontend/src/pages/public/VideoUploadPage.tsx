import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  Videocam as VideocamIcon,
} from '@mui/icons-material';
import { publicVideoService } from '@/services/public-video.service';
import VideoRecorder from '@/components/video/VideoRecorder';

/**
 * Page publique de téléversement de la vidéo de présentation.
 *
 * Elle existe parce que le champ fichier d'un formulaire GoHighLevel est
 * plafonné à 50 Mo — ce qui écarte précisément les candidats qui se donnent la
 * peine de faire une vraie vidéo. Le formulaire GHL redirige ici après l'envoi,
 * et un rappel SMS/courriel renvoie le même lien.
 *
 * Le candidat n'a pas de compte : l'accès repose sur l'identifiant de contact
 * opaque présent dans l'URL, revalidé côté serveur à chaque appel.
 */

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = 'video/mp4,video/quicktime,video/webm,video/x-matroska,video/3gpp';

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} Mo`;

export default function VideoUploadPage() {
  const [searchParams] = useSearchParams();
  // On retient le premier paramètre EXPLOITABLE, pas simplement le premier
  // présent : si la redirection GHL n'interpole pas son merge field, `c` vaut
  // littéralement `{{contact.id}}` alors qu'un `contact_id` valide peut se
  // trouver juste à côté. Afficher « lien invalide » dans ce cas serait faux.
  const contactId =
    [searchParams.get('c'), searchParams.get('contact_id')].find((v) =>
      /^[A-Za-z0-9_-]{10,64}$/.test((v || '').trim())
    )?.trim() || '';

  const [tab, setTab] = useState<'file' | 'record'>('file');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: session, isLoading, isError, error: sessionError } = useQuery({
    queryKey: ['public-video-session', contactId],
    queryFn: () => publicVideoService.getSession(contactId),
    enabled: Boolean(contactId),
    retry: false,
  });

  // Une panne de notre côté ne doit surtout pas être annoncée comme un lien
  // mort : le candidat abandonnerait alors que son lien est parfaitement bon.
  const serviceDown = (sessionError as any)?.response?.status === 503;

  const maxBytes = session?.maxBytes ?? MAX_UPLOAD_BYTES;

  const greeting = useMemo(
    () => (session?.firstName ? `Bonjour ${session.firstName} !` : 'Dernière étape'),
    [session?.firstName]
  );

  const send = async (blob: Blob, filename: string) => {
    if (blob.size > maxBytes) {
      setError(
        `Cette vidéo fait ${formatMb(blob.size)}, au-delà de la limite de ${formatMb(maxBytes)}. ` +
          "Essayez l'onglet « Enregistrer maintenant » : le fichier produit est beaucoup plus léger."
      );
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      await publicVideoService.upload(contactId, blob, filename, setProgress);
      setDone(true);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void send(file, file.name);
  };

  // ── États terminaux ───────────────────────────────────────────────────────

  if (serviceDown) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="info">
          Notre service est momentanément indisponible. Votre lien reste valide — réessayez dans
          quelques minutes.
        </Alert>
      </Container>
    );
  }

  if (!contactId || isError) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="warning">
          Ce lien n'est plus valide. Écrivez-nous et nous vous en enverrons un nouveau pour
          transmettre votre vidéo.
        </Alert>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={10}>
        <CircularProgress />
      </Box>
    );
  }

  if (done || session?.alreadyUploaded) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            {done ? 'Vidéo bien reçue !' : 'Votre vidéo nous est déjà parvenue'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Merci. Notre équipe de recrutement regarde votre candidature et vous reviendra
            rapidement. Vous pouvez fermer cette page.
          </Typography>
        </Paper>
      </Container>
    );
  }

  // ── Formulaire ────────────────────────────────────────────────────────────

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h5" gutterBottom>
        {greeting}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Il ne reste qu'à nous envoyer votre vidéo de présentation. Prenez une minute ou deux pour
        vous présenter — c'est ce qui fait la différence.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper elevation={2} sx={{ overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="file" label="Téléverser un fichier" disabled={uploading} />
          <Tab value="record" label="Enregistrer maintenant" disabled={uploading} />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 'file' && (
            <Stack spacing={2}>
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: 'none' }}
                id="public-video-input"
                data-testid="public-video-input"
              />
              <label htmlFor="public-video-input">
                <Button
                  variant="contained"
                  component="span"
                  size="large"
                  startIcon={<UploadIcon />}
                  disabled={uploading}
                  fullWidth
                >
                  Choisir ma vidéo
                </Button>
              </label>
              <Typography variant="caption" color="text.secondary">
                MP4, MOV, WebM — jusqu'à {formatMb(maxBytes)}. Si votre vidéo est plus lourde,
                utilisez plutôt l'onglet « Enregistrer maintenant ».
              </Typography>
            </Stack>
          )}

          {tab === 'record' && (
            <VideoRecorder
              onRecorded={(blob, filename) => void send(blob, filename)}
              onUnavailable={() => setTab('file')}
              disabled={uploading}
            />
          )}

          {uploading && (
            <Box mt={3}>
              <LinearProgress variant="determinate" value={progress} />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Envoi en cours — {progress} %. Gardez cette page ouverte.
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      <Stack direction="row" spacing={1} alignItems="center" mt={3} color="text.secondary">
        <VideocamIcon fontSize="small" />
        <Typography variant="caption">
          Un endroit calme, bien éclairé, et le téléphone à la verticale : c'est amplement suffisant.
        </Typography>
      </Stack>
    </Container>
  );
}
