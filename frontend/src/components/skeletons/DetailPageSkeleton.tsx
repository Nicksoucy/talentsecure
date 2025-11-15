import { Box, Card, CardContent, Grid, Skeleton } from '@mui/material';

interface DetailPageSkeletonProps {
  hasBackButton?: boolean;
  sections?: number;
}

/**
 * Unified detail page loading skeleton
 * Used in: Candidate Detail, Prospect Detail, Client Detail
 */
export const DetailPageSkeleton = ({
  hasBackButton = true,
  sections = 4,
}: DetailPageSkeletonProps) => {
  return (
    <Box>
      {/* Back button */}
      {hasBackButton && (
        <Box mb={3}>
          <Skeleton variant="rectangular" width={150} height={36} sx={{ borderRadius: 1 }} />
        </Box>
      )}

      {/* Header with name and actions */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box flex={1}>
          <Skeleton variant="text" width="40%" height={48} />
          <Skeleton variant="text" width="30%" height={24} />
        </Box>
        <Box display="flex" gap={1}>
          <Skeleton variant="rectangular" width={100} height={36} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" width={120} height={36} sx={{ borderRadius: 1 }} />
        </Box>
      </Box>

      {/* Main content sections */}
      <Grid container spacing={3}>
        {Array.from({ length: sections }).map((_, sectionIndex) => (
          <Grid item xs={12} md={sectionIndex === 0 ? 12 : 6} key={sectionIndex}>
            <Card>
              <CardContent>
                {/* Section title */}
                <Skeleton variant="text" width="30%" height={32} sx={{ mb: 2 }} />

                {/* Section content - multiple fields */}
                <Grid container spacing={2}>
                  {Array.from({ length: sectionIndex === 0 ? 6 : 4 }).map((_, fieldIndex) => (
                    <Grid item xs={12} sm={6} key={fieldIndex}>
                      <Skeleton variant="text" width="40%" height={20} sx={{ mb: 0.5 }} />
                      <Skeleton variant="text" width="80%" height={24} />
                    </Grid>
                  ))}
                </Grid>

                {/* Additional content for first section (overview) */}
                {sectionIndex === 0 && (
                  <Box mt={3}>
                    <Skeleton variant="text" width="30%" height={24} sx={{ mb: 1 }} />
                    <Skeleton variant="rectangular" width="100%" height={100} sx={{ borderRadius: 1 }} />
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}

        {/* List section (e.g., certifications, languages) */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Skeleton variant="text" width="30%" height={32} sx={{ mb: 2 }} />
              {Array.from({ length: 3 }).map((_, index) => (
                <Box key={index} display="flex" alignItems="center" mb={1.5}>
                  <Skeleton variant="circular" width={24} height={24} sx={{ mr: 1 }} />
                  <Skeleton variant="text" width="60%" />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Timeline/Activity section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Skeleton variant="text" width="30%" height={32} sx={{ mb: 2 }} />
              {Array.from({ length: 4 }).map((_, index) => (
                <Box key={index} display="flex" gap={2} mb={2}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box flex={1}>
                    <Skeleton variant="text" width="70%" />
                    <Skeleton variant="text" width="50%" height={20} />
                  </Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
