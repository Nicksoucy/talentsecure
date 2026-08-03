import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  Videocam as VideocamIcon,
  Stop as StopIcon,
  Replay as ReplayIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';

/**
 * Enregistrement de la vidéo de présentation directement dans le navigateur.
 *
 * Pourquoi proposer ça plutôt que seulement « choisir un fichier » : une vidéo
 * de 3 min filmée avec l'app caméra d'un téléphone récent pèse facilement
 * 800 Mo, alors que le même enregistrement via MediaRecorder tourne autour de
 * 20-50 Mo. Sur données cellulaires, c'est la différence entre un téléversement
 * qui aboutit et un qui n'aboutit pas.
 */

/** Durée maximale d'un enregistrement. Au-delà, on arrête automatiquement. */
export const MAX_RECORDING_SECONDS = 180;

/**
 * Choisit un conteneur que le navigateur sait produire.
 *
 * Safari (macOS et iOS ≥ 14.3) ne produit que du MP4 ; Chrome et Firefox ne
 * produisent que du WebM. On essaie donc dans cet ordre et on retourne null si
 * MediaRecorder est absent ou qu'aucun format n'est supporté — l'appelant
 * bascule alors sur l'onglet « téléverser un fichier ».
 */
export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;

  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

/** Type MIME sans ses paramètres de codec — c'est ce qu'on envoie au serveur. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

function extensionFor(mimeType: string): string {
  return baseMimeType(mimeType) === 'video/mp4' ? 'mp4' : 'webm';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Phase = 'idle' | 'live' | 'recording' | 'recorded';

interface VideoRecorderProps {
  /** Appelé quand le candidat valide son enregistrement. */
  onRecorded: (blob: Blob, filename: string) => void;
  /** Signale à la page que la capture est indisponible (pas de caméra, refus…). */
  onUnavailable?: (reason: string) => void;
  disabled?: boolean;
}

const VideoRecorder: React.FC<VideoRecorderProps> = ({ onRecorded, onUnavailable, disabled }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = useCallback(() => {
    // Sans ça, le voyant de la caméra reste allumé après avoir quitté l'onglet.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Libération à la sortie : caméra, minuterie, et l'URL objet de la relecture.
  useEffect(() => {
    return () => {
      stopStream();
      clearTimer();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [stopStream, clearTimer, recordedUrl]);

  const startCamera = async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      const reason = "Votre navigateur ne permet pas d'enregistrer une vidéo ici.";
      setError(reason);
      onUnavailable?.(reason);
      return;
    }
    if (!pickMimeType()) {
      const reason = "Votre navigateur ne permet pas d'enregistrer une vidéo ici.";
      setError(reason);
      onUnavailable?.(reason);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // sinon larsen pendant la prévisualisation
        await videoRef.current.play().catch(() => undefined);
      }
      setPhase('live');
    } catch (e: any) {
      const reason =
        e?.name === 'NotAllowedError'
          ? "L'accès à la caméra a été refusé. Autorisez-le dans votre navigateur, ou téléversez plutôt un fichier."
          : e?.name === 'NotFoundError'
            ? 'Aucune caméra détectée sur cet appareil.'
            : "Impossible d'accéder à la caméra.";
      setError(reason);
      onUnavailable?.(reason);
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const mimeType = pickMimeType();
    if (!stream || !mimeType) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      clearTimer();
      // On force le type de base (sans `;codecs=…`) : c'est celui que le
      // serveur signe, et l'en-tête du PUT doit correspondre au caractère près.
      const blob = new Blob(chunksRef.current, { type: baseMimeType(mimeType) });
      blobRef.current = blob;
      stopStream();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.muted = false;
      }
      setRecordedUrl(URL.createObjectURL(blob));
      setPhase('recorded');
    };

    recorder.start();
    setElapsed(0);
    setPhase('recording');

    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORDING_SECONDS) {
          // Arrêt automatique : évite un fichier démesuré si on oublie d'arrêter.
          recorderRef.current?.stop();
        }
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const retake = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setPhase('idle');
    startCamera();
  };

  const confirm = () => {
    const blob = blobRef.current;
    if (!blob) return;
    onRecorded(blob, `presentation.${extensionFor(blob.type)}`);
  };

  const remaining = MAX_RECORDING_SECONDS - elapsed;

  return (
    <Box>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          maxHeight: 420,
          bgcolor: 'grey.900',
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          src={recordedUrl ?? undefined}
          controls={phase === 'recorded'}
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Effet miroir en prévisualisation : on se voit comme dans un
            // miroir, pas inversé. La vidéo enregistrée, elle, reste normale.
            transform: phase === 'recorded' ? 'none' : 'scaleX(-1)',
            display: phase === 'idle' ? 'none' : 'block',
          }}
        />

        {phase === 'idle' && (
          <Typography variant="body2" sx={{ color: 'grey.400', px: 3, textAlign: 'center' }}>
            Placez-vous face à la caméra, dans un endroit calme et bien éclairé.
          </Typography>
        )}

        {phase === 'recording' && (
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: 'common.white',
              px: 1.5,
              py: 0.5,
              borderRadius: 5,
            }}
          >
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main' }} />
            <Typography variant="caption">{formatDuration(elapsed)}</Typography>
          </Box>
        )}
      </Box>

      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {phase === 'idle' && (
          <Button
            variant="contained"
            size="large"
            startIcon={<VideocamIcon />}
            onClick={startCamera}
            disabled={disabled}
            fullWidth
          >
            Activer la caméra
          </Button>
        )}

        {phase === 'live' && (
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<VideocamIcon />}
            onClick={startRecording}
            disabled={disabled}
            fullWidth
          >
            Commencer l'enregistrement
          </Button>
        )}

        {phase === 'recording' && (
          <>
            <Button
              variant="contained"
              size="large"
              startIcon={<StopIcon />}
              onClick={stopRecording}
              fullWidth
            >
              Arrêter l'enregistrement
            </Button>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Il vous reste {formatDuration(Math.max(0, remaining))}
            </Typography>
          </>
        )}

        {phase === 'recorded' && (
          <>
            <Button
              variant="contained"
              size="large"
              startIcon={<CheckIcon />}
              onClick={confirm}
              disabled={disabled}
              fullWidth
            >
              Envoyer cette vidéo
            </Button>
            <Button
              variant="text"
              startIcon={<ReplayIcon />}
              onClick={retake}
              disabled={disabled}
              fullWidth
            >
              Recommencer
            </Button>
          </>
        )}
      </Stack>

      {phase !== 'recorded' && (
        <Typography variant="caption" color="text.secondary" display="block" mt={2}>
          Maximum {Math.round(MAX_RECORDING_SECONDS / 60)} minutes. Présentez-vous, votre expérience
          et pourquoi vous voulez travailler avec nous.
        </Typography>
      )}
    </Box>
  );
};

export default VideoRecorder;
