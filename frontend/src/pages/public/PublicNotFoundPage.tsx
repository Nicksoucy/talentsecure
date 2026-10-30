import { Container, Paper, Typography } from '@mui/material';

/**
 * Adresse inconnue, visiteur non connecté.
 *
 * Les candidats reçoivent des liens publics (/video, /ma-video, /mon-profil/…).
 * Un lien mal copié, ou une page pas encore déployée, ne doit JAMAIS les
 * envoyer sur la page de connexion de TalentSecure : ils tombent ici, sur un
 * message neutre, sans lien vers l'outil interne.
 */
export default function PublicNotFoundPage() {
  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          Cette page n'existe pas
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Le lien est peut-être incomplet. Vérifiez qu'il a été copié en entier, ou écrivez-nous
          et nous vous en enverrons un nouveau.
        </Typography>
      </Paper>
    </Container>
  );
}
