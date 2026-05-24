import { useQuery } from '@tanstack/react-query';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Email as EmailIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  ShoppingCart as CartIcon,
} from '@mui/icons-material';
import { talentMarketplaceService } from '@/services/talent-marketplace.service';

/**
 * Candidats achetés par le client, avec leurs coordonnées (jamais CV/adresse).
 */
export default function ClientPurchasesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['client-purchases'],
    queryFn: () => talentMarketplaceService.getPurchases(),
  });

  const purchases = data?.data || [];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <CartIcon color="primary" />
        <Typography variant="h4" fontWeight="bold">Mes candidats achetés</Typography>
      </Box>

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : purchases.length === 0 ? (
        <Alert severity="info">Aucun candidat acheté pour le moment.</Alert>
      ) : (
        <Grid container spacing={3}>
          {purchases.map((p) => (
            <Grid item xs={12} sm={6} md={4} key={p.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold">
                    {p.candidate.firstName} {p.candidate.lastName}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', mb: 1 }}>
                    <LocationIcon fontSize="small" />
                    <Typography variant="body2">{p.candidate.city}, {p.candidate.province}</Typography>
                  </Box>
                  {p.candidate.phone && (
                    <Typography variant="body2"><PhoneIcon fontSize="inherit" /> {p.candidate.phone}</Typography>
                  )}
                  {p.candidate.email && (
                    <Typography variant="body2"><EmailIcon fontSize="inherit" /> {p.candidate.email}</Typography>
                  )}
                  {p.candidate.clientNote && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
                      {p.candidate.clientNote}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1 }}>
                    <Chip size="small" label={`Acheté le ${new Date(p.purchasedAt).toLocaleDateString('fr-CA')}`} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
