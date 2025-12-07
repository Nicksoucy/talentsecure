import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    Paper,
    IconButton,
    CircularProgress,
    Alert,
    Breadcrumbs,
    Link,
    Chip,
    Button
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Business as BusinessIcon,
    People as PeopleIcon,
    Timeline as TimelineIcon,
    Info as InfoIcon,
    Edit as EditIcon
} from '@mui/icons-material';
import { clientService } from '@/services/client.service';
import ClientContactsTab from './tabs/ClientContactsTab';
import ClientInteractionsTab from './tabs/ClientInteractionsTab';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            {...other}
            style={{ padding: '24px 0' }}
        >
            {value === index && children}
        </div>
    );
}

export default function ClientDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [currentTab, setCurrentTab] = useState(0);

    const { data: clientData, isLoading, error } = useQuery({
        queryKey: ['client', id],
        queryFn: () => clientService.getClientById(id!),
        enabled: !!id,
    });

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setCurrentTab(newValue);
    };

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                <CircularProgress />
            </Box>
        );
    }

    if (error || !clientData) {
        return (
            <Box p={3}>
                <Alert severity="error">
                    Client introuvable ou erreur de chargement.
                    <Button onClick={() => navigate('/clients')} sx={{ ml: 2 }}>Retour</Button>
                </Alert>
            </Box>
        );
    }

    const client = clientData.data;

    // Function to edit client - currently redirects to list with edit modal if possible, 
    // or we could implement edit here. For now, we'll just show the button.
    const handleEdit = () => {
        // In a real app we might open a dialog here or navigate to /clients?edit=id
        navigate('/clients');
    };

    return (
        <Box>
            {/* Header & Breadcrumbs */}
            <Box mb={3}>
                <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
                    <Link
                        color="inherit"
                        underline="hover"
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate('/clients')}
                    >
                        Clients
                    </Link>
                    <Typography color="text.primary">{client.name}</Typography>
                </Breadcrumbs>

                <Box display="flex" alignItems="center" gap={2}>
                    <IconButton onClick={() => navigate('/clients')}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box flex={1}>
                        <Box display="flex" alignItems="center" gap={2}>
                            <Typography variant="h4" fontWeight="bold">
                                {client.companyName || client.name}
                            </Typography>
                            <Chip
                                label={client.isActive ? 'Actif' : 'Inactif'}
                                color={client.isActive ? 'success' : 'default'}
                                size="small"
                            />
                        </Box>
                        <Typography variant="subtitle1" color="text.secondary">
                            {client.email} • {client.city}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Tabs */}
            <Paper sx={{ width: '100%' }}>
                <Tabs
                    value={currentTab}
                    onChange={handleTabChange}
                    indicatorColor="primary"
                    textColor="primary"
                    variant="scrollable"
                    scrollButtons="auto"
                >
                    <Tab icon={<InfoIcon />} iconPosition="start" label="Informations" />
                    <Tab icon={<PeopleIcon />} iconPosition="start" label="Contacts" />
                    <Tab icon={<TimelineIcon />} iconPosition="start" label="Interactions" />
                </Tabs>
            </Paper>

            {/* Tab Panels */}
            <TabPanel value={currentTab} index={0}>
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Box display="flex" justifyContent="space-between" mb={2}>
                        <Typography variant="h6">Détails du compte</Typography>
                        <Button startIcon={<EditIcon />} variant="outlined" size="small" onClick={handleEdit}>
                            Modifier (via liste)
                        </Button>
                    </Box>
                    <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(250px, 1fr))" gap={3}>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Nom du contact principal (Legacy)</Typography>
                            <Typography variant="body1">{client.name}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Entreprise</Typography>
                            <Typography variant="body1">{client.companyName || '-'}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Email</Typography>
                            <Typography variant="body1">{client.email}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Téléphone</Typography>
                            <Typography variant="body1">{client.phone || '-'}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Adresse</Typography>
                            <Typography variant="body1">{client.address || '-'}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary">Ville / Province</Typography>
                            <Typography variant="body1">{client.city || '-'}, {client.province}</Typography>
                        </Box>
                    </Box>
                    {client.notes && (
                        <Box mt={3}>
                            <Typography variant="caption" color="text.secondary">Notes</Typography>
                            <Paper variant="outlined" sx={{ p: 2, mt: 0.5, bgcolor: 'grey.50' }}>
                                <Typography variant="body2">{client.notes}</Typography>
                            </Paper>
                        </Box>
                    )}
                </Paper>
            </TabPanel>

            <TabPanel value={currentTab} index={1}>
                <ClientContactsTab clientId={client.id} />
            </TabPanel>

            <TabPanel value={currentTab} index={2}>
                <ClientInteractionsTab clientId={client.id} />
            </TabPanel>
        </Box>
    );
}
