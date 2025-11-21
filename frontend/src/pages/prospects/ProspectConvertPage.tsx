import { Suspense, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Alert, CircularProgress, Button, Card, CardContent } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { prospectService } from '@/services/prospect.service';
import { candidateFormSchema } from '@/validation/candidate';
import { DetailPageSkeleton } from '@/components/skeletons';
import { lazy } from 'react';

const InterviewEvaluationForm = lazy(() => import('@/components/InterviewEvaluationForm'));

export default function ProspectConvertPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data, isLoading, error } = useQuery({
    queryKey: ['prospect', id, 'convert'],
    queryFn: () => prospectService.getProspectById(id!),
    enabled: !!id,
  });

  const convertMutation = useMutation({
    mutationFn: (payload: any) => prospectService.convertToCandidate(id!, payload),
    onSuccess: (response) => {
      enqueueSnackbar('Prospect converti en candidat avec succès', { variant: 'success' });
      navigate(`/candidates/${response.data.id}`);
    },
    onError: (err: any) => {
      enqueueSnackbar(err.response?.data?.error || 'Erreur lors de la conversion', { variant: 'error' });
    },
  });

  const prospect = data?.data;

  const initialFormData = useMemo(() => {
    if (!prospect) return undefined;
    return {
      firstName: prospect.firstName || '',
      lastName: prospect.lastName || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
      address: prospect.fullAddress || '',
      city: prospect.city || '',
      postalCode: prospect.postalCode || '',
    };
  }, [prospect]);

  const handleSubmit = (formValues: any) => {
    const validation = candidateFormSchema.safeParse(formValues);

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      enqueueSnackbar(firstIssue?.message || 'Formulaire invalide', { variant: 'error' });
      return;
    }

    const safeValues = validation.data;

    // Transform form data to match backend schema
    const candidateData = {
      ...safeValues,
      // Transform situationTests to use question/answer instead of scenario/response
      situationTests: [
        safeValues.situationTest1 && { question: 'Conflit avec un collegue', answer: safeValues.situationTest1 },
        safeValues.situationTest2 && { question: 'Situation d\'urgence inattendue', answer: safeValues.situationTest2 },
        safeValues.situationTest3 && { question: 'Assurer la securite d\'un site', answer: safeValues.situationTest3 },
      ].filter(Boolean),
    };

    // Remove individual situationTest fields as they're now in the array
    delete candidateData.situationTest1;
    delete candidateData.situationTest2;
    delete candidateData.situationTest3;

    convertMutation.mutate(candidateData);
  };

  if (isLoading) {
    return <DetailPageSkeleton sections={3} hasBackButton />;
  }

  if (error || !prospect) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Erreur lors du chargement du prospect</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/prospects/${id}`)} sx={{ mr: 2 }}>
          Retour
        </Button>
        <Typography variant="h4">Conversion du prospect</Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="body1">
            Complétez l'évaluation d'entretien avant de convertir {prospect.firstName} {prospect.lastName} en candidat officiel.
          </Typography>
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={320}>
            <CircularProgress />
          </Box>
        }
      >
        <InterviewEvaluationForm
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
          isSubmitting={convertMutation.isPending}
          initialData={initialFormData as Partial<any>}
        />
      </Suspense>
    </Box>
  );
}
