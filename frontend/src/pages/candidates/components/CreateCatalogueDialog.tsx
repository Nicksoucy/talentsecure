import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    Typography,
    Autocomplete,
    Checkbox,
    FormControlLabel,
    Box,
} from '@mui/material';
import { HelpDialog } from '@/components/HelpDialog';

export interface CatalogueFormData {
    title: string;
    customMessage: string;
    includeSummary: boolean;
    includeDetails: boolean;
    includeVideo: boolean;
    includeExperience: boolean;
    includeSituation: boolean;
    includeCV: boolean;
}

interface CreateCatalogueDialogProps {
    open: boolean;
    onClose: () => void;
    selectedCandidatesCount: number;
    clients: any[];
    onSubmit: (clientId: string, formData: CatalogueFormData) => void;
    isSubmitting: boolean;
}

const CATALOGUE_HELP_SECTIONS = [
    {
        title: 'Avant de generer',
        bullets: [
            'Selectionnez au moins un candidat et choisissez le client cible.',
            'Personnalisez le message pour contextualiser l\'envoi.',
            'Desactivez les sections inutiles (video, experience, CV) pour alleger le document.',
        ],
    },
];

export default function CreateCatalogueDialog({
    open,
    onClose,
    selectedCandidatesCount,
    clients,
    onSubmit,
    isSubmitting,
}: CreateCatalogueDialogProps) {
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [catalogueForm, setCatalogueForm] = useState<CatalogueFormData>({
        title: '',
        customMessage: '',
        includeSummary: true,
        includeDetails: true,
        includeVideo: true,
        includeExperience: true,
        includeSituation: true,
        includeCV: true,
    });

    const handleSubmit = () => {
        if (!catalogueForm.title || !selectedClient) {
            return;
        }
        onSubmit(selectedClient.id, catalogueForm);
    };

    const handleClose = () => {
        // Reset form on close
        setSelectedClient(null);
        setCatalogueForm({
            title: '',
            customMessage: '',
            includeSummary: true,
            includeDetails: true,
            includeVideo: true,
            includeExperience: true,
            includeSituation: true,
            includeCV: true,
        });
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="h6">
                        Créer un catalogue avec {selectedCandidatesCount} candidat{selectedCandidatesCount !== 1 ? 's' : ''}
                    </Typography>
                    <HelpDialog
                        title="Guide catalogue"
                        subtitle="Conseils avant partage client"
                        sections={CATALOGUE_HELP_SECTIONS}
                        triggerLabel="Astuces catalogue"
                    />
                </Box>
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Titre du catalogue"
                            required
                            value={catalogueForm.title}
                            onChange={(e) => setCatalogueForm({ ...catalogueForm, title: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Autocomplete
                            value={selectedClient}
                            onChange={(_, newValue) => setSelectedClient(newValue)}
                            options={clients || []}
                            getOptionLabel={(option) =>
                                option.companyName
                                    ? `${option.companyName} - ${option.name}`
                                    : option.name
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Sélectionner un client"
                                    required
                                />
                            )}
                            isOptionEqualToValue={(option, value) => option.id === value?.id}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Message personnalisé (optionnel)"
                            multiline
                            rows={3}
                            value={catalogueForm.customMessage}
                            onChange={(e) => setCatalogueForm({ ...catalogueForm, customMessage: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>
                            Options d'inclusion
                        </Typography>
                        <Grid container spacing={1}>
                            <Grid item xs={6}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={catalogueForm.includeSummary}
                                            onChange={(e) => setCatalogueForm({ ...catalogueForm, includeSummary: e.target.checked })}
                                        />
                                    }
                                    label="Résumé"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={catalogueForm.includeDetails}
                                            onChange={(e) => setCatalogueForm({ ...catalogueForm, includeDetails: e.target.checked })}
                                        />
                                    }
                                    label="Détails"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={catalogueForm.includeVideo}
                                            onChange={(e) => setCatalogueForm({ ...catalogueForm, includeVideo: e.target.checked })}
                                        />
                                    }
                                    label="Vidéo"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={catalogueForm.includeExperience}
                                            onChange={(e) => setCatalogueForm({ ...catalogueForm, includeExperience: e.target.checked })}
                                        />
                                    }
                                    label="Expérience"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={catalogueForm.includeSituation}
                                            onChange={(e) => setCatalogueForm({ ...catalogueForm, includeSituation: e.target.checked })}
                                        />
                                    }
                                    label="Situation"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={catalogueForm.includeCV}
                                            onChange={(e) => setCatalogueForm({ ...catalogueForm, includeCV: e.target.checked })}
                                        />
                                    }
                                    label="CV"
                                />
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>
                    Annuler
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={isSubmitting || !catalogueForm.title || !selectedClient}
                >
                    {isSubmitting ? 'Création...' : 'Créer le catalogue'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
