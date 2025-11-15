import { Box, Card, CardContent, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  hasHeader?: boolean;
  hasFilters?: boolean;
  hasActions?: boolean;
}

/**
 * Unified table loading skeleton for list pages
 * Used in: Candidates, Prospects, Clients, Catalogues
 */
export const TableSkeleton = ({
  rows = 10,
  columns = 6,
  hasHeader = true,
  hasFilters = true,
  hasActions = true,
}: TableSkeletonProps) => {
  return (
    <Box>
      {/* Header with title and action button */}
      {hasHeader && (
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Skeleton variant="text" width={200} height={40} />
          <Skeleton variant="rectangular" width={150} height={36} sx={{ borderRadius: 1 }} />
        </Box>
      )}

      {/* Search and filters card */}
      {hasFilters && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box display="flex" gap={2} flexWrap="wrap">
              <Skeleton variant="rectangular" width="100%" height={56} sx={{ borderRadius: 1, maxWidth: 400 }} />
              <Skeleton variant="rectangular" width={150} height={56} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" width={150} height={56} sx={{ borderRadius: 1 }} />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Table card */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0}>
            <Table>
              {/* Table header */}
              <TableHead>
                <TableRow>
                  {Array.from({ length: columns }).map((_, index) => (
                    <TableCell key={index}>
                      <Skeleton variant="text" width="80%" />
                    </TableCell>
                  ))}
                  {hasActions && (
                    <TableCell>
                      <Skeleton variant="text" width="60%" />
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>

              {/* Table body */}
              <TableBody>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: columns }).map((_, colIndex) => (
                      <TableCell key={colIndex}>
                        {colIndex === 0 ? (
                          // First column - name/title (wider)
                          <Skeleton variant="text" width="90%" />
                        ) : colIndex === 1 ? (
                          // Second column - status/badge
                          <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 3 }} />
                        ) : (
                          // Other columns
                          <Skeleton variant="text" width="70%" />
                        )}
                      </TableCell>
                    ))}
                    {hasActions && (
                      <TableCell>
                        <Box display="flex" gap={1}>
                          <Skeleton variant="circular" width={32} height={32} />
                          <Skeleton variant="circular" width={32} height={32} />
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          <Box display="flex" justifyContent="center" py={2}>
            <Skeleton variant="rectangular" width={300} height={32} sx={{ borderRadius: 2 }} />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
