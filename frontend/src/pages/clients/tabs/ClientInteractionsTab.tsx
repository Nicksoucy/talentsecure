import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Button,
    Typography,
    Paper,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Grid,
    CircularProgress,
    Alert,
    MenuItem,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Avatar,
    Divider
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    Event as EventIcon,
    Note as NoteIcon,
    CallMade as CallMadeIcon,
    CallReceived as CallReceivedIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { clientCrmService, Interaction } from '@/services/client-crm.service';

interface ClientInteractionsTabProps {
    clientId: string;
}

export default function ClientInteractionsTab({ clientId }: ClientInteractionsTabProps) {
    const { enqueueSnackbar } = useSnackbar();
    const queryClient = useQueryClient();
    const [openDialog, setOpenDialog] = useState(false);
    const [formData, setFormData] = useState<Partial<Interaction>>({
        type: 'CALL',
        direction: 'OUTBOUND'
    });

    const { data: interactions, isLoading, error } = useQuery({
        queryKey: ['client-interactions', clientId],
        queryFn: () => clientCrmService.getInteractions(clientId),
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<Interaction>) => clientCrmService.createInteraction(clientId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-interactions', clientId] });
            enqueueSnackbar('Interaction enregistrée', { variant: 'success' });
            handleCloseDialog();
        },
        onError: () => enqueueSnackbar('Erreur lors de la création', { variant: 'error' })
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => clientCrmService.deleteInteraction(clientId, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-interactions', clientId] });
            enqueueSnackbar('Interaction supprimée', { variant: 'success' });
        },
    });

    const handleOpenCreate = () => {
        setFormData({
            type: 'CALL',
            direction: 'OUTBOUND',
            subject: '',
            content: ''
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    const handleSave = () => {
        createMutation.mutate(formData);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Supprimer cette interaction ?')) {
            deleteMutation.mutate(id);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'CALL': return <PhoneIcon />;
            case 'EMAIL': return <EmailIcon />;
            case 'MEETING': return <EventIcon />;
            default: return <NoteIcon />;
        }
    };

    if (isLoading) return <CircularProgress />;
    if (error) return <Alert severity="error">Erreur de chargement des interactions</Alert>;

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6">Historique des échanges ({interactions?.length || 0})</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
                    Nouvelle interaction
                </Button>
            </Box>

            <Paper variant="outlined">
                <List>
                    {interactions?.map((interaction, index) => (
                        <Box key={interaction.id}>
                            <ListItem
                                alignItems="flex-start"
                                secondaryAction={
                                    <IconButton edge="end" size="small" onClick={() => handleDelete(interaction.id)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                }
                            >
                                <ListItemIcon>
                                    <Avatar sx={{ bgcolor: interaction.direction === 'INBOUND' ? 'secondary.main' : 'primary.main' }}>
                                        {getIcon(interaction.type)}
                                    </Avatar>
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {interaction.subject || interaction.type}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                - {new Date(interaction.createdAt).toLocaleString()} par {interaction.user?.firstName || 'Moi'}
                                            </Typography>
                                        </Box>
                                    }
                                    secondary={
                                        <>
                                            <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {interaction.direction === 'INBOUND' ? <CallReceivedIcon fontSize="inherit" color="action" /> : <CallMadeIcon fontSize="inherit" color="action" />}
                                                {interaction.direction === 'INBOUND' ? 'Entrant' : 'Sortant'}
                                            </Typography>
                                            {interaction.content && (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                                    {interaction.content}
                                                </Typography>
                                            )}
                                        </>
                                    }
                                />
                            </ListItem>
                            {index < (interactions.length - 1) && <Divider component="li" />}
                        </Box>
                    ))}
                    {interactions?.length === 0 && (
                        <ListItem>
                            <ListItemText secondary="Aucune interaction enregistrée." sx={{ textAlign: 'center', py: 2 }} />
                        </ListItem>
                    )}
                </List>
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Nouvelle interaction</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={6}>
                            <TextField
                                select
                                label="Type"
                                fullWidth
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            >
                                <MenuItem value="CALL">Appel</MenuItem>
                                <MenuItem value="EMAIL">Email</MenuItem>
                                <MenuItem value="MEETING">Réunion</MenuItem>
                                <MenuItem value="NOTE">Note</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                select
                                label="Direction"
                                fullWidth
                                value={formData.direction}
                                onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                            >
                                <MenuItem value="OUTBOUND">Sortant (Nous → Client)</MenuItem>
                                <MenuItem value="INBOUND">Entrant (Client → Nous)</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Sujet"
                                fullWidth
                                value={formData.subject || ''}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Contenu / Résumé"
                                fullWidth
                                multiline
                                rows={4}
                                value={formData.content || ''}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Annuler</Button>
                    <Button variant="contained" onClick={handleSave}>
                        Enregistrer
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
