import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, Chip, Stack, Link,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { uniformService } from '@/services/uniform.service';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;

export default function UniformReportsPage() {
  const [tab, setTab] = useState(0);
  const stock = useQuery({ queryKey: ['rep-stock'], queryFn: () => uniformService.reportStock(), enabled: tab === 0 });
  const overdue = useQuery({ queryKey: ['rep-overdue'], queryFn: () => uniformService.reportOverdue(), enabled: tab === 1 });
  const losses = useQuery({ queryKey: ['rep-losses'], queryFn: () => uniformService.reportLosses(), enabled: tab === 2 });

  return (
    <Box>
      <Typography variant="h5" mb={2}>Rapports — Uniformes</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stock" />
        <Tab label="Retours en retard" />
        <Tab label="Pertes / dommages" />
      </Tabs>

      {tab === 0 && (
        <>
          {stock.data?.data.totals && (
            <Stack direction="row" spacing={2} mb={2}>
              <Chip label={`Unités : ${stock.data.data.totals.totalUnits}`} />
              <Chip color="primary" label={`Valeur : ${money(stock.data.data.totals.totalValue)}`} />
            </Stack>
          )}
          <Table size="small">
            <TableHead><TableRow><TableCell>Morceau</TableCell><TableCell>Division</TableCell><TableCell>Grandeur</TableCell><TableCell align="right">Stock</TableCell><TableCell align="right">Valeur</TableCell></TableRow></TableHead>
            <TableBody>
              {(stock.data?.data.rows || []).map((r: any) => (
                <TableRow key={r.variantId} sx={r.lowStock ? { bgcolor: '#fff4e5' } : undefined}>
                  <TableCell>{r.itemName}</TableCell>
                  <TableCell>{r.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                  <TableCell>{r.size}</TableCell>
                  <TableCell align="right">{r.quantityOnHand}{r.lowStock && <Chip size="small" color="warning" label="bas" sx={{ ml: 1 }} />}</TableCell>
                  <TableCell align="right">{money(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {tab === 1 && (
        <Table size="small">
          <TableHead><TableRow><TableCell>Agent</TableCell><TableCell>Division</TableCell><TableCell>Retour prévu</TableCell><TableCell align="right">Pièces</TableCell><TableCell align="right">Coût</TableCell></TableRow></TableHead>
          <TableBody>
            {(overdue.data?.data || []).map((r: any) => (
              <TableRow key={r.issuanceId}>
                <TableCell><Link component={RouterLink} to={`/uniformes/fiches/${r.employeeId}`}>{r.employeeName}</Link></TableCell>
                <TableCell>{r.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}</TableCell>
                <TableCell>{r.dueReturnAt ? new Date(r.dueReturnAt).toLocaleDateString('fr-CA') : '—'}</TableCell>
                <TableCell align="right">{r.itemsCount}</TableCell>
                <TableCell align="right">{money(r.totalLoanCost)}</TableCell>
              </TableRow>
            ))}
            {overdue.data?.data?.length === 0 && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Aucun retour en retard.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      {tab === 2 && (
        <>
          {losses.data?.data.totals && (
            <Stack direction="row" spacing={2} mb={2}>
              <Chip label={`Unités perdues/endommagées : ${losses.data.data.totals.totalUnits}`} />
              <Chip color="error" label={`Coût total : ${money(losses.data.data.totals.totalCost)}`} />
            </Stack>
          )}
          <Table size="small">
            <TableHead><TableRow><TableCell>Agent</TableCell><TableCell align="right">Unités</TableCell><TableCell align="right">Coût</TableCell></TableRow></TableHead>
            <TableBody>
              {(losses.data?.data.rows || []).map((r: any) => (
                <TableRow key={r.employeeId}>
                  <TableCell><Link component={RouterLink} to={`/uniformes/fiches/${r.employeeId}`}>{r.employeeName}</Link></TableCell>
                  <TableCell align="right">{r.units}</TableCell>
                  <TableCell align="right">{money(r.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Box>
  );
}
