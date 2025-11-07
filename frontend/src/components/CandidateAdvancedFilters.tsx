import { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

export interface CandidateFilters {
  // Localisation
  city?: string;
  maxTravelKm?: number;

  // Évaluation
  minRating?: number;
  status?: string[];

  // Véhicule & Permis
  hasVehicle?: boolean;
  hasDriverLicense?: boolean;

  // Certifications
  hasBSP?: boolean;
  bspStatus?: string;

  // Disponibilités
  availableDay?: boolean;
  availableEvening?: boolean;
  availableNight?: boolean;
  availableWeekend?: boolean;
  canWorkUrgent?: boolean;

  // Langues
  languages?: string[];
  languageLevel?: string;

  // Autres
  hasCV?: boolean;
  hasVideo?: boolean;

  // Recherche texte
  search?: string;
}

interface CandidateAdvancedFiltersProps {
  onFiltersChange: (filters: CandidateFilters) => void;
  onSearch: () => void;
  resultCount?: number;
}

export default function CandidateAdvancedFilters({
  onFiltersChange,
  onSearch,
  resultCount,
}: CandidateAdvancedFiltersProps) {
  const [filters, setFilters] = useState<CandidateFilters>({
    minRating: 0, // Changed from 7 to 0 to show all candidates by default
    hasVehicle: false,
    hasDriverLicense: false,
    hasBSP: false,
    availableDay: false,
    availableEvening: false,
    availableNight: false,
    availableWeekend: false,
    hasCV: false,
    hasVideo: false,
    status: [],
    languages: [],
  });

  const handleFilterChange = (key: keyof CandidateFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleStatusToggle = (status: string) => {
    const currentStatuses = filters.status || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];
    handleFilterChange('status', newStatuses);
  };

  const handleLanguageToggle = (language: string) => {
    const currentLanguages = filters.languages || [];
    const newLanguages = currentLanguages.includes(language)
      ? currentLanguages.filter((l) => l !== language)
      : [...currentLanguages, language];
    handleFilterChange('languages', newLanguages);
  };

  const clearFilters = () => {
    const clearedFilters: CandidateFilters = {
      minRating: 0, // Changed from 7 to 0 to show all candidates
      hasVehicle: false,
      hasDriverLicense: false,
      hasBSP: false,
      availableDay: false,
      availableEvening: false,
      availableNight: false,
      availableWeekend: false,
      hasCV: false,
      hasVideo: false,
      status: [],
      languages: [],
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">
            🔍 Filtres de recherche avancés
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            {/* Recherche texte */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Recherche par nom, ville, etc."
                placeholder="Ex: Jean, Montréal, agent..."
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </Grid>

            {/* Localisation */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                📍 Localisation
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ville"
                placeholder="Ex: Montréal, Laval..."
                value={filters.city || ''}
                onChange={(e) => handleFilterChange('city', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Rayon de déplacement (km)"
                placeholder="Ex: 50"
                value={filters.maxTravelKm || ''}
                onChange={(e) => handleFilterChange('maxTravelKm', e.target.value)}
              />
            </Grid>

            {/* Évaluation */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                ⭐ Évaluation
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Note minimale</InputLabel>
                <Select
                  value={filters.minRating ?? 0}
                  label="Note minimale"
                  onChange={(e) => handleFilterChange('minRating', e.target.value)}
                >
                  <MenuItem value={0}>Toutes les notes (par défaut)</MenuItem>
                  <MenuItem value={5}>5/10 et plus</MenuItem>
                  <MenuItem value={6}>6/10 et plus</MenuItem>
                  <MenuItem value={7}>7/10 et plus</MenuItem>
                  <MenuItem value={8}>8/10 et plus</MenuItem>
                  <MenuItem value={9}>9/10 et plus</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Statut (cliquer pour sélectionner)
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {['ELITE', 'EXCELLENT', 'TRES_BON', 'BON', 'QUALIFIE'].map((status) => (
                    <Chip
                      key={status}
                      label={status.replace('_', ' ')}
                      onClick={() => handleStatusToggle(status)}
                      color={filters.status?.includes(status) ? 'primary' : 'default'}
                      variant={filters.status?.includes(status) ? 'filled' : 'outlined'}
                    />
                  ))}
                </Box>
              </Box>
            </Grid>

            {/* Véhicule & Permis */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                🚗 Transport
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.hasVehicle || false}
                    onChange={(e) => handleFilterChange('hasVehicle', e.target.checked)}
                  />
                }
                label="Possède un véhicule"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.hasDriverLicense || false}
                    onChange={(e) => handleFilterChange('hasDriverLicense', e.target.checked)}
                  />
                }
                label="Permis de conduire"
              />
            </Grid>

            {/* Certifications */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                🎓 Certifications
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.hasBSP || false}
                    onChange={(e) => handleFilterChange('hasBSP', e.target.checked)}
                  />
                }
                label="BSP actif"
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <FormControl fullWidth>
                <InputLabel>Statut BSP</InputLabel>
                <Select
                  value={filters.bspStatus || ''}
                  label="Statut BSP"
                  onChange={(e) => handleFilterChange('bspStatus', e.target.value)}
                >
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="Actif">Actif</MenuItem>
                  <MenuItem value="En cours">En cours</MenuItem>
                  <MenuItem value="Expiré">Expiré</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Disponibilités */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                🕐 Disponibilités
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.availableDay || false}
                    onChange={(e) => handleFilterChange('availableDay', e.target.checked)}
                  />
                }
                label="Jour"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.availableEvening || false}
                    onChange={(e) => handleFilterChange('availableEvening', e.target.checked)}
                  />
                }
                label="Soir"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.availableNight || false}
                    onChange={(e) => handleFilterChange('availableNight', e.target.checked)}
                  />
                }
                label="Nuit"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.availableWeekend || false}
                    onChange={(e) => handleFilterChange('availableWeekend', e.target.checked)}
                  />
                }
                label="Fin de semaine"
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.canWorkUrgent || false}
                    onChange={(e) => handleFilterChange('canWorkUrgent', e.target.checked)}
                  />
                }
                label="Urgence 24h"
              />
            </Grid>

            {/* Langues */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                🗣️ Langues
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Langues requises (cliquer pour sélectionner)
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {['Français', 'Anglais', 'Espagnol', 'Arabe', 'Créole'].map((language) => (
                    <Chip
                      key={language}
                      label={language}
                      onClick={() => handleLanguageToggle(language)}
                      color={filters.languages?.includes(language) ? 'primary' : 'default'}
                      variant={filters.languages?.includes(language) ? 'filled' : 'outlined'}
                    />
                  ))}
                </Box>
              </Box>
            </Grid>

            {/* Autres */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                📄 Documents
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.hasCV || false}
                    onChange={(e) => handleFilterChange('hasCV', e.target.checked)}
                  />
                }
                label="A un CV"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.hasVideo || false}
                    onChange={(e) => handleFilterChange('hasVideo', e.target.checked)}
                  />
                }
                label="A une vidéo"
              />
            </Grid>

            {/* Actions */}
            <Grid item xs={12}>
              <Box display="flex" gap={2} justifyContent="space-between" alignItems="center">
                <Box>
                  {resultCount !== undefined && (
                    <Typography variant="body2" color="text.secondary">
                      {resultCount} candidat{resultCount !== 1 ? 's' : ''} trouvé{resultCount !== 1 ? 's' : ''}
                    </Typography>
                  )}
                </Box>
                <Box display="flex" gap={2}>
                  <Button variant="outlined" onClick={clearFilters}>
                    Réinitialiser
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SearchIcon />}
                    onClick={onSearch}
                  >
                    Rechercher
                  </Button>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
