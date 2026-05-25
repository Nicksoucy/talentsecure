import { useEffect, useRef, useState } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

interface Props {
  onScan: (code: string) => void;
  autoFocus?: boolean;
}

/**
 * Champ qui capte les lecteurs USB (= clavier) : la saisie se termine par Entrée.
 * Fonctionne aussi en saisie manuelle.
 */
export default function BarcodeScannerInput({ onScan, autoFocus }: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <TextField
      inputRef={ref}
      fullWidth
      size="small"
      label="Scanner / saisir un code-barres"
      placeholder="Lecteur USB = clavier — terminez par Entrée"
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
  );
}
