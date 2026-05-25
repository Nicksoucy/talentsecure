import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

interface Props {
  onScan: (code: string) => void;
  onClose?: () => void;
}

/**
 * Scan par caméra (téléphone/webcam). @zxing/browser est importé dynamiquement
 * pour ne pas alourdir le bundle principal. Échec silencieux si caméra absente.
 */
export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let controls: any;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (result && active) onScan(result.getText());
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
  }, [onScan]);

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
