import { Box, Typography, Button, Card, CardContent } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

const CandidatesPage = () => {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          Candidats
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />}>
          Ajouter un candidat
        </Button>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="body1" color="text.secondary">
            La liste des candidats sera affichée ici.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Cette fonctionnalité sera développée dans les prochaines semaines (Semaine 3-4).
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CandidatesPage;
