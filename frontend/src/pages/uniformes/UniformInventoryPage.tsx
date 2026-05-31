import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Tabs, Tab, Tooltip, MenuItem, InputAdornment, Table, TableHead, TableRow,
  TableCell, TableBody, Autocomplete,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import type { UniformStockLocation } from '@/types/uniform';

// ---------- Design B (heatmap) tokens ----------
const T = {
  bg: '#fdf8f8',
  surface: '#ffffff',
  surfaceLow: '#f7f3f2',
  surfaceContainer: '#f1edec',
  onSurface: '#1c1b1b',
  onSurfaceVariant: '#444748',
  outline: '#c4c7c7',
  outlineStrong: '#747878',
  primary: '#000000',
  error: '#ba1a1a',
  errorBg: '#fef2f2',
  errorText: '#b91c1c',
  warnBg: '#fffbeb',
  warnText: '#b45309',
  ok50: '#f0fdf4',
  ok100: '#dcfce7',
  ok200: '#bbf7d0',
  fontSans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
};

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const moveLabel: Record<string, string> = {
  IN: 'Entrée', OUT: 'Sortie', ADJUST: 'Ajustement', LOST: 'Perdu', DAMAGED: 'Endommagé',
  WASH_IN: 'Au lavage', WASH_OUT_GOOD: 'Retour de lavage', WASH_OUT_DAMAGED: 'Lavage → poubelle',
  DISPOSAL: 'Disposition', TRANSFER: 'Transfert',
};
const locShort: Record<string, string> = { BACK_OFFICE: 'Back', FRONT_OFFICE: 'Front' };

// ---------- Bucket detection ----------
const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];
const isNumericSize = (s: string) => /^\d{2,3}(\.5)?$/.test(s.trim());
type Bucket = 'tops' | 'pants' | 'one-size';
function detectBucket(sizes: string[], isOneSize: boolean): Bucket {
  if (isOneSize || sizes.every((s) => /^uniqu/i.test(s) || s === '—' || s === '')) return 'one-size';
  if (sizes.every((s) => isNumericSize(s))) return 'pants';
  if (sizes.some((s) => LETTER_SIZES.includes(s.toUpperCase()))) return 'tops';
  return 'one-size';
}
function sortLetterSizes(a: string, b: string) {
  const i = (s: string) => {
    const u = s.toUpperCase();
    const idx = LETTER_SIZES.indexOf(u);
    return idx === -1 ? 99 : idx;
  };
  return i(a) - i(b);
}
function sortNumericSizes(a: string, b: string) {
  return parseFloat(a) - parseFloat(b);
}

// ---------- Heatmap cell color ----------
function cellStyle(qty: number, threshold: number | null) {
  if (qty === 0) return { bg: T.errorBg, color: T.errorText, weight: 600 };
  if (threshold != null && qty <= threshold) return { bg: T.warnBg, color: T.warnText, weight: 600 };
  const t = threshold ?? 0;
  if (t === 0) return { bg: T.ok50, color: T.onSurface, weight: 400 };
  if (qty >= t * 3) return { bg: T.ok200, color: T.onSurface, weight: 500 };
  if (qty >= t * 2) return { bg: T.ok100, color: T.onSurface, weight: 400 };
  return { bg: T.ok50, color: T.onSurface, weight: 400 };
}

// ---------- Grouping ----------
type Row = any;
type Group = {
  itemId: string;
  itemName: string;
  division: string;
  type: string;
  isOneSize: boolean;
  emplacement: string | null;
  replacementCost: number;
  variants: Row[];
  total: number;
  bucket: Bucket;
};
function groupByItem(rows: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = r.itemId || r.itemName;
    if (!map.has(key)) {
      map.set(key, {
        itemId: r.itemId,
        itemName: r.itemName,
        division: r.division,
        type: r.type,
        isOneSize: !!r.isOneSize,
        emplacement: r.emplacement,
        replacementCost: r.replacementCost,
        variants: [],
        total: 0,
        bucket: 'one-size',
      });
    }
    const g = map.get(key)!;
    g.variants.push(r);
    g.total += r.quantityOnHand;
  }
  for (const g of map.values()) {
    g.bucket = detectBucket(g.variants.map((v) => v.size), g.isOneSize);
  }
  return Array.from(map.values()).sort((a, b) => a.itemName.localeCompare(b.itemName, 'fr'));
}

// ---------- Components ----------
function KpiCell({ label, value, hint, mono = true, accent }: { label: string; value: any; hint?: string; mono?: boolean; accent?: string }) {
  return (
    <Box sx={{ flex: 1, p: 2.5, borderRight: `1px solid ${T.outline}`, '&:last-of-type': { borderRight: 'none' } }}>
      <Typography sx={{ fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant, mb: 1 }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: mono ? T.fontMono : T.fontSans, fontSize: 28, fontWeight: 600, lineHeight: 1, color: accent || T.onSurface, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {hint && (
        <Typography sx={{ mt: 0.5, fontFamily: T.fontSans, fontSize: 11, color: T.onSurfaceVariant }}>{hint}</Typography>
      )}
    </Box>
  );
}

function ActionRow({ r, onAdjust }: { r: Row; onAdjust: (r: Row) => void }) {
  const isOut = r.quantityOnHand === 0;
  const pct = r.reorderThreshold ? Math.min(100, Math.round((r.quantityOnHand / r.reorderThreshold) * 100)) : 0;
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        p: 1.25, borderRadius: 1, border: '1px solid transparent',
        transition: 'all .15s ease',
        '&:hover': { bgcolor: T.surfaceLow, borderColor: T.outline, '& .action-btn': { opacity: 1 } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ width: 220, fontFamily: T.fontSans, fontSize: 14, fontWeight: 500, color: T.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.itemName}
        </Box>
        <Box sx={{ width: 60, fontFamily: T.fontMono, fontSize: 13, color: T.onSurfaceVariant }}>{r.size}</Box>
        <Box sx={{ width: 140, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: isOut ? T.errorText : T.warnText, minWidth: 42 }}>
            {r.quantityOnHand}/{r.reorderThreshold ?? '—'}
          </Box>
          <Box sx={{ flexGrow: 1, height: 4, bgcolor: T.surfaceContainer, borderRadius: 999, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: isOut ? T.errorText : T.warnText }} />
          </Box>
        </Box>
        <Box sx={{ width: 50, fontFamily: T.fontMono, fontSize: 12, color: T.onSurfaceVariant }}>{r.emplacement || '—'}</Box>
        <Box sx={{ fontFamily: T.fontMono, fontSize: 13, color: T.onSurfaceVariant }}>{money(r.replacementCost)}/u</Box>
      </Box>
      <Button
        size="small"
        className="action-btn"
        onClick={() => onAdjust(r)}
        sx={{
          opacity: 0, transition: 'opacity .15s', textTransform: 'none', fontFamily: T.fontSans, fontWeight: 600, fontSize: 12,
          color: T.primary, border: `1px solid ${T.outline}`, borderRadius: 1, px: 1.5, py: 0.5,
          '&:hover': { bgcolor: T.surface, borderColor: T.outlineStrong },
        }}
      >
        {isOut ? 'Réapprovisionner' : 'Ajuster'}
      </Button>
    </Box>
  );
}

function HeatmapTable({
  title, subtitle, columns, groups, onCellClick,
}: {
  title: string;
  subtitle: string;
  columns: string[];
  groups: Group[];
  onCellClick: (variant: Row | null, item: Group) => void;
}) {
  if (groups.length === 0) return null;
  // Group by division
  const byDiv = new Map<string, Group[]>();
  for (const g of groups) {
    const d = g.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité';
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(g);
  }
  const totalUnits = groups.reduce((s, g) => s + g.total, 0);
  return (
    <Box sx={{ bgcolor: T.surface, border: `1px solid ${T.outline}`, borderRadius: 2, overflow: 'hidden', mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.75, borderBottom: `1px solid ${T.outline}` }}>
        <Typography sx={{ fontFamily: T.fontSans, fontSize: 14, fontWeight: 600, color: T.primary }}>{title}</Typography>
        <Typography sx={{ fontFamily: T.fontSans, fontSize: 12, color: T.onSurfaceVariant }}>{subtitle} · {groups.length} morceau(x) · {totalUnits} unités</Typography>
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: `1px solid ${T.outline}` }}>
              <Box component="th" sx={{ textAlign: 'left', px: 2, py: 1.5, fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant }}>
                Morceau
              </Box>
              {columns.map((c) => (
                <Box key={c} component="th" sx={{ textAlign: 'center', px: 1, py: 1.5, fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant, minWidth: 52 }}>
                  {c}
                </Box>
              ))}
              <Box component="th" sx={{ textAlign: 'right', px: 2, py: 1.5, fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant, borderLeft: `1px solid ${T.outline}` }}>
                Total
              </Box>
            </Box>
          </Box>
          <Box component="tbody" sx={{ fontFamily: T.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {Array.from(byDiv.entries()).flatMap(([divLabel, items], divIdx) => [
              <Box key={`div-${divIdx}`} component="tr" sx={{ bgcolor: T.surfaceLow, borderBottom: `1px solid ${T.outline}` }}>
                <Box component="td" colSpan={columns.length + 2} sx={{ px: 2, py: 1, fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant }}>
                  {divLabel}
                </Box>
              </Box>,
              ...items.map((g) => (
                <Box key={g.itemId} component="tr" sx={{ borderBottom: `1px solid ${T.outline}`, '&:hover': { bgcolor: `${T.surfaceLow}80` } }}>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Box sx={{ fontFamily: T.fontSans, fontSize: 14, fontWeight: 500, color: T.primary }}>{g.itemName}</Box>
                    <Box sx={{ fontFamily: T.fontSans, fontSize: 11, color: T.onSurfaceVariant }}>
                      {g.emplacement || '—'} · {money(g.replacementCost)}/u
                    </Box>
                  </Box>
                  {columns.map((col) => {
                    const v = g.variants.find((x) => x.size === col || (col === 'Unique' && /^uniqu/i.test(x.size)));
                    if (!v) {
                      return (
                        <Box key={col} component="td" sx={{ px: 1, py: 1.5, textAlign: 'center', color: T.onSurfaceVariant }}>
                          —
                        </Box>
                      );
                    }
                    const s = cellStyle(v.quantityOnHand, v.reorderThreshold);
                    return (
                      <Tooltip key={col} title={`Back ${v.backOffice ?? 0} · Front ${v.frontOffice ?? 0}`} arrow>
                        <Box
                          component="td"
                          onClick={() => onCellClick(v, g)}
                          sx={{
                            px: 1, py: 1.5, textAlign: 'center', cursor: 'pointer',
                            bgcolor: s.bg, color: s.color, fontWeight: s.weight,
                            transition: 'filter .12s',
                            '&:hover': { filter: 'brightness(0.96)' },
                          }}
                        >
                          {v.quantityOnHand}
                        </Box>
                      </Tooltip>
                    );
                  })}
                  <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right', borderLeft: `1px solid ${T.outline}`, fontWeight: 600 }}>
                    {g.total}
                  </Box>
                </Box>
              )),
            ])}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function OneSizeTable({ groups, onAdjust }: { groups: Group[]; onAdjust: (variant: Row) => void }) {
  if (groups.length === 0) return null;
  return (
    <Box sx={{ bgcolor: T.surface, border: `1px solid ${T.outline}`, borderRadius: 2, overflow: 'hidden', mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.75, borderBottom: `1px solid ${T.outline}` }}>
        <Typography sx={{ fontFamily: T.fontSans, fontSize: 14, fontWeight: 600, color: T.primary }}>Taille unique — équipement et accessoires</Typography>
        <Typography sx={{ fontFamily: T.fontSans, fontSize: 12, color: T.onSurfaceVariant }}>
          {groups.length} item(s) · {groups.reduce((s, g) => s + g.total, 0)} unités
        </Typography>
      </Box>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
        <Box component="thead">
          <Box component="tr" sx={{ borderBottom: `1px solid ${T.outline}` }}>
            {['Morceau', 'Division', 'Emplacement', 'Stock', 'Coût', 'Valeur', ''].map((h, i) => (
              <Box
                key={i}
                component="th"
                sx={{
                  textAlign: ['Stock', 'Coût', 'Valeur'].includes(h) ? 'right' : 'left',
                  px: 2, py: 1.5,
                  fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant,
                  borderLeft: h === 'Valeur' ? `1px solid ${T.outline}` : undefined,
                }}
              >
                {h}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody" sx={{ fontFamily: T.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {groups.map((g) => {
            const v = g.variants[0];
            const s = cellStyle(v.quantityOnHand, v.reorderThreshold);
            return (
              <Box key={g.itemId} component="tr" sx={{ borderBottom: `1px solid ${T.outline}`, '&:hover': { bgcolor: `${T.surfaceLow}80` } }}>
                <Box component="td" sx={{ px: 2, py: 1.5, fontFamily: T.fontSans, fontSize: 14, fontWeight: 500, color: T.primary }}>{g.itemName}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontFamily: T.fontSans, fontSize: 12, color: T.onSurfaceVariant }}>
                  {g.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'}
                </Box>
                <Box component="td" sx={{ px: 2, py: 1.5, color: T.onSurfaceVariant }}>{g.emplacement || '—'}</Box>
                <Tooltip title={`Back ${v.backOffice ?? 0} · Front ${v.frontOffice ?? 0}`} arrow>
                  <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right', bgcolor: s.bg, color: s.color, fontWeight: s.weight }}>{v.quantityOnHand}</Box>
                </Tooltip>
                <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right' }}>{money(v.replacementCost)}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right', borderLeft: `1px solid ${T.outline}`, fontWeight: 600 }}>{money(v.value)}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, textAlign: 'right' }}>
                  <Tooltip title="Ajuster l'inventaire">
                    <IconButton size="small" onClick={() => onAdjust(v)}><TuneIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

// ---------- Page ----------
export default function UniformInventoryPage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);

  const [moveType, setMoveType] = useState('');

  const stock = useQuery({ queryKey: ['uniform-stock'], queryFn: () => uniformService.reportStock() });
  const movements = useQuery({
    queryKey: ['uniform-movements', moveType],
    queryFn: () => uniformService.listMovements({ limit: 100, type: moveType || undefined }),
  });

  const [adjust, setAdjust] = useState<{ variantId: string; label: string } | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const doAdjust = useMutation({
    mutationFn: () => uniformService.adjust(adjust!.variantId, Number(qty), reason),
    onSuccess: () => {
      enqueueSnackbar('Inventaire ajusté', { variant: 'success' });
      setAdjust(null); setQty(''); setReason('');
      qc.invalidateQueries({ queryKey: ['uniform-stock'] });
      qc.invalidateQueries({ queryKey: ['uniform-movements'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // Transfert back ↔ front
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRow, setTransferRow] = useState<Row | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferFrom, setTransferFrom] = useState<UniformStockLocation>('BACK_OFFICE');
  const transferTo: UniformStockLocation = transferFrom === 'BACK_OFFICE' ? 'FRONT_OFFICE' : 'BACK_OFFICE';
  const closeTransfer = () => { setTransferOpen(false); setTransferRow(null); setTransferQty(''); setTransferFrom('BACK_OFFICE'); };
  const doTransfer = useMutation({
    mutationFn: () => uniformService.transfer(transferRow!.variantId, {
      quantity: Number(transferQty), from: transferFrom, to: transferTo,
    }),
    onSuccess: () => {
      enqueueSnackbar('Transfert effectué', { variant: 'success' });
      closeTransfer();
      qc.invalidateQueries({ queryKey: ['uniform-stock'] });
      qc.invalidateQueries({ queryKey: ['uniform-movements'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const transferAvail = transferRow ? (transferFrom === 'BACK_OFFICE' ? transferRow.backOffice : transferRow.frontOffice) ?? 0 : 0;

  // Impression de toutes les étiquettes QR
  const printLabels = useMutation({
    mutationFn: async () => {
      const ids = rawRows.map((r) => r.variantId);
      if (ids.length === 0) throw new Error('Aucune variante à imprimer');
      return uniformService.labelsSheet(ids);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  // Filters
  const [search, setSearch] = useState('');
  const [divFilter, setDivFilter] = useState<'ALL' | 'SECURITE' | 'SIGNALISATION'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OUT' | 'LOW' | 'OK'>('ALL');

  const rawRows: Row[] = stock.data?.data.rows || [];
  const totals = stock.data?.data.totals;

  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      if (divFilter !== 'ALL' && r.division !== divFilter) return false;
      if (statusFilter === 'OUT' && r.quantityOnHand !== 0) return false;
      if (statusFilter === 'LOW' && !(r.lowStock && r.quantityOnHand > 0)) return false;
      if (statusFilter === 'OK' && (r.quantityOnHand === 0 || r.lowStock)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.itemName} ${r.size} ${r.emplacement || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rawRows, divFilter, statusFilter, search]);

  const groups = useMemo(() => groupByItem(filteredRows), [filteredRows]);

  const tops = groups.filter((g) => g.bucket === 'tops');
  const pants = groups.filter((g) => g.bucket === 'pants');
  const oneSize = groups.filter((g) => g.bucket === 'one-size');

  // Compute columns from actual data
  const topsSizes = useMemo(() => {
    const s = new Set<string>();
    tops.forEach((g) => g.variants.forEach((v) => s.add(v.size)));
    return Array.from(s).sort(sortLetterSizes);
  }, [tops]);
  const pantsSizes = useMemo(() => {
    const s = new Set<string>();
    pants.forEach((g) => g.variants.forEach((v) => s.add(v.size)));
    return Array.from(s).sort(sortNumericSizes);
  }, [pants]);

  // Action required = out of stock + low stock
  const actionRows = useMemo(
    () => rawRows.filter((r) => r.quantityOnHand === 0 || r.lowStock).sort((a, b) => a.quantityOnHand - b.quantityOnHand),
    [rawRows],
  );
  const outRows = actionRows.filter((r) => r.quantityOnHand === 0);
  const lowRows = actionRows.filter((r) => r.quantityOnHand > 0);

  // KPIs
  const totalUnits = totals?.totalUnits ?? 0;
  const totalValue = totals?.totalValue ?? 0;
  const lowCount = rawRows.filter((r) => r.lowStock && r.quantityOnHand > 0).length;
  const outCount = rawRows.filter((r) => r.quantityOnHand === 0).length;

  const handleExport = async () => {
    try {
      const blob = await uniformService.exportInventoryXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inventaire_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      enqueueSnackbar('Excel téléchargé', { variant: 'success' });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.error || "Échec de l'export", { variant: 'error' });
    }
  };

  const openAdjust = (r: Row) => setAdjust({ variantId: r.variantId, label: `${r.itemName} — ${r.size}` });

  return (
    <Box sx={{ bgcolor: T.bg, mx: -3, mt: -3, mb: -3, px: 3, py: 3, minHeight: 'calc(100vh - 100px)', fontFamily: T.fontSans }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography sx={{ fontFamily: T.fontSans, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant, mb: 0.5 }}>
            Uniformes / Inventaire
          </Typography>
          <Typography sx={{ fontFamily: T.fontSans, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', color: T.primary, lineHeight: 1.1 }}>
            Inventaire
          </Typography>
          <Typography sx={{ mt: 0.5, fontFamily: T.fontSans, fontSize: 13, color: T.onSurfaceVariant }}>
            Vue d'ensemble par morceau et par taille. Cliquez sur une cellule pour ajuster.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<SwapHorizIcon />}
            onClick={() => { setTransferRow(null); setTransferOpen(true); }}
            sx={{
              textTransform: 'none', fontFamily: T.fontSans, fontWeight: 500,
              color: T.primary, borderColor: T.outline, bgcolor: T.surface,
              '&:hover': { borderColor: T.outlineStrong, bgcolor: T.surface },
            }}
          >
            Transférer
          </Button>
          <Button
            variant="outlined"
            startIcon={<QrCode2Icon />}
            onClick={() => printLabels.mutate()}
            disabled={printLabels.isPending || rawRows.length === 0}
            sx={{
              textTransform: 'none', fontFamily: T.fontSans, fontWeight: 500,
              color: T.primary, borderColor: T.outline, bgcolor: T.surface,
              '&:hover': { borderColor: T.outlineStrong, bgcolor: T.surface },
            }}
          >
            {printLabels.isPending ? 'Génération…' : 'Étiquettes QR'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExport}
            sx={{
              textTransform: 'none', fontFamily: T.fontSans, fontWeight: 500,
              color: T.primary, borderColor: T.outline, bgcolor: T.surface,
              '&:hover': { borderColor: T.outlineStrong, bgcolor: T.surface },
            }}
          >
            Exporter Excel
          </Button>
        </Stack>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3, minHeight: 36,
          '& .MuiTab-root': { textTransform: 'none', fontFamily: T.fontSans, fontWeight: 500, fontSize: 14, minHeight: 36, py: 0.75, color: T.onSurfaceVariant },
          '& .Mui-selected': { color: `${T.primary} !important` },
          '& .MuiTabs-indicator': { backgroundColor: T.primary },
        }}
      >
        <Tab label="Stock" />
        <Tab label="Mouvements" />
      </Tabs>

      {tab === 0 && (
        <>
          {/* KPI strip */}
          <Box sx={{ display: 'flex', bgcolor: T.surface, border: `1px solid ${T.outline}`, borderRadius: 2, mb: 4, overflow: 'hidden' }}>
            <KpiCell label="Unités en stock" value={totalUnits.toLocaleString('fr-CA')} hint="tous morceaux confondus" />
            <KpiCell label="Back office" value={(totals?.totalBackOffice ?? 0).toLocaleString('fr-CA')} hint="entrepôt principal" />
            <KpiCell label="Front office" value={(totals?.totalFrontOffice ?? 0).toLocaleString('fr-CA')} hint="comptoir de remise" />
            <KpiCell label="Valeur totale" value={`$${Math.round(totalValue).toLocaleString('fr-CA')}`} hint="coût de remplacement" />
            <KpiCell
              label="Stock bas"
              value={lowCount}
              accent={lowCount > 0 ? T.warnText : undefined}
              hint="sous le seuil de réappro"
            />
            <KpiCell
              label="Rupture"
              value={outCount}
              accent={outCount > 0 ? T.errorText : undefined}
              hint="à réapprovisionner"
            />
            <KpiCell
              label="Variantes suivies"
              value={rawRows.length}
              hint="actives au catalogue"
            />
          </Box>

          {/* Action required */}
          {actionRows.length > 0 && (
            <Box
              sx={{
                mb: 4, bgcolor: T.surface, border: `1px solid ${T.outline}`, borderLeft: `3px solid ${T.error}`,
                borderRadius: 2, overflow: 'hidden',
              }}
            >
              <Box sx={{ px: 2, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.outline}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <ErrorOutlineIcon sx={{ color: T.error, fontSize: 22 }} />
                  <Typography sx={{ fontFamily: T.fontSans, fontSize: 18, fontWeight: 600, color: T.primary }}>Action requise</Typography>
                  <Chip
                    label={`${actionRows.length} variante${actionRows.length > 1 ? 's' : ''}`}
                    size="small"
                    sx={{
                      bgcolor: '#fee2e2', color: T.errorText, fontFamily: T.fontSans, fontSize: 11,
                      fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', height: 20, borderRadius: 999,
                    }}
                  />
                </Box>
              </Box>
              <Box sx={{ p: 2 }}>
                {outRows.length > 0 && (
                  <Box sx={{ mb: lowRows.length > 0 ? 3 : 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: T.errorText }} />
                      <Typography sx={{ fontFamily: T.fontSans, fontSize: 14, fontWeight: 600, color: T.primary }}>
                        Rupture — réappro urgent ({outRows.length})
                      </Typography>
                    </Box>
                    <Stack spacing={0.5}>
                      {outRows.map((r) => <ActionRow key={r.variantId} r={r} onAdjust={openAdjust} />)}
                    </Stack>
                  </Box>
                )}
                {lowRows.length > 0 && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: T.warnText }} />
                      <Typography sx={{ fontFamily: T.fontSans, fontSize: 14, fontWeight: 600, color: T.primary }}>
                        Stock bas — sous le seuil ({lowRows.length})
                      </Typography>
                    </Box>
                    <Stack spacing={0.5}>
                      {lowRows.map((r) => <ActionRow key={r.variantId} r={r} onAdjust={openAdjust} />)}
                    </Stack>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Toolbar */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 4 }}>
            <TextField
              size="small"
              placeholder="Chercher un morceau, une taille, un emplacement…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                flexGrow: 1, maxWidth: 420,
                '& .MuiOutlinedInput-root': {
                  bgcolor: T.surface, fontFamily: T.fontSans, fontSize: 14,
                  '& fieldset': { borderColor: T.outline },
                  '&:hover fieldset': { borderColor: T.outlineStrong },
                  '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: 1 },
                },
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.onSurfaceVariant, fontSize: 20 }} /></InputAdornment>,
              }}
            />
            <Stack direction="row" spacing={1}>
              <TextField
                select size="small" value={divFilter} onChange={(e) => setDivFilter(e.target.value as any)}
                sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { bgcolor: T.surface, fontFamily: T.fontSans, fontSize: 14, '& fieldset': { borderColor: T.outline } } }}
              >
                <MenuItem value="ALL">Division : Toutes</MenuItem>
                <MenuItem value="SECURITE">Sécurité</MenuItem>
                <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
              </TextField>
              <TextField
                select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
                sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { bgcolor: T.surface, fontFamily: T.fontSans, fontSize: 14, '& fieldset': { borderColor: T.outline } } }}
              >
                <MenuItem value="ALL">État : Tous</MenuItem>
                <MenuItem value="OUT">Rupture</MenuItem>
                <MenuItem value="LOW">Stock bas</MenuItem>
                <MenuItem value="OK">OK</MenuItem>
              </TextField>
            </Stack>
          </Stack>

          {/* Heatmap section header */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Typography sx={{ fontFamily: T.fontSans, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.onSurfaceVariant }}>
              Heatmap — stock par taille
            </Typography>
            <Box sx={{ flexGrow: 1, height: 1, bgcolor: T.outline }} />
            <Stack direction="row" spacing={1.5} sx={{ fontFamily: T.fontMono, fontSize: 11, color: T.onSurfaceVariant }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: T.errorBg, border: `1px solid #fecaca` }} />0
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: T.warnBg, border: `1px solid #fde68a` }} />Bas
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: T.ok50, border: `1px solid #bbf7d0` }} />OK
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: T.ok200 }} />Élevé
              </Box>
            </Stack>
          </Stack>

          {/* Empty state */}
          {!stock.isLoading && filteredRows.length === 0 && (
            <Box sx={{ p: 6, textAlign: 'center', bgcolor: T.surface, border: `1px solid ${T.outline}`, borderRadius: 2 }}>
              <Typography sx={{ fontFamily: T.fontSans, fontSize: 14, color: T.onSurfaceVariant }}>
                Aucun morceau ne correspond à ces filtres.
              </Typography>
            </Box>
          )}

          {/* Heatmap tables */}
          <HeatmapTable
            title="Hauts — chemises, polos, chandails"
            subtitle="Tailles lettrées"
            columns={topsSizes}
            groups={tops}
            onCellClick={(v) => v && openAdjust(v)}
          />
          <HeatmapTable
            title="Pantalons — par tour de taille"
            subtitle="Tailles numériques"
            columns={pantsSizes}
            groups={pants}
            onCellClick={(v) => v && openAdjust(v)}
          />
          <OneSizeTable groups={oneSize} onAdjust={openAdjust} />
        </>
      )}

      {tab === 1 && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              select size="small" value={moveType} onChange={(e) => setMoveType(e.target.value)}
              sx={{ minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: T.surface, fontFamily: T.fontSans, fontSize: 14, '& fieldset': { borderColor: T.outline } } }}
            >
              <MenuItem value="">Type : Tous</MenuItem>
              <MenuItem value="TRANSFER">Transferts (back ↔ front)</MenuItem>
              <MenuItem value="IN">Entrées</MenuItem>
              <MenuItem value="OUT">Sorties</MenuItem>
              <MenuItem value="ADJUST">Ajustements</MenuItem>
              <MenuItem value="WASH_IN">Au lavage</MenuItem>
              <MenuItem value="WASH_OUT_GOOD">Retours de lavage</MenuItem>
            </TextField>
          </Stack>
          <Box sx={{ bgcolor: T.surface, border: `1px solid ${T.outline}`, borderRadius: 2, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: T.surfaceLow }}>
                  <TableCell sx={{ fontFamily: T.fontSans, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.onSurfaceVariant }}>Date</TableCell>
                  <TableCell sx={{ fontFamily: T.fontSans, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.onSurfaceVariant }}>Morceau</TableCell>
                  <TableCell sx={{ fontFamily: T.fontSans, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.onSurfaceVariant }}>Type</TableCell>
                  <TableCell sx={{ fontFamily: T.fontSans, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.onSurfaceVariant }}>Empl.</TableCell>
                  <TableCell align="right" sx={{ fontFamily: T.fontSans, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.onSurfaceVariant }}>Δ Qté</TableCell>
                  <TableCell sx={{ fontFamily: T.fontSans, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.onSurfaceVariant }}>Raison</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(movements.data?.data || []).map((m: any) => (
                  <TableRow key={m.id} sx={{ '& td': { fontFamily: T.fontSans, fontSize: 13 } }}>
                    <TableCell sx={{ fontFamily: `${T.fontMono} !important`, fontVariantNumeric: 'tabular-nums', color: T.onSurfaceVariant }}>
                      {new Date(m.createdAt).toLocaleString('fr-CA')}
                    </TableCell>
                    <TableCell>{m.variant ? `${m.variant.item?.name} — ${m.variant.size}` : m.variantId}</TableCell>
                    <TableCell>
                      <Chip size="small" label={moveLabel[m.type] || m.type}
                        sx={{ fontFamily: T.fontSans, fontSize: 11, height: 20, bgcolor: T.surfaceContainer, borderRadius: 1 }} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: `${T.fontMono} !important`, color: T.onSurfaceVariant }}>{m.location ? locShort[m.location] || m.location : '—'}</TableCell>
                    <TableCell align="right"
                      sx={{ fontFamily: `${T.fontMono} !important`, fontVariantNumeric: 'tabular-nums', color: m.quantity < 0 ? T.errorText : '#15803d', fontWeight: 600 }}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell sx={{ color: T.onSurfaceVariant }}>{m.reason}</TableCell>
                  </TableRow>
                ))}
                {(movements.data?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={6}><Typography variant="body2" sx={{ color: T.onSurfaceVariant, py: 1 }}>Aucun mouvement.</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </>
      )}

      {/* Adjust dialog */}
      <Dialog open={!!adjust} onClose={() => setAdjust(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: T.fontSans, fontWeight: 600 }}>Ajuster l'inventaire</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2} sx={{ fontFamily: T.fontSans }}>{adjust?.label}</Typography>
          <Stack spacing={2}>
            <TextField type="number" fullWidth label="Delta (ex. +5 ou -3)" value={qty} onChange={(e) => setQty(e.target.value)} />
            <TextField fullWidth label="Raison" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjust(null)} sx={{ textTransform: 'none' }}>Annuler</Button>
          <Button
            variant="contained"
            disabled={!qty || doAdjust.isPending}
            onClick={() => doAdjust.mutate()}
            sx={{ textTransform: 'none', bgcolor: T.primary, '&:hover': { bgcolor: '#1c1b1b' } }}
          >
            Ajuster
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onClose={closeTransfer} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: T.fontSans, fontWeight: 600 }}>Transférer du stock</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Autocomplete
              options={rawRows}
              value={transferRow}
              onChange={(_, v) => setTransferRow(v)}
              getOptionLabel={(r: Row) => `${r.itemName} — ${r.size}`}
              isOptionEqualToValue={(a: Row, b: Row) => a.variantId === b?.variantId}
              renderOption={(props, r: Row) => (
                <li {...props} key={r.variantId}>
                  <Box>
                    <Typography variant="body2">{r.itemName} — {r.size}</Typography>
                    <Typography variant="caption" color="text.secondary">Back {r.backOffice ?? 0} · Front {r.frontOffice ?? 0}</Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Pièce (type + taille)" size="small" />}
            />
            <TextField
              select size="small" label="De" value={transferFrom}
              onChange={(e) => setTransferFrom(e.target.value as UniformStockLocation)}
            >
              <MenuItem value="BACK_OFFICE">Back office</MenuItem>
              <MenuItem value="FRONT_OFFICE">Front office</MenuItem>
            </TextField>
            <Typography variant="body2" color="text.secondary">
              Vers <b>{locShort[transferTo]} office</b>{transferRow ? ` · disponible à ${locShort[transferFrom]} : ${transferAvail}` : ''}
            </Typography>
            <TextField
              type="number" size="small" label="Quantité" value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              error={!!transferQty && Number(transferQty) > transferAvail}
              helperText={!!transferQty && Number(transferQty) > transferAvail ? 'Dépasse le stock disponible' : ' '}
              inputProps={{ min: 1 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTransfer} sx={{ textTransform: 'none' }}>Annuler</Button>
          <Button
            variant="contained"
            disabled={!transferRow || !transferQty || Number(transferQty) <= 0 || Number(transferQty) > transferAvail || doTransfer.isPending}
            onClick={() => doTransfer.mutate()}
            sx={{ textTransform: 'none', bgcolor: T.primary, '&:hover': { bgcolor: '#1c1b1b' } }}
          >
            Transférer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
