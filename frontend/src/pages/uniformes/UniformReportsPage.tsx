import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, Chip, Stack, Link, Button,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { usePerms } from '@/hooks/usePerms';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-CA') : '—');

export default function UniformReportsPage() {
  const [tab, setTab] = useState(0);
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { canWriteUniforms } = usePerms();
  const stock = useQuery({ queryKey: ['rep-stock'], queryFn: () => uniformService.reportStock(), enabled: tab === 0 });
  const overdue = useQuery({ queryKey: ['rep-overdue'], queryFn: () => uniformService.reportOverdue(), enabled: tab === 1 });
  const losses = useQuery({ queryKey: ['rep-losses'], queryFn: () => uniformService.reportLosses(), enabled: tab === 2 });
  const inactive = useQuery({ queryKey: ['rep-inactive-holdings'], queryFn: () => uniformService.reportInactiveHoldings(), enabled: tab === 3 });

  const closeMut = useMutation({
    // allSettled : une remise en échec ne doit pas laisser les autres non clôturées.
    mutationFn: async (issuanceIds: string[]) => {
      const results = await Promise.allSettled(issuanceIds.map((iid) => uniformService.closeTermination(iid)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === issuanceIds.length) throw new Error('all-failed');
      return { failed, total: issuanceIds.length };
    },
    onSuccess: ({ failed, total }) => {
      qc.invalidateQueries({ queryKey: ['rep-inactive-holdings'] });
      enqueueSnackbar(
        failed > 0 ? `${total - failed}/${total} remise(s) clôturée(s) — ${failed} en échec` : 'Fin d’emploi clôturée — dette figée',
        { variant: failed > 0 ? 'warning' : 'success' },
      );
    },
    onError: () => enqueueSnackbar('Erreur lors de la clôture', { variant: 'error' }),
  });

  return (
    <Box>
      <Typography variant="h5" mb={2}>Rapports — Uniformes</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
        <Tab label="Stock" />
        <Tab label="Retours en retard" />
        <Tab label="Pertes / dommages" />
        <Tab label="Anciens employés" />
      </Tabs>

      {tab === 0 && (
        <>
          {stock.data?.data.totals && (
            <Stack direction="row" spacing={2} mb={2}>
              <Chip label={`Unités : ${stock.data.data.totals.totalUnits}`} />
              <Chip color="primary" label={`Valeur : ${money(stock.data.data.totals.totalValue)}`} />
            </Stack>
          )}
          <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Morceau</TableCell><TableCell>Division</TableCell><TableCell>Grandeur</TableCell><TableCell>Emplacement</TableCell><TableCell align="right">Stock</TableCell><TableCell align="right">Valeur</TableCell></TableRow></TableHead>
            <TableBody>
              {(stock.data?.data.rows || []).map((r: any) => (
                <TableRow key={r.variantId} sx={r.lowStock ? { bgcolor: '#fff4e5' } : undefined}>
                  <TableCell>{r.itemName}</TableCell>
                  <TableCell>{r.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                  <TableCell>{r.size}</TableCell>
                  <TableCell>{r.emplacement || '—'}</TableCell>
                  <TableCell align="right">{r.quantityOnHand}{r.lowStock && <Chip size="small" color="warning" label="bas" sx={{ ml: 1 }} />}</TableCell>
                  <TableCell align="right">{money(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </Box>
        </>
      )}

      {tab === 1 && (
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Agent</TableCell><TableCell>Division</TableCell><TableCell>Retour prévu</TableCell><TableCell align="right">Pièces</TableCell><TableCell align="right">Coût</TableCell></TableRow></TableHead>
          <TableBody>
            {(overdue.data?.data || []).map((r: any) => (
              <TableRow key={r.issuanceId}>
                <TableCell><Link component={RouterLink} to={`/employees/${r.employeeId}`}>{r.employeeName}</Link></TableCell>
                <TableCell>{r.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                <TableCell>{r.dueReturnAt ? new Date(r.dueReturnAt).toLocaleDateString('fr-CA') : '—'}</TableCell>
                <TableCell align="right">{r.itemsCount}</TableCell>
                <TableCell align="right">{money(r.totalLoanCost)}</TableCell>
              </TableRow>
            ))}
            {overdue.data?.data?.length === 0 && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Aucun retour en retard.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
        </Box>
      )}

      {tab === 2 && (
        <>
          {losses.data?.data.totals && (
            <Stack direction="row" spacing={2} mb={2}>
              <Chip label={`Unités perdues/endommagées : ${losses.data.data.totals.totalUnits}`} />
              <Chip color="error" label={`Coût total : ${money(losses.data.data.totals.totalCost)}`} />
            </Stack>
          )}
          <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Agent</TableCell><TableCell align="right">Unités</TableCell><TableCell align="right">Coût</TableCell></TableRow></TableHead>
            <TableBody>
              {(losses.data?.data.rows || []).map((r: any) => (
                <TableRow key={r.employeeId}>
                  <TableCell><Link component={RouterLink} to={`/employees/${r.employeeId}`}>{r.employeeName}</Link></TableCell>
                  <TableCell align="right">{r.units}</TableCell>
                  <TableCell align="right">{money(r.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </Box>
        </>
      )}

      {tab === 3 && (
        <>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Anciens employés (inactifs) qui détiennent encore des uniformes. Clôturer
            la fin d’emploi marque les pièces non retournées et fige la dette à prélever.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Agent</TableCell>
              <TableCell align="right">Pièces</TableCell>
              <TableCell>Échéance retour</TableCell>
              <TableCell align="right">Montant à risque/dû</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {(inactive.data?.data || []).map((r) => {
                const overdueDeadline = r.employee.uniformReturnDeadlineAt
                  ? new Date(r.employee.uniformReturnDeadlineAt) < new Date()
                  : false;
                return (
                  <TableRow key={r.employee.id}>
                    <TableCell>
                      <Link component={RouterLink} to={`/employees/${r.employee.id}`}>
                        {r.employee.firstName} {r.employee.lastName}
                      </Link>
                    </TableCell>
                    <TableCell align="right">{r.totalPieces}</TableCell>
                    <TableCell>
                      {fmtDate(r.employee.uniformReturnDeadlineAt)}
                      {overdueDeadline && <Chip size="small" color="error" label="dépassée" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right">{money(r.owed)}</TableCell>
                    <TableCell align="right">
                      {canWriteUniforms && r.activeIssuanceIds.length > 0 && (
                        <Button
                          size="small"
                          color="warning"
                          disabled={closeMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Clôturer la fin d’emploi de ${r.employee.firstName} ${r.employee.lastName} ? Les pièces non retournées seront facturées.`)) {
                              closeMut.mutate(r.activeIssuanceIds);
                            }
                          }}
                        >
                          Clôturer fin d’emploi
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {inactive.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Aucun ancien employé ne détient d’uniforme. 🎉</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </Box>
        </>
      )}
    </Box>
  );
}
