import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Grid,
    CircularProgress,
    Alert,
    Chip,
    FormGroup,
    FormControlLabel,
    Checkbox,
    Badge,
    IconButton,
    Tabs,
    Tab,
    TextField,
    Stack,
    Paper,
    Divider,
} from '@mui/material';
import {
    Close as CloseIcon,
    ShoppingCart as CartIcon,
    LocationOn as LocationIcon,
    Add as AddIcon,
    Remove as RemoveIcon,
    AttachMoney as MoneyIcon,
    Notes as NotesIcon,
    Person as PersonIcon,
    Description as DescriptionIcon,
} from '@mui/icons-material';
import { talentMarketplaceService } from '@/services/talent-marketplace.service';
import { useWishlistStore } from '@/store/wishlistStore';
import { useClientAuthStore } from '@/store/clientAuthStore';
import { useSnackbar } from 'notistack';
import TalentCard from '@/pages/client/components/TalentCard';
import CVListItem from '@/pages/client/components/CVListItem';

interface CityTalentsModalProps {
    open: boolean;
    onClose: () => void;
    city: string;
    province?: string;
    mode: 'evaluated' | 'cvonly';
}

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
            id={`tabpanel-${index}`}
            aria-labelledby={`tab-${index}`}
            {...other}
        >
            {value === index && <Box>{children}</Box>}
        </div>
    );
}

export default function CityTalentsModal({ open, onClose, city, province = 'QC', mode }: CityTalentsModalProps) {
    const { accessToken } = useClientAuthStore();
    const { addItem, getCityPricing, getAvailableCount } = useWishlistStore();
    const { enqueueSnackbar } = useSnackbar();

    const [currentTab, setCurrentTab] = useState(0);
    const [selectedTalents, setSelectedTalents] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState({
        minRating: 7,
        hasVehicle: false,
        available24_7: false,
        availableDays: false,
        availableNights: false,
        availableWeekends: false,
    });

    // Bulk request state
    const [bulkQuantity, setBulkQuantity] = useState(0);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [pricingData, setPricingData] = useState<any>(null);
    const [availabilityData, setAvailabilityData] = useState<any>(null);

    // Load pricing and availability for bulk tab
    const { isLoading: loadingPricing } = useQuery({
        queryKey: ['city-pricing', city],
        queryFn: async () => {
            const [pricing, availability] = await Promise.all([
                getCityPricing(accessToken!, city),
                getAvailableCount(accessToken!, city),
            ]);
            setPricingData(pricing);
            setAvailabilityData(availability);
            return { pricing, availability };
        },
        enabled: open && !!accessToken && currentTab === 0,
    });

    // Load talents for manual selection tab
    const {
        data: talentsData,
        isLoading: loadingTalents,
        error,
    } = useQuery({
        queryKey: ['city-talents', city, filters, mode],
        queryFn: () =>
            talentMarketplaceService.searchByCity({
                city,
                mode, // Pass mode to get correct data
                ...filters,
            }),
        enabled: open && !!city && currentTab === 1,
    });

    const handleToggleSelect = (id: string) => {
        setSelectedTalents((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleBulkRequest = async () => {
        if (bulkQuantity === 0) {
            enqueueSnackbar('Veuillez sélectionner au moins un candidat', { variant: 'warning' });
            return;
        }

        setSubmitting(true);
        try {
            await addItem(accessToken!, {
                city,
                province,
                type: mode === 'evaluated' ? 'EVALUATED' : 'CV_ONLY',
                quantity: Number(bulkQuantity),
                notes,
            });

            enqueueSnackbar('Ajouté au panier avec succès!', { variant: 'success' });
            handleClose();
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Erreur lors de l\'ajout au panier';
            enqueueSnackbar(errorMsg, { variant: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleManualSelection = () => {
        // TODO: Integrate with wishlist/cart for individual selection
        alert(`${selectedTalents.size} candidat(s) sélectionné(s) manuellement`);
        handleClose();
    };

    const handleClose = () => {
        setBulkQuantity(0);
        setSelectedTalents(new Set());
        setNotes('');
        setCurrentTab(0);
        onClose();
    };

    const quickAdd = (amount: number) => {
        const maxAvailable = mode === 'evaluated' ? availabilityData?.evaluated : availabilityData?.cvOnly;
        const newValue = Math.max(0, Math.min(maxAvailable || 0, bulkQuantity + amount));
        setBulkQuantity(newValue);
    };

    const calculateBulkTotal = () => {
        if (!pricingData) return 0;
        const price = mode === 'evaluated' ? Number(pricingData.evaluatedCandidatePrice) : Number(pricingData.cvOnlyPrice);
        return bulkQuantity * price;
    };

    const talents = talentsData?.data || [];
    const maxAvailable = mode === 'evaluated' ? availabilityData?.evaluated : availabilityData?.cvOnly;
    const pricePerUnit = mode === 'evaluated' ? pricingData?.evaluatedCandidatePrice : pricingData?.cvOnlyPrice;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: { height: '90vh' },
            }}
        >
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <LocationIcon color="primary" />
                        <Typography variant="h6" fontWeight="bold">
                            {city}, {province}
                        </Typography>
                        <Chip
                            label={mode === 'evaluated' ? 'Candidats Évalués' : 'CVs Seulement'}
                            color={mode === 'evaluated' ? 'primary' : 'warning'}
                            size="small"
                        />
                    </Box>
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>

            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)}>
                    <Tab label="Demande Rapide" />
                    <Tab label="Sélection Manuelle" />
                </Tabs>
            </Box>

            <DialogContent dividers>
                {/* Tab 1: Bulk Request */}
                <TabPanel value={currentTab} index={0}>
                    {loadingPricing ? (
                        <Box display="flex" justifyContent="center" py={4}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Stack spacing={3}>
                            {/* Pricing Info */}
                            <Paper elevation={0} sx={{ p: 2, bgcolor: 'info.50', border: '1px solid', borderColor: 'info.200' }}>
                                <Box display="flex" alignItems="center" gap={1} mb={1}>
                                    <MoneyIcon color="info" fontSize="small" />
                                    <Typography variant="subtitle2" fontWeight="bold">
                                        Tarification pour {city}
                                    </Typography>
                                </Box>
                                <Typography variant="h6" color={mode === 'evaluated' ? 'primary' : 'warning.main'} fontWeight="bold">
                                    {Number(pricePerUnit || 0).toFixed(2)}$ par {mode === 'evaluated' ? 'candidat' : 'CV'}
                                </Typography>
                            </Paper>

                            {/* Quantity Selection */}
                            <Box sx={{ p: 2, bgcolor: mode === 'evaluated' ? 'primary.50' : 'warning.50', borderRadius: 2 }}>
                                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        {mode === 'evaluated' ? <PersonIcon color="primary" /> : <DescriptionIcon color="warning" />}
                                        <Typography variant="subtitle2" fontWeight="bold">
                                            {mode === 'evaluated' ? 'Candidats Évalués (Premium)' : 'CVs Seulement (Économique)'}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label={`${maxAvailable || 0} disponibles`}
                                        size="small"
                                        color={mode === 'evaluated' ? 'primary' : 'warning'}
                                        variant="outlined"
                                    />
                                </Box>

                                {/* Quick add buttons */}
                                <Box display="flex" alignItems="center" gap={1} mb={2}>
                                    <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 80 }}>
                                        Ajouter:
                                    </Typography>
                                    <Button size="small" variant="outlined" onClick={() => quickAdd(1)} disabled={bulkQuantity >= (maxAvailable || 0)}>
                                        +1
                                    </Button>
                                    <Button size="small" variant="outlined" onClick={() => quickAdd(5)} disabled={bulkQuantity + 5 > (maxAvailable || 0)}>
                                        +5
                                    </Button>
                                    <Button size="small" variant="outlined" onClick={() => quickAdd(10)} disabled={bulkQuantity + 10 > (maxAvailable || 0)}>
                                        +10
                                    </Button>
                                    <Button size="small" variant="text" color="error" onClick={() => setBulkQuantity(0)} disabled={bulkQuantity === 0}>
                                        Réinitialiser
                                    </Button>
                                </Box>

                                {/* Quantity control */}
                                <Box display="flex" alignItems="center" gap={1}>
                                    <IconButton size="small" onClick={() => quickAdd(-1)} disabled={bulkQuantity === 0} sx={{ bgcolor: 'background.paper' }}>
                                        <RemoveIcon fontSize="small" />
                                    </IconButton>
                                    <TextField
                                        type="number"
                                        value={bulkQuantity}
                                        onChange={(e) => setBulkQuantity(Math.max(0, Math.min(maxAvailable || 0, parseInt(e.target.value) || 0)))}
                                        size="small"
                                        sx={{ width: 100 }}
                                        inputProps={{ min: 0, max: maxAvailable, style: { textAlign: 'center' } }}
                                    />
                                    <IconButton size="small" onClick={() => quickAdd(1)} disabled={bulkQuantity >= (maxAvailable || 0)} sx={{ bgcolor: 'background.paper' }}>
                                        <AddIcon fontSize="small" />
                                    </IconButton>
                                    {bulkQuantity > 0 && (
                                        <Typography variant="body2" fontWeight="bold" color={mode === 'evaluated' ? 'primary' : 'warning.main'} ml={1}>
                                            = {calculateBulkTotal().toFixed(2)}$
                                        </Typography>
                                    )}
                                </Box>
                            </Box>

                            {/* Notes */}
                            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                                <Box display="flex" alignItems="center" gap={1} mb={1}>
                                    <NotesIcon fontSize="small" color="action" />
                                    <Typography variant="subtitle2" fontWeight="bold">
                                        Notes / Demandes spéciales
                                    </Typography>
                                </Box>
                                <TextField
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    fullWidth
                                    multiline
                                    rows={3}
                                    size="small"
                                    placeholder="Ex: Recherche agents pour événement sportif le 15 juin, préférence bilingues..."
                                    variant="outlined"
                                />
                            </Box>

                            {/* Total */}
                            {bulkQuantity > 0 && (
                                <Paper elevation={3} sx={{ p: 2, bgcolor: 'success.50', border: '2px solid', borderColor: 'success.main' }}>
                                    <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                        RÉSUMÉ DE VOTRE DEMANDE
                                    </Typography>
                                    <Divider sx={{ mb: 1.5 }} />
                                    <Box display="flex" justifyContent="space-between" alignItems="center">
                                        <Typography variant="h6" fontWeight="bold">
                                            Total estimé
                                        </Typography>
                                        <Typography variant="h5" fontWeight="bold" color="success.main">
                                            {calculateBulkTotal().toFixed(2)}$
                                        </Typography>
                                    </Box>
                                </Paper>
                            )}
                        </Stack>
                    )}
                </TabPanel>

                {/* Tab 2: Manual Selection */}
                <TabPanel value={currentTab} index={1}>
                    {/* Filters */}
                    <Box mb={3} p={2} bgcolor="grey.50" borderRadius={1}>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Filtres
                        </Typography>
                        <FormGroup row>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.hasVehicle}
                                        onChange={(e) => setFilters({ ...filters, hasVehicle: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label="Véhicule"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.available24_7}
                                        onChange={(e) => setFilters({ ...filters, available24_7: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label="Dispo 24/7"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.availableDays}
                                        onChange={(e) => setFilters({ ...filters, availableDays: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label="Jour"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.availableNights}
                                        onChange={(e) => setFilters({ ...filters, availableNights: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label="Nuit"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={filters.availableWeekends}
                                        onChange={(e) => setFilters({ ...filters, availableWeekends: e.target.checked })}
                                        size="small"
                                    />
                                }
                                label="Weekend"
                            />
                        </FormGroup>
                    </Box>

                    {/* Loading State */}
                    {loadingTalents && (
                        <Box display="flex" justifyContent="center" py={4}>
                            <CircularProgress />
                        </Box>
                    )}

                    {/* Error State */}
                    {error && (
                        <Alert severity="error">
                            Erreur lors du chargement des candidats
                        </Alert>
                    )}

                    {/* Empty State */}
                    {!loadingTalents && talents.length === 0 && (
                        <Alert severity="info">
                            Aucun candidat disponible pour cette ville avec ces filtres
                        </Alert>
                    )}

                    {/* Talents Display - Cards for Evaluated, List for CV-Only */}
                    {!loadingTalents && talents.length > 0 && (
                        <>
                            <Typography variant="body2" color="text.secondary" mb={2}>
                                {talents.length} candidat(s) disponible(s) • {selectedTalents.size} sélectionné(s)
                            </Typography>

                            {mode === 'evaluated' ? (
                                // Cards for Evaluated Candidates
                                <Grid container spacing={2}>
                                    {talents.map((talent) => (
                                        <Grid item xs={12} sm={6} md={4} key={talent.id}>
                                            <TalentCard
                                                talent={talent}
                                                selected={selectedTalents.has(talent.id)}
                                                onToggleSelect={handleToggleSelect}
                                            />
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                // Simple List for CV-Only
                                <Stack spacing={1.5}>
                                    {talents.map((talent) => (
                                        <CVListItem
                                            key={talent.id}
                                            talent={talent}
                                            selected={selectedTalents.has(talent.id)}
                                            onToggleSelect={handleToggleSelect}
                                        />
                                    ))}
                                </Stack>
                            )}
                        </>
                    )}
                </TabPanel>
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Box display="flex" justifyContent="space-between" width="100%">
                    {currentTab === 0 ? (
                        <Chip
                            label={bulkQuantity > 0 ? `${bulkQuantity} candidat(s)` : 'Aucune sélection'}
                            color={bulkQuantity > 0 ? 'primary' : 'default'}
                        />
                    ) : (
                        <Chip
                            label={`${selectedTalents.size} sélectionné(s)`}
                            color={selectedTalents.size > 0 ? 'primary' : 'default'}
                        />
                    )}
                    <Box display="flex" gap={1}>
                        <Button onClick={handleClose}>Fermer</Button>
                        {currentTab === 0 ? (
                            <Button
                                variant="contained"
                                startIcon={submitting ? <CircularProgress size={20} /> : <AddIcon />}
                                onClick={handleBulkRequest}
                                disabled={submitting || bulkQuantity === 0}
                            >
                                {submitting ? 'Ajout...' : `Ajouter au panier (${calculateBulkTotal().toFixed(2)}$)`}
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                startIcon={
                                    <Badge badgeContent={selectedTalents.size} color="error">
                                        <CartIcon />
                                    </Badge>
                                }
                                onClick={handleManualSelection}
                                disabled={selectedTalents.size === 0}
                            >
                                Ajouter au panier ({selectedTalents.size})
                            </Button>
                        )}
                    </Box>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
