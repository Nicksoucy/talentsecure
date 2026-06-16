import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack, Typography,
  Alert, Box, MenuItem, IconButton, Divider, Chip, CircularProgress, useTheme, useMediaQuery,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import { employeeService } from '@/services/employee.service';
import { contactService, type ContactConflict } from '@/services/contact.service';
import type { UniformDivision, UniformItem } from '@/types/uniform';
import { parseUniformOrder, matchItem, matchVariant, type ParsedOrder } from '../uniformOrderParser';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Appelé après création du brouillon (employeeId, issuanceId). */
  onCreated?: (issuanceId: string) => void;
}

interface PreviewRow {
  id: string;
  label: string;       // texte de la commande
  itemId: string;      // '' = ligne libre (Autre)
  variantId: string;   // '' si sized & grandeur non choisie
  qty: number;
  customName: string;  // utilisé si itemId === ''
}

type Resolution =
  | { status: 'checking' }
  | { status: 'new' }
  | { status: 'employee' | 'candidate' | 'prospect'; match: ContactConflict };

const sized = (it: UniformItem) => !it.isOneSize && it.type !== 'EQUIPEMENT' && (it.variants || []).length > 1;

function buildRows(parsed: ParsedOrder, items: UniformItem[]): PreviewRow[] {
  const rows: PreviewRow[] = [];
  let k = 0;
  for (const ln of parsed.lines) {
    const { item } = matchItem(ln.raw, items);
    const v = item ? matchVariant(item, ln.rawSize) : null;
    rows.push({
      id: `l${k++}`,
      label: `${ln.raw}${ln.rawSize ? ` · ${ln.rawSize}` : ''}`,
      itemId: item?.id || '',
      variantId: v?.id || '',
      qty: ln.qty,
      customName: ln.raw,
    });
  }
  for (const o of parsed.others) {
    const { item } = matchItem(o, items);
    const v = item ? matchVariant(item, '') : null;
    rows.push({ id: `o${k++}`, label: o, itemId: item?.id || '', variantId: v?.id || '', qty: 1, customName: o });
  }
  return rows;
}

/**
 * Importe une commande d'uniforme collée (Teams) → aperçu corrigeable → crée un
 * BROUILLON de remise. Résout l'employé via le lookup de contact existant
 * (employé existant / candidat·prospect transféré / nouvel employé créé).
 */
export default function UniformOrderImportDialog({ open, onClose, onCreated }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedOrder | null>(null);
  const [analysisId, setAnalysisId] = useState(0);
  const [emp, setEmp] = useState({ firstName: '', lastName: '', email: '', phone: '', division: 'SECURITE' as UniformDivision });
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState<Resolution>({ status: 'new' });
  const [rows, setRows] = useState<PreviewRow[]>([]);

  const reset = () => {
    setText(''); setParsed(null); setRows([]); setResolution({ status: 'new' });
    setEmp({ firstName: '', lastName: '', email: '', phone: '', division: 'SECURITE' });
    setNotes('');
  };
  useEffect(() => { if (open) reset(); }, [open]); // eslint-disable-line

  const itemsQ = useQuery({
    queryKey: ['uniform-items', emp.division],
    queryFn: () => uniformService.listItems({ division: emp.division }),
    enabled: !!parsed,
  });
  const items = itemsQ.data?.data || [];

  // (Re)construit les lignes quand le catalogue de la division est chargé.
  const builtRef = useRef('');
  useEffect(() => {
    if (!parsed || !itemsQ.data) return;
    const key = `${analysisId}:${emp.division}`;
    if (builtRef.current === key) return;
    builtRef.current = key;
    setRows(buildRows(parsed, itemsQ.data.data));
  }, [parsed, itemsQ.data, emp.division, analysisId]);

  const lookup = useMutation({
    mutationFn: (v: { email: string; phone: string }) => contactService.lookup(v.email || undefined, v.phone || undefined),
    onSuccess: (res) => {
      const m = res.data;
      if (!m) setResolution({ status: 'new' });
      else setResolution({ status: m.section, match: m });
    },
    onError: () => setResolution({ status: 'new' }),
  });

  const analyze = () => {
    const p = parseUniformOrder(text);
    if (!p.firstName && p.lines.length === 0 && p.others.length === 0) {
      enqueueSnackbar('Texte non reconnu — vérifiez le format collé', { variant: 'warning' });
      return;
    }
    builtRef.current = '';
    setParsed(p);
    setAnalysisId((n) => n + 1);
    setEmp({
      firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone,
      division: p.division || 'SECURITE',
    });
    setNotes(p.collecte ? `Collecte : ${p.collecte}` : '');
    setResolution({ status: 'checking' });
    lookup.mutate({ email: p.email, phone: p.phone });
  };

  const setRow = (id: string, patch: Partial<PreviewRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const itemById = (id: string) => items.find((it) => it.id === id);

  const create = useMutation({
    mutationFn: async () => {
      if (!emp.firstName.trim() || !emp.phone.trim()) {
        throw new Error("Prénom et téléphone de l'employé requis");
      }
      for (const r of rows) {
        if (r.qty > 0 && r.itemId) {
          const it = itemById(r.itemId);
          if (it && sized(it) && !r.variantId) throw new Error(`Choisissez une grandeur pour « ${r.label} »`);
        }
      }

      // 1. Résoudre l'employé.
      let employeeId: string;
      if (resolution.status === 'employee') {
        employeeId = resolution.match.id;
      } else if (resolution.status === 'candidate' || resolution.status === 'prospect') {
        const moved = await contactService.move({ fromSection: resolution.match.section, fromId: resolution.match.id, toSection: 'employee' });
        employeeId = moved.data.id;
      } else {
        const created = await employeeService.createEmployee({
          firstName: emp.firstName.trim(), lastName: emp.lastName.trim(),
          email: emp.email.trim() || undefined, phone: emp.phone.trim(), status: 'ACTIF',
        } as any);
        employeeId = created.data.id;
      }

      // 2. Lignes du brouillon.
      const lines = rows
        .filter((r) => r.qty > 0)
        .map((r) =>
          r.itemId && r.variantId
            ? { variantId: r.variantId, quantity: r.qty }
            : r.itemId
              ? null // sized sans grandeur — déjà bloqué plus haut
              : { customItemName: r.customName || r.label, quantity: r.qty, unitCost: 0 },
        )
        .filter(Boolean) as any[];
      if (lines.length === 0) throw new Error('Aucune pièce à inclure');

      const draft = await uniformService.prepareDraftIssuance({
        employeeId, division: emp.division, notes: notes || undefined, lines,
      });
      return draft.data.id;
    },
    onSuccess: (id) => {
      enqueueSnackbar('Brouillon créé depuis la commande', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['issuances'] });
      onCreated?.(id);
      onClose();
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  const resoAlert = () => {
    const name = resolution.status !== 'checking' && resolution.status !== 'new'
      ? `${resolution.match.firstName} ${resolution.match.lastName}`.trim() : '';
    switch (resolution.status) {
      case 'checking': return <Alert severity="info" icon={<CircularProgress size={16} />}>Recherche du contact…</Alert>;
      case 'employee': return <Alert severity="success">Employé existant : <b>{name}</b> — la remise lui sera rattachée.</Alert>;
      case 'candidate': return <Alert severity="info">Trouvé dans <b>Candidats</b> : {name} — sera <b>transféré en Employé</b>.</Alert>;
      case 'prospect': return <Alert severity="info">Trouvé dans <b>Candidats potentiels</b> : {name} — sera <b>transféré en Employé</b>.</Alert>;
      default: return <Alert severity="info">Aucun contact trouvé — un <b>nouvel employé sera créé</b>.</Alert>;
    }
  };

  return (
    <Dialog open={open} onClose={create.isPending ? undefined : onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>Importer une commande d'uniforme</DialogTitle>
      <DialogContent dividers>
        {!parsed ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Collez la commande reçue (Teams, courriel…) telle quelle. Le système en extrait l'employé et les pièces,
              puis vous laisse vérifier avant de créer le brouillon.
            </Typography>
            <TextField
              multiline minRows={10} fullWidth autoFocus
              placeholder={"Nom de l'employé : …\nCourriel : …\nDivision : …\nChemise à manches longue (1): XLarge\n…"}
              value={text} onChange={(e) => setText(e.target.value)}
            />
          </Stack>
        ) : (
          <Stack spacing={2}>
            {resoAlert()}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Employé</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" label="Prénom" value={emp.firstName} onChange={(e) => setEmp({ ...emp, firstName: e.target.value })} fullWidth />
                <TextField size="small" label="Nom" value={emp.lastName} onChange={(e) => setEmp({ ...emp, lastName: e.target.value })} fullWidth />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
                <TextField size="small" label="Courriel" value={emp.email} onChange={(e) => setEmp({ ...emp, email: e.target.value })} fullWidth />
                <TextField size="small" label="Téléphone" value={emp.phone} onChange={(e) => setEmp({ ...emp, phone: e.target.value })} fullWidth />
                <TextField select size="small" label="Division" value={emp.division} onChange={(e) => setEmp({ ...emp, division: e.target.value as UniformDivision })} sx={{ minWidth: { xs: '100%', sm: 170 } }}>
                  <MenuItem value="SECURITE">Sécurité</MenuItem>
                  <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
                </TextField>
              </Stack>
            </Box>

            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Pièces ({rows.length}) {itemsQ.isLoading && <CircularProgress size={14} sx={{ ml: 1 }} />}
              </Typography>
              <Stack spacing={1}>
                {rows.map((r) => {
                  const it = itemById(r.itemId);
                  const showSize = it && sized(it);
                  const unmatched = !r.itemId;
                  return (
                    <Box key={r.id} sx={{ p: 1, border: '1px solid', borderColor: unmatched ? 'warning.light' : 'divider', borderRadius: 1, bgcolor: unmatched ? 'warning.50' : undefined }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">Commande : « {r.label} »</Typography>
                        <IconButton size="small" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={0.5} alignItems={{ sm: 'center' }}>
                        <TextField
                          select size="small" label="Article" value={r.itemId} fullWidth
                          onChange={(e) => {
                            const id = e.target.value;
                            const nit = itemById(id);
                            const v = nit ? matchVariant(nit, '') : null;
                            setRow(r.id, { itemId: id, variantId: nit && !sized(nit) ? v?.id || '' : '' });
                          }}
                        >
                          <MenuItem value=""><em>— Ligne libre (Autre) —</em></MenuItem>
                          {items.map((opt) => <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>)}
                        </TextField>
                        {unmatched && (
                          <TextField size="small" label="Désignation libre" value={r.customName} onChange={(e) => setRow(r.id, { customName: e.target.value })} fullWidth />
                        )}
                        {showSize && (
                          <TextField select size="small" label="Grandeur" value={r.variantId} onChange={(e) => setRow(r.id, { variantId: e.target.value })} sx={{ minWidth: { xs: '100%', sm: 120 } }} error={!r.variantId}>
                            <MenuItem value=""><em>—</em></MenuItem>
                            {(it!.variants || []).filter((v) => v.isActive !== false).map((v) => <MenuItem key={v.id} value={v.id}>{v.size}</MenuItem>)}
                          </TextField>
                        )}
                        <TextField size="small" type="number" label="Qté" value={r.qty} onChange={(e) => setRow(r.id, { qty: Math.max(0, Number(e.target.value)) })} sx={{ width: { xs: '100%', sm: 80 } }} inputProps={{ min: 0 }} />
                      </Stack>
                    </Box>
                  );
                })}
                {rows.length === 0 && <Typography variant="body2" color="text.secondary">Aucune pièce détectée.</Typography>}
              </Stack>
              {rows.some((r) => !r.itemId) && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                  ⚠ Les lignes en jaune n'ont pas trouvé d'article au catalogue : choisissez-en un, ou laissez en « Ligne libre ».
                </Typography>
              )}
            </Box>

            <TextField size="small" label="Notes (collecte / livraison)" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {!parsed ? (
          <>
            <Button onClick={onClose}>Annuler</Button>
            <Button variant="contained" disabled={!text.trim()} onClick={analyze}>Analyser</Button>
          </>
        ) : (
          <>
            <Button onClick={reset} disabled={create.isPending}>Recommencer</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose} disabled={create.isPending}>Annuler</Button>
            <Button variant="contained" disabled={create.isPending || resolution.status === 'checking'} onClick={() => create.mutate()}>
              {create.isPending ? 'Création…' : 'Créer le brouillon'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
