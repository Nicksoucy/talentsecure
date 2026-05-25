import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Box, Button, Stack, Typography } from '@mui/material';

interface Props {
  label?: string;
  onChange: (dataUrl: string | null) => void;
}

export default function SignaturePad({ label, onChange }: Props) {
  const ref = useRef<SignatureCanvas>(null);

  const handleEnd = () => {
    const pad = ref.current;
    if (pad && !pad.isEmpty()) onChange(pad.toDataURL('image/png'));
  };
  const clear = () => {
    ref.current?.clear();
    onChange(null);
  };

  return (
    <Box>
      {label && (
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          {label}
        </Typography>
      )}
      <Box sx={{ border: '1px solid #bbb', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
        <SignatureCanvas
          ref={ref}
          penColor="black"
          canvasProps={{ width: 460, height: 160, style: { width: '100%', height: 160, touchAction: 'none' } }}
          onEnd={handleEnd}
        />
      </Box>
      <Stack direction="row" justifyContent="flex-end" mt={0.5}>
        <Button size="small" onClick={clear}>
          Effacer
        </Button>
      </Stack>
    </Box>
  );
}
