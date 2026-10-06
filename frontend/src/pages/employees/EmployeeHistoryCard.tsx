import { useQuery } from '@tanstack/react-query';
import { Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { employeeService } from '@/services/employee.service';

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Registre du dossier : désactivation, fermeture, retours d'uniformes — par qui. */
export default function EmployeeHistoryCard({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['employee-history', employeeId],
    queryFn: () => employeeService.getHistory(employeeId),
  });

  return (
    <Paper sx={{ p: 2, mt: 3 }} variant="outlined">
      <Typography variant="subtitle1" fontWeight="bold" mb={1}>
        Historique du dossier
      </Typography>
      {isLoading ? null : !data || data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Aucune action inscrite au registre pour ce dossier.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Par</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((h) => (
              <TableRow key={h.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(h.createdAt)}</TableCell>
                <TableCell>{h.details}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{h.by}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
