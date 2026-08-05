import { useState } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Radio,
  RadioGroup,
  FormLabel,
  Slider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import { PREDEFINED_CERTIFICATIONS } from '@/constants/certifications';

const steps = [
  '📋 Informations personnelles',
  '🚗 Transport & Mobilité',
  '🎓 Certifications',
  '🕐 Disponibilités',
  '🗣️ Langues',
  '⭐ Évaluations',
  '💼 Expérience',
  '📝 Mise en situation',
  '💪 Forces & Faiblesses',
  '📄 Notes RH',
];

export interface InterviewFormData {
  // Personal Info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  interviewDate: string;

  // Transport
  hasVehicle: boolean;
  hasDriverLicense: boolean;
  driverLicenseClass: string;
  driverLicenseNumber: string;
  canTravelKm: number;

  // Certifications
  hasBSP: boolean;
  bspNumber: string;
  bspExpiryDate: string;
  bspStatus: string;
  certifications: Array<{
    name: string;
    expiryDate?: string;
  }>;

  // Availability — mêmes cases que le formulaire GHL « Renseignements étudiants ».
  // `available24_7` implique les 4 quarts (normalisé aussi côté serveur).
  available24_7: boolean;
  availableDay: boolean;
  availableEvening: boolean;
  availableNight: boolean;
  availableWeekend: boolean;
  canWorkUrgent: boolean;

  // Languages
  languages: Array<{ language: string; level: string }>;

  // Evaluations
  professionalismRating: number;
  communicationRating: number;
  appearanceRating: number;
  motivationRating: number;
  experienceRating: number;
  globalRating: number;

  // Experience
  experiences: Array<{
    companyName: string;
    position: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;

  // Situation tests (text fields)
  situationTest1: string;
  situationTest2: string;
  situationTest3: string;

  // Strengths & Weaknesses
  strengths: string;
  weaknesses: string;

  // HR Notes
  hrNotes: string;
}

interface Props {
  onSubmit: (data: InterviewFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  initialData?: Partial<InterviewFormData>;
  candidateId?: string;
}

export default function InterviewEvaluationForm({
  onSubmit,
  onCancel,
  isSubmitting,
  initialData,
  candidateId
}: Props) {
  const [activeStep, setActiveStep] = useState(0);

  const getInitialFormData = (): InterviewFormData => {
    const defaults: InterviewFormData = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      postalCode: '',
      interviewDate: new Date().toISOString().split('T')[0],
      hasVehicle: false,
      hasDriverLicense: false,
      driverLicenseClass: '',
      driverLicenseNumber: '',
      canTravelKm: 50,
      hasBSP: false,
      bspNumber: '',
      bspExpiryDate: '',
      bspStatus: 'NONE',
      certifications: [],
      available24_7: false,
      availableDay: false,
      availableEvening: false,
      availableNight: false,
      availableWeekend: false,
      canWorkUrgent: false,
      languages: [],
      professionalismRating: 7,
      communicationRating: 7,
      appearanceRating: 7,
      motivationRating: 7,
      experienceRating: 7,
      globalRating: 7,
      experiences: [],
      situationTest1: '',
      situationTest2: '',
      situationTest3: '',
      strengths: '',
      weaknesses: '',
      hrNotes: '',
    };

    return { ...defaults, ...initialData };
  };

  const [formData, setFormData] = useState<InterviewFormData>(getInitialFormData());

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const updateField = (field: keyof InterviewFormData, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const addLanguage = () => {
    setFormData({
      ...formData,
      languages: [...formData.languages, { language: '', level: 'INTERMEDIAIRE' }],
    });
  };

  const removeLanguage = (index: number) => {
    setFormData({
      ...formData,
      languages: formData.languages.filter((_, i) => i !== index),
    });
  };

  const updateLanguage = (index: number, field: 'language' | 'level', value: string) => {
    const updated = [...formData.languages];
    updated[index][field] = value;
    setFormData({ ...formData, languages: updated });
  };

  const addExperience = () => {
    setFormData({
      ...formData,
      experiences: [
        ...formData.experiences,
        { companyName: '', position: '', startDate: '', endDate: '', description: '' },
      ],
    });
  };

  const removeExperience = (index: number) => {
    setFormData({
      ...formData,
      experiences: formData.experiences.filter((_, i) => i !== index),
    });
  };

  const updateExperience = (index: number, field: string, value: string) => {
    const updated = [...formData.experiences];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, experiences: updated });
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0: // Personal Info
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                📋 Informations personnelles du candidat
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Prénom"
                fullWidth
                required
                value={formData.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nom de famille"
                fullWidth
                required
                value={formData.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Téléphone"
                fullWidth
                required
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Adresse complète"
                fullWidth
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                label="Ville"
                fullWidth
                required
                value={formData.city}
                onChange={(e) => updateField('city', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Code postal"
                fullWidth
                value={formData.postalCode}
                onChange={(e) => updateField('postalCode', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date de l'entrevue"
                type="date"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                value={formData.interviewDate}
                onChange={(e) => updateField('interviewDate', e.target.value)}
              />
            </Grid>
          </Grid>
        );

      case 1: // Transport
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                🚗 Transport et mobilité
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <FormLabel component="legend">Possède un véhicule?</FormLabel>
              <RadioGroup
                row
                value={formData.hasVehicle ? 'true' : 'false'}
                onChange={(e) => updateField('hasVehicle', e.target.value === 'true')}
              >
                <FormControlLabel value="true" control={<Radio />} label="Oui" />
                <FormControlLabel value="false" control={<Radio />} label="Non" />
              </RadioGroup>
            </Grid>
            <Grid item xs={12}>
              <FormLabel component="legend">Possède un permis de conduire?</FormLabel>
              <RadioGroup
                row
                value={formData.hasDriverLicense ? 'true' : 'false'}
                onChange={(e) => updateField('hasDriverLicense', e.target.value === 'true')}
              >
                <FormControlLabel value="true" control={<Radio />} label="Oui" />
                <FormControlLabel value="false" control={<Radio />} label="Non" />
              </RadioGroup>
            </Grid>
            {formData.hasDriverLicense && (
              <>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Classe de permis</InputLabel>
                    <Select
                      value={formData.driverLicenseClass}
                      label="Classe de permis"
                      onChange={(e) => updateField('driverLicenseClass', e.target.value)}
                    >
                      <MenuItem value="5">Classe 5 (Véhicule de promenade)</MenuItem>
                      <MenuItem value="4C">Classe 4C (Taxi / Ambulance)</MenuItem>
                      <MenuItem value="3">Classe 3 (Camion lourd)</MenuItem>
                      <MenuItem value="2">Classe 2 (Autobus)</MenuItem>
                      <MenuItem value="1">Classe 1 (Semi-remorque)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numéro de permis"
                    fullWidth
                    value={formData.driverLicenseNumber}
                    onChange={(e) => updateField('driverLicenseNumber', e.target.value)}
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12}>
              <Typography gutterBottom>
                Distance maximale de déplacement: {formData.canTravelKm} km
              </Typography>
              <Slider
                value={formData.canTravelKm}
                onChange={(_, value) => updateField('canTravelKm', value)}
                min={0}
                max={200}
                step={10}
                marks={[
                  { value: 0, label: '0 km' },
                  { value: 50, label: '50 km' },
                  { value: 100, label: '100 km' },
                  { value: 200, label: '200 km' },
                ]}
                valueLabelDisplay="auto"
              />
            </Grid>
          </Grid>
        );

      case 2: // Certifications
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                🎓 Certifications et qualifications
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <FormLabel component="legend">Possède une carte BSP (Bureau de la sécurité privée)?</FormLabel>
              <RadioGroup
                row
                value={formData.hasBSP ? 'true' : 'false'}
                onChange={(e) => updateField('hasBSP', e.target.value === 'true')}
              >
                <FormControlLabel value="true" control={<Radio />} label="Oui" />
                <FormControlLabel value="false" control={<Radio />} label="Non" />
              </RadioGroup>
            </Grid>
            {formData.hasBSP && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numéro de carte BSP"
                    fullWidth
                    value={formData.bspNumber}
                    onChange={(e) => updateField('bspNumber', e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Statut BSP</InputLabel>
                    <Select
                      value={formData.bspStatus}
                      label="Statut BSP"
                      onChange={(e) => updateField('bspStatus', e.target.value)}
                    >
                      <MenuItem value="Actif">Actif</MenuItem>
                      <MenuItem value="En cours">En cours de renouvellement</MenuItem>
                      <MenuItem value="Expiré">Expiré</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Date d'expiration BSP"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={formData.bspExpiryDate}
                    onChange={(e) => updateField('bspExpiryDate', e.target.value)}
                  />
                </Grid>
              </>
            )}

            {/* Other Certifications */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                📜 Autres certifications et formations
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Cochez les certifications/formations que possède le candidat
              </Typography>
            </Grid>

            {PREDEFINED_CERTIFICATIONS.map((certName) => {
              const isCertified = formData.certifications.some(c => c.name === certName);

              return (
                <Grid item xs={12} sm={6} md={4} key={certName}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={isCertified}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Add certification
                            updateField('certifications', [
                              ...formData.certifications,
                              { name: certName, expiryDate: '' }
                            ]);
                          } else {
                            // Remove certification
                            updateField('certifications',
                              formData.certifications.filter(c => c.name !== certName)
                            );
                          }
                        }}
                      />
                    }
                    label={certName}
                  />
                </Grid>
              );
            })}
          </Grid>
        );

      case 3: // Availability
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                🕐 Disponibilités
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Cochez toutes les périodes où le candidat est disponible
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.available24_7}
                    onChange={(e) => updateField('available24_7', e.target.checked)}
                  />
                }
                label="🕒 24/7 (toutes les périodes)"
              />
              <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                Coche automatiquement jour, soir, nuit et fin de semaine
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.available24_7 || formData.availableDay}
                    disabled={formData.available24_7}
                    onChange={(e) => updateField('availableDay', e.target.checked)}
                  />
                }
                label="☀️ Jour (6h - 18h)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.available24_7 || formData.availableEvening}
                    disabled={formData.available24_7}
                    onChange={(e) => updateField('availableEvening', e.target.checked)}
                  />
                }
                label="🌆 Soir (18h - 00h)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.available24_7 || formData.availableNight}
                    disabled={formData.available24_7}
                    onChange={(e) => updateField('availableNight', e.target.checked)}
                  />
                }
                label="🌙 Nuit (00h - 6h)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.available24_7 || formData.availableWeekend}
                    disabled={formData.available24_7}
                    onChange={(e) => updateField('availableWeekend', e.target.checked)}
                  />
                }
                label="📅 Fin de semaine"
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.canWorkUrgent}
                    onChange={(e) => updateField('canWorkUrgent', e.target.checked)}
                  />
                }
                label="🚨 Disponible pour urgence 24h"
              />
              <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                Peut commencer à travailler dans les 24 heures
              </Typography>
            </Grid>
          </Grid>
        );

      case 4: // Languages
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                🗣️ Langues parlées
              </Typography>
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={addLanguage}
                size="small"
              >
                Ajouter une langue
              </Button>
            </Grid>
            {formData.languages.map((lang, index) => (
              <Grid item xs={12} key={index}>
                <Paper sx={{ p: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={5}>
                      <FormControl fullWidth>
                        <InputLabel>Langue</InputLabel>
                        <Select
                          value={lang.language}
                          label="Langue"
                          onChange={(e) => updateLanguage(index, 'language', e.target.value)}
                        >
                          <MenuItem value="Français">Français</MenuItem>
                          <MenuItem value="Anglais">Anglais</MenuItem>
                          <MenuItem value="Espagnol">Espagnol</MenuItem>
                          <MenuItem value="Arabe">Arabe</MenuItem>
                          <MenuItem value="Créole">Créole</MenuItem>
                          <MenuItem value="Portugais">Portugais</MenuItem>
                          <MenuItem value="Mandarin">Mandarin</MenuItem>
                          <MenuItem value="Autre">Autre</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={5}>
                      <FormControl fullWidth>
                        <InputLabel>Niveau</InputLabel>
                        <Select
                          value={lang.level}
                          label="Niveau"
                          onChange={(e) => updateLanguage(index, 'level', e.target.value)}
                        >
                          <MenuItem value="DEBUTANT">Débutant</MenuItem>
                          <MenuItem value="INTERMEDIAIRE">Intermédiaire</MenuItem>
                          <MenuItem value="AVANCE">Avancé</MenuItem>
                          <MenuItem value="BILINGUE">Bilingue</MenuItem>
                          <MenuItem value="LANGUE_MATERNELLE">Langue maternelle</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={2}>
                      <IconButton color="error" onClick={() => removeLanguage(index)}>
                        <DeleteIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            ))}
            {formData.languages.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Aucune langue ajoutée. Cliquez sur "Ajouter une langue" pour commencer.
                </Typography>
              </Grid>
            )}
          </Grid>
        );

      case 5: // Evaluations
        return (
          <Grid container spacing={4}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                ⭐ Évaluations du candidat
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Évaluez chaque critère de 1 à 10 (1 = Très faible, 10 = Excellent)
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography gutterBottom>
                Professionnalisme: {formData.professionalismRating}/10
              </Typography>
              <Slider
                value={formData.professionalismRating}
                onChange={(_, value) => updateField('professionalismRating', value)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            <Grid item xs={12}>
              <Typography gutterBottom>
                Communication: {formData.communicationRating}/10
              </Typography>
              <Slider
                value={formData.communicationRating}
                onChange={(_, value) => updateField('communicationRating', value)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            <Grid item xs={12}>
              <Typography gutterBottom>
                Présentation / Apparence: {formData.appearanceRating}/10
              </Typography>
              <Slider
                value={formData.appearanceRating}
                onChange={(_, value) => updateField('appearanceRating', value)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            <Grid item xs={12}>
              <Typography gutterBottom>
                Motivation: {formData.motivationRating}/10
              </Typography>
              <Slider
                value={formData.motivationRating}
                onChange={(_, value) => updateField('motivationRating', value)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            <Grid item xs={12}>
              <Typography gutterBottom>
                Expérience pertinente: {formData.experienceRating}/10
              </Typography>
              <Slider
                value={formData.experienceRating}
                onChange={(_, value) => updateField('experienceRating', value)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography gutterBottom fontWeight="bold" color="primary">
                Note globale: {formData.globalRating}/10
              </Typography>
              <Slider
                value={formData.globalRating}
                onChange={(_, value) => updateField('globalRating', value)}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
                color="primary"
              />
            </Grid>
          </Grid>
        );

      case 6: // Experience
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                💼 Expériences professionnelles
              </Typography>
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={addExperience}
                size="small"
              >
                Ajouter une expérience
              </Button>
            </Grid>
            {formData.experiences.map((exp, index) => (
              <Grid item xs={12} key={index}>
                <Paper sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      Expérience #{index + 1}
                    </Typography>
                    <IconButton color="error" onClick={() => removeExperience(index)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Nom de l'entreprise"
                        fullWidth
                        value={exp.companyName}
                        onChange={(e) => updateExperience(index, 'companyName', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Poste occupé"
                        fullWidth
                        value={exp.position}
                        onChange={(e) => updateExperience(index, 'position', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Date de début"
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={exp.startDate}
                        onChange={(e) => updateExperience(index, 'startDate', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Date de fin"
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={exp.endDate}
                        onChange={(e) => updateExperience(index, 'endDate', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        label="Description des responsabilités"
                        multiline
                        rows={3}
                        fullWidth
                        value={exp.description}
                        onChange={(e) => updateExperience(index, 'description', e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            ))}
            {formData.experiences.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Aucune expérience ajoutée. Cliquez sur "Ajouter une expérience" pour commencer.
                </Typography>
              </Grid>
            )}
          </Grid>
        );

      case 7: // Situation Tests
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                📝 Mises en situation
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Notez les réponses du candidat aux scénarios proposés
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Situation 1: Comment réagiriez-vous face à un conflit avec un collègue?"
                multiline
                rows={4}
                fullWidth
                value={formData.situationTest1}
                onChange={(e) => updateField('situationTest1', e.target.value)}
                placeholder="Réponse du candidat..."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Situation 2: Comment géreriez-vous une situation d'urgence inattendue?"
                multiline
                rows={4}
                fullWidth
                value={formData.situationTest2}
                onChange={(e) => updateField('situationTest2', e.target.value)}
                placeholder="Réponse du candidat..."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Situation 3: Décrivez comment vous assureriez la sécurité d'un site"
                multiline
                rows={4}
                fullWidth
                value={formData.situationTest3}
                onChange={(e) => updateField('situationTest3', e.target.value)}
                placeholder="Réponse du candidat..."
              />
            </Grid>
          </Grid>
        );

      case 8: // Strengths & Weaknesses
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                💪 Forces et faiblesses du candidat
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Points forts"
                multiline
                rows={6}
                fullWidth
                value={formData.strengths}
                onChange={(e) => updateField('strengths', e.target.value)}
                placeholder="Ex: Excellente communication, ponctuel, expérience pertinente en sécurité..."
                helperText="Listez les principales qualités et compétences du candidat"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Points à améliorer / Faiblesses"
                multiline
                rows={6}
                fullWidth
                value={formData.weaknesses}
                onChange={(e) => updateField('weaknesses', e.target.value)}
                placeholder="Ex: Manque d'expérience spécifique, besoin de formation supplémentaire..."
                helperText="Identifiez les domaines où le candidat pourrait s'améliorer"
              />
            </Grid>
          </Grid>
        );

      case 9: // HR Notes
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom color="primary">
                📄 Notes de l'intervieweur RH
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Observations générales et recommandations"
                multiline
                rows={10}
                fullWidth
                value={formData.hrNotes}
                onChange={(e) => updateField('hrNotes', e.target.value)}
                placeholder="Inscrivez ici toutes vos observations sur le candidat, votre impression générale, recommandations pour l'embauche, points à vérifier, etc."
              />
            </Grid>
            <Grid item xs={12}>
              <Paper sx={{ p: 2, bgcolor: 'info.lighter' }}>
                <Typography variant="subtitle2" gutterBottom color="primary">
                  📊 Résumé de l'évaluation
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2">
                      <strong>Candidat:</strong> {formData.firstName} {formData.lastName}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">
                      <strong>Ville:</strong> {formData.city || 'Non spécifié'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">
                      <strong>Véhicule:</strong> {formData.hasVehicle ? '✓ Oui' : '✗ Non'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">
                      <strong>BSP:</strong> {formData.hasBSP ? '✓ Oui' : '✗ Non'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">
                      <strong>Note globale:</strong> {formData.globalRating}/10
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">
                      <strong>Langues:</strong> {formData.languages.length} langue(s)
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        );

      default:
        return null;
    }
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 0:
        return formData.firstName && formData.lastName && formData.phone && formData.city;
      default:
        return true; // Other steps are optional
    }
  };

  return (
    <Box>
      {candidateId && (
        <Typography variant="body2" color="primary" gutterBottom sx={{ mb: 2, textAlign: 'center' }}>
          Mode édition - Modification des informations du candidat
        </Typography>
      )}
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ minHeight: 400 }}>{renderStepContent(activeStep)}</Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button disabled={activeStep === 0} onClick={handleBack}>
          Retour
        </Button>
        <Box>
          <Button onClick={onCancel} sx={{ mr: 1 }}>
            Annuler
          </Button>
          {activeStep === steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!isStepValid(0) || isSubmitting}
              startIcon={<PersonAddIcon />}
            >
              {isSubmitting
                ? candidateId ? 'Mise à jour...' : 'Enregistrement...'
                : candidateId ? 'Mettre à jour le candidat' : 'Enregistrer le candidat'}
            </Button>
          ) : (
            <Button variant="contained" onClick={handleNext} disabled={!isStepValid(activeStep)}>
              Suivant
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
