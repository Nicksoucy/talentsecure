import {
  Card,
  CardContent,
  Grid,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Button,
  FormControlLabel,
  Switch,
  Box,
  Autocomplete,
  Collapse,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { PREDEFINED_CERTIFICATIONS } from '@/constants/certifications';

interface CandidateFiltersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: {
    status: string;
    minRating: string;
    city: string;
    hasVideo: string;
    interviewDateStart: string;
    interviewDateEnd: string;
    certification: string;
  };
  onFilterChange: (field: string, value: any) => void;
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  // Autocomplete props
  candidateSuggestions: Array<{ id: string; label: string; email: string }>;
  loadingCandidates: boolean;
  onFetchCandidateSuggestions: (query: string) => void;
  citySuggestions: string[];
  cityInput: string;
  onCityInputChange: (value: string) => void;
}

export default function CandidateFiltersBar({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  includeArchived,
  onIncludeArchivedChange,
  showFilters,
  onToggleFilters,
  candidateSuggestions,
  loadingCandidates,
  onFetchCandidateSuggestions,
  citySuggestions,
  cityInput,
  onCityInputChange,
  advancedFiltersComponent,
}: CandidateFiltersBarProps & { advancedFiltersComponent?: React.ReactNode }) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          {/* Search Bar */}
          <Grid item xs={12} md={6}>
            <Autocomplete
              fullWidth
              freeSolo
              options={candidateSuggestions}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
              value={search}
              onInputChange={(_, newValue) => {
                onSearchChange(newValue);
                if (newValue && newValue.length >= 2) {
                  onFetchCandidateSuggestions(newValue);
                }
              }}
              loading={loadingCandidates}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Rechercher un candidat"
                  placeholder="Nom, prénom, email, téléphone..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12} md={6} sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={includeArchived}
                  onChange={(e) => onIncludeArchivedChange(e.target.checked)}
                  color="warning"
                />
              }
              label="Voir archivés"
            />
            <Button
              variant={showFilters ? "contained" : "outlined"}
              startIcon={<FilterIcon />}
              onClick={onToggleFilters}
            >
              Filtres {advancedFiltersComponent ? "Avancés" : ""}
            </Button>
          </Grid>
        </Grid>

        {/* Filters Area */}
        <Collapse in={showFilters}>
          <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            {advancedFiltersComponent ? (
              advancedFiltersComponent
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Statut</InputLabel>
                    <Select
                      value={filters.status}
                      label="Statut"
                      onChange={(e) => onFilterChange('status', e.target.value)}
                    >
                      <MenuItem value="">Tous</MenuItem>
                      <MenuItem value="ELITE">Élite</MenuItem>
                      <MenuItem value="EXCELLENT">Excellent</MenuItem>
                      <MenuItem value="TRES_BON">Très bon</MenuItem>
                      <MenuItem value="BON">Bon</MenuItem>
                      <MenuItem value="QUALIFIE">Qualifié</MenuItem>
                      <MenuItem value="A_REVOIR">À revoir</MenuItem>
                      <MenuItem value="EN_ATTENTE">En attente</MenuItem>
                      <MenuItem value="ABSENT">Absent</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Note minimale</InputLabel>
                    <Select
                      value={filters.minRating}
                      label="Note minimale"
                      onChange={(e) => onFilterChange('minRating', e.target.value)}
                    >
                      <MenuItem value="">Toutes</MenuItem>
                      <MenuItem value="9.5">9.5+ (Élite)</MenuItem>
                      <MenuItem value="9">9+ (Excellent)</MenuItem>
                      <MenuItem value="8.5">8.5+ (Très bon)</MenuItem>
                      <MenuItem value="8">8+ (Bon)</MenuItem>
                      <MenuItem value="7">7+ (Qualifié)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Autocomplete
                    fullWidth
                    freeSolo
                    options={citySuggestions}
                    value={cityInput}
                    onInputChange={(_, newValue) => {
                      onCityInputChange(newValue);
                      onFilterChange('city', newValue);
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Ville"
                        placeholder="Ex: Montréal"
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Vidéo d'entretien</InputLabel>
                    <Select
                      value={filters.hasVideo}
                      label="Vidéo d'entretien"
                      onChange={(e) => onFilterChange('hasVideo', e.target.value)}
                    >
                      <MenuItem value="">Tous</MenuItem>
                      <MenuItem value="true">Avec vidéo</MenuItem>
                      <MenuItem value="false">Sans vidéo</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth>
                    <InputLabel>Certification / Formation</InputLabel>
                    <Select
                      value={filters.certification}
                      label="Certification / Formation"
                      onChange={(e) => onFilterChange('certification', e.target.value)}
                    >
                      <MenuItem value="">Toutes</MenuItem>
                      {PREDEFINED_CERTIFICATIONS.map((cert) => (
                        <MenuItem key={cert} value={cert}>
                          {cert}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Date d'entretien (début)"
                    InputLabelProps={{ shrink: true }}
                    value={filters.interviewDateStart}
                    onChange={(e) => onFilterChange('interviewDateStart', e.target.value)}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Date d'entretien (fin)"
                    InputLabelProps={{ shrink: true }}
                    value={filters.interviewDateEnd}
                    onChange={(e) => onFilterChange('interviewDateEnd', e.target.value)}
                  />
                </Grid>
              </Grid>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
