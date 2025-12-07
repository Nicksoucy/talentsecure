import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Box,
    TextField,
    Button,
    Typography,
    Alert,
    CircularProgress,
    Container,
    Paper,
    Grid,
} from '@mui/material';
import { PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSnackbar } from 'notistack';
import { clientService } from '@/services/client.service';

const registerSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    email: z.string().email('Email invalide'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
    confirmPassword: z.string(),
    companyName: z.string().optional(),
    phone: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

const ClientRegisterPage = () => {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const [error, setError] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
    });

    const onSubmit = async (data: RegisterFormData) => {
        setError('');
        setLoading(true);

        try {
            await clientService.register({
                name: data.name,
                email: data.email,
                password: data.password,
                companyName: data.companyName,
                phone: data.phone,
            });

            enqueueSnackbar('Compte créé avec succès ! Vous pouvez maintenant vous connecter.', {
                variant: 'success'
            });
            navigate('/client/login');
        } catch (err: any) {
            const errorMessage =
                err.response?.data?.error || 'Erreur lors de la création du compte';
            setError(errorMessage);
            enqueueSnackbar(errorMessage, { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f5f5f5',
            }}
        >
            <Container maxWidth="sm">
                <Paper elevation={3} sx={{ p: 4 }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <PersonAddIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                        <Typography variant="h4" gutterBottom fontWeight="bold">
                            Créer un compte
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Inscrivez-vous pour accéder à nos services
                        </Typography>
                    </Box>

                    <form onSubmit={handleSubmit(onSubmit)}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <TextField
                                    label="Nom complet *"
                                    fullWidth
                                    {...register('name')}
                                    error={!!errors.name}
                                    helperText={errors.name?.message}
                                    disabled={loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    label="Email *"
                                    type="email"
                                    fullWidth
                                    {...register('email')}
                                    error={!!errors.email}
                                    helperText={errors.email?.message}
                                    disabled={loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    label="Nom de l'entreprise"
                                    fullWidth
                                    {...register('companyName')}
                                    error={!!errors.companyName}
                                    helperText={errors.companyName?.message}
                                    disabled={loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    label="Téléphone"
                                    fullWidth
                                    {...register('phone')}
                                    error={!!errors.phone}
                                    helperText={errors.phone?.message}
                                    disabled={loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    label="Mot de passe *"
                                    type="password"
                                    fullWidth
                                    {...register('password')}
                                    error={!!errors.password}
                                    helperText={errors.password?.message}
                                    disabled={loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    label="Confirmer le mot de passe *"
                                    type="password"
                                    fullWidth
                                    {...register('confirmPassword')}
                                    error={!!errors.confirmPassword}
                                    helperText={errors.confirmPassword?.message}
                                    disabled={loading}
                                />
                            </Grid>
                        </Grid>

                        <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            size="large"
                            sx={{ mt: 3 }}
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={24} /> : "S'inscrire"}
                        </Button>
                    </form>

                    <Box sx={{ mt: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            Vous avez déjà un compte ?{' '}
                            <Link to="/client/login" style={{ color: '#1976d2', textDecoration: 'none' }}>
                                Se connecter
                            </Link>
                        </Typography>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default ClientRegisterPage;
