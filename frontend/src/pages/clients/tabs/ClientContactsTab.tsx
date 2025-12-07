import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Button,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Grid,
    FormControlLabel,
    Switch,
    Alert,
    CircularProgress
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon,
    Phone as PhoneIcon,
    Email as EmailIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { clientCrmService, Contact } from '@/services/client-crm.service';

interface ClientContactsTabProps {
    clientId: string;
}

export default function ClientContactsTab({ clientId }: ClientContactsTabProps) {
    const { enqueueSnackbar } = useSnackbar();
    const queryClient = useQueryClient();
    const [openDialog, setOpenDialog] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [formData, setFormData] = useState<Partial<Contact>>({});

    const { data: contacts, isLoading, error } = useQuery({
        queryKey: ['client-contacts', clientId],
        queryFn: () => clientCrmService.getContacts(clientId),
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<Contact>) => clientCrmService.createContact(clientId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-contacts', clientId] });
            enqueueSnackbar('Contact ajouté', { variant: 'success' });
            handleCloseDialog();
        },
        onError: () => enqueueSnackbar('Erreur lors de la création', { variant: 'error' })
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
            clientCrmService.updateContact(clientId, id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-contacts', clientId] });
            enqueueSnackbar('Contact modifié', { variant: 'success' });
            handleCloseDialog();
        },
        onError: () => enqueueSnackbar('Erreur lors de la modification', { variant: 'error' })
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => clientCrmService.deleteContact(clientId, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['client-contacts', clientId] });
            enqueueSnackbar('Contact supprimé', { variant: 'success' });
        },
    });

    const handleOpenCreate = () => {
        setEditingContact(null);
        setFormData({
            firstName: '',
            lastName: '',
            role: '',
            email: '',
            phone: '',
            isPrimary: false,
            notes: ''
        });
        setOpenDialog(true);
    };

    const handleOpenEdit = (contact: Contact) => {
        setEditingContact(contact);
        setFormData(contact);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingContact(null);
    };

    const handleSave = () => {
        if (editingContact) {
            updateMutation.mutate({ id: editingContact.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Voulez-vous vraiment supprimer ce contact ?')) {
            deleteMutation.mutate(id);
        }
    };

    if (isLoading) return <CircularProgress />;
    if (error) return <Alert severity="error">Erreur de chargement des contacts</Alert>;

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6">Contacts ({contacts?.length || 0})</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
                    Ajouter un contact
                </Button>
            </Box>

            <TableContainer component={Paper} elevation={0} variant="outlined">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell width={50}></TableCell>
                            <TableCell>Nom</TableCell>
                            <TableCell>Rôle</TableCell>
                            <TableCell>Coordonnées</TableCell>
                            <TableCell>Notes</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {contacts?.map((contact) => (
                            <TableRow key={contact.id}>
                                <TableCell>
                                    {contact.isPrimary ? (
                                        <StarIcon color="warning" />
                                    ) : (
                                        <StarBorderIcon color="disabled" />
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Typography fontWeight="bold">
                                        {contact.firstName} {contact.lastName}
                                    </Typography>
                                </TableCell>
                                <TableCell>{contact.role || '-'}</TableCell>
                                <TableCell>
                                    <Box display="flex" flexDirection="column" gap={0.5}>
                                        {contact.email && (
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <EmailIcon fontSize="small" color="action" />
                                                <Typography variant="body2">{contact.email}</Typography>
                                            </Box>
                                        )}
                                        {contact.phone && (
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <PhoneIcon fontSize="small" color="action" />
                                                <Typography variant="body2">{contact.phone}</Typography>
                                            </Box>
                                        )}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                        {contact.notes}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton size="small" onClick={() => handleOpenEdit(contact)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => handleDelete(contact.id)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {contacts?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">Aucun contact enregistré.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingContact ? 'Modifier le contact' : 'Ajouter un contact'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={6}>
                            <TextField
                                label="Prénom"
                                fullWidth
                                required
                                value={formData.firstName || ''}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Nom"
                                fullWidth
                                required
                                value={formData.lastName || ''}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Rôle / Fonction"
                                fullWidth
                                value={formData.role || ''}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                placeholder="Ex: DRH, Gérant..."
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Email"
                                fullWidth
                                value={formData.email || ''}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                label="Téléphone"
                                fullWidth
                                value={formData.phone || ''}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Notes"
                                fullWidth
                                multiline
                                rows={3}
                                value={formData.notes || ''}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.isPrimary || false}
                                        onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                                    />
                                }
                                label="Contact principal"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Annuler</Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={!formData.firstName || !formData.lastName}
                    >
                        Enregistrer
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
