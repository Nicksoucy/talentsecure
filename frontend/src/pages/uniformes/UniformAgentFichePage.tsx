import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import UniformFichePanel from './components/UniformFichePanel';

export default function UniformAgentFichePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return (
    <Box>
      <Typography variant="h5" mb={2}>Gestion des uniformes</Typography>
      {employeeId && <UniformFichePanel employeeId={employeeId} />}
    </Box>
  );
}
