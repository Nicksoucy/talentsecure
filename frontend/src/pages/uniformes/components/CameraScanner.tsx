import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

interface Props {
  onScan: (code: string) => void;
  onClose?: () => void;
  /** Ignore le MÊME code re-décodé dans cette fenêtre (ms). @zxing ré-décode
   * plusieurs fois par seconde ; sans ça, un seul scan compterait pour 5-10. */
  debounceMs?: number;
}

/**
 * Scan par caméra (téléphone/webcam). @zxing/browser est importé dynamiquement
 * pour ne pas alourdir le bundle principal. Échec silencieux si caméra absente.
 */
export default function CameraScanner({ onScan, onClose, debounceMs = 1500 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Garde la dernière callback sans relancer la caméra à chaque rendu.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  // Anti-rebond : dernier code émis + timestamp.
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  useEffect(() => {
    let active = true;
    let controls: any;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!result || !active) return;
          const code = result.getText();
          const now = Date.now();
          if (code === lastRef.current.code && now - lastRef.current.at < debounceMs) return;
          lastRef.current = { code, at: now };
          onScanRef.current(code);
        });
      } catch (e: any) {
        setError('Caméra indisponible : ' + (e?.message || 'erreur'));
      }
    })();
    return () => {
      active = false;
      try {
        controls?.stop();
      } catch {
        /* noop */
      }
    };
  }, [debounceMs]);

  return (
    <Box>
      {error ? (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      ) : (
        <video ref={videoRef} style={{ width: '100%', maxHeight: 260, borderRadius: 8, background: '#000' }} />
      )}
      {onClose && (
        <Button size="small" onClick={onClose} sx={{ mt: 1 }}>
          Fermer la caméra
        </Button>
      )}
    </Box>
  );
}
