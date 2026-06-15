import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, TextField, InputAdornment } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CameraScanner from './CameraScanner';

interface Props {
  onScan: (code: string) => void;
  autoFocus?: boolean;
}

/**
 * Saisie d'un code-barres : lecteur USB (= clavier, terminé par Entrée), saisie
 * manuelle, OU scan par CAMÉRA (bouton « Caméra » — indispensable au téléphone,
 * où il n'y a pas de lecteur USB). Réutilise le composant CameraScanner.
 */
export default function BarcodeScannerInput({ onScan, autoFocus }: Props) {
  const [value, setValue] = useState('');
  const [camOpen, setCamOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && !camOpen) ref.current?.focus();
  }, [autoFocus, camOpen]);

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          inputRef={ref}
          fullWidth
          size="small"
          label="Scanner / saisir un code-barres"
          placeholder="Lecteur USB, caméra, ou saisie manuelle — Entrée pour valider"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const code = value.trim();
              if (code) {
                onScan(code);
                setValue('');
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <QrCodeScannerIcon />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant={camOpen ? 'contained' : 'outlined'}
          startIcon={<PhotoCameraIcon />}
          onClick={() => setCamOpen((v) => !v)}
          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {camOpen ? 'Fermer' : 'Caméra'}
        </Button>
      </Stack>
      {camOpen && (
        <Box sx={{ mt: 1 }}>
          <CameraScanner onScan={onScan} onClose={() => setCamOpen(false)} />
        </Box>
      )}
    </Box>
  );
}
