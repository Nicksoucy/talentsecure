import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Box, Button, Stack, Typography } from '@mui/material';

interface Props {
  label?: string;
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * Pavé de signature responsive : le canvas interne se redimensionne pour
 * correspondre exactement à la largeur du conteneur (sinon les coordonnées
 * de dessin sont décalées sur cellulaire).
 */
export default function SignaturePad({ label, onChange, height = 180 }: Props) {
  const ref = useRef<SignatureCanvas>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(400);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el && el.offsetWidth > 0) setWidth(el.offsetWidth);
    };
    update();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(containerRef.current);
    }
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

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
      <Box
        ref={containerRef}
        sx={{ border: '1px solid #bbb', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden', width: '100%' }}
      >
        <SignatureCanvas
          ref={ref}
          penColor="black"
          canvasProps={{
            width,
            height,
            style: { width: '100%', height, touchAction: 'none', display: 'block' },
          }}
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
