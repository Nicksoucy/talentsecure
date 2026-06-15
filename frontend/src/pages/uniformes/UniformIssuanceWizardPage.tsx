import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Paper, TextField, MenuItem, Autocomplete, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Divider, Checkbox, FormControlLabel, Alert, IconButton, Chip,
  ToggleButton, ToggleButtonGroup, Tooltip, Card, CardContent, useTheme, useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import { useSnackbar } from 'notistack';
import { uniformService, type IssuanceLineInput } from '@/services/uniform.service';
import { invalidateUniformCaches } from '@/utils/uniformCache';
import { employeeService } from '@/services/employee.service';
import { usePerms } from '@/hooks/usePerms';
import type { UniformDivision, UniformItem, UniformSourceMode, UniformStockLocation, UniformVariant } from '@/types/uniform';
import BarcodeScannerInput from './components/BarcodeScannerInput';
import SignaturePad from './components/SignaturePad';
import StockQuickFixDialog, { type StockQuickFixTab, type StockQuickFixTarget } from './components/StockQuickFixDialog';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
/** Normalise pour la recherche : minuscules + sans accents. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const locLabel: Record<UniformStockLocation, string> = { FRONT_OFFICE: 'Front office', BACK_OFFICE: 'Back office' };
/** Stock d'une variante à un emplacement (0 si inconnu). */
const locQty = (v: UniformVariant | undefined, loc: UniformStockLocation) =>
  v?.stockByLocation?.find((s) => s.location === loc)?.quantityOnHand ?? 0;

/** Répartition d'une qté selon la source. front+back === qty toujours : en AUTO
 *  le surplus impossible est attribué au back pour que l'erreur serveur, le cas
 *  échéant, pointe la réserve. shortfall > 0 = stock insuffisant pour ce plan. */
function planSplit(v: UniformVariant | undefined, qty: number, mode: UniformSourceMode) {
  const front = locQty(v, 'FRONT_OFFICE');
  const back = locQty(v, 'BACK_OFFICE');
  if (mode === 'FRONT_OFFICE') return { front: qty, back: 0, shortfall: Math.max(0, qty - front) };
  if (mode === 'BACK_OFFICE') return { front: 0, back: qty, shortfall: Math.max(0, qty - back) };
  const f = Math.min(qty, front);
  return { front: f, back: qty - f, shortfall: Math.max(0, qty - front - back) };
}
/** Stock utilisable pour un mode (AUTO = front + back). */
const availForMode = (v: UniformVariant | undefined, mode: UniformSourceMode) =>
  mode === 'AUTO' ? locQty(v, 'FRONT_OFFICE') + locQty(v, 'BACK_OFFICE') : locQty(v, mode);

interface RowState {
  variantId: string; // variante sélectionnée (= grandeur)
  qty: number;
  /** Source forcée pour la ligne ; undefined = hérite de la source par défaut. */
  source?: UniformSourceMode;
}
interface CustomLine {
  name: string;
  cost: number;
  qty: number;
}

export default function UniformIssuanceWizardPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { canWriteUniforms, canPrepareUniformDraft } = usePerms();

  // Mode "édition d'un brouillon" : /uniformes/remises/brouillon/:id
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;

  const [employee, setEmployee] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [division, setDivision] = useState<UniformDivision>('SECURITE');
  // Source par défaut des lignes : AUTO (front d'abord, puis back) ou un
  // emplacement forcé. Chaque ligne peut l'écraser via rowState[id].source.
  const [defaultMode, setDefaultMode] = useState<UniformSourceMode>('AUTO');
  const [dueReturnAt, setDueReturnAt] = useState('');
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [customs, setCustoms] = useState<CustomLine[]>([]);
  // Mode "remise historique" : saisie d'une remise déjà effectuée sur papier.
  // Le stock n'est PAS décrémenté (sinon on doublerait l'ajustement initial).
  const [historical, setHistorical] = useState(false);
  const [historicalDate, setHistoricalDate] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [search, setSearch] = useState(''); // filtre la grille d'articles

  const employees = useQuery({
    queryKey: ['emp-search', empSearch],
    queryFn: () => employeeService.getEmployees({ search: empSearch || undefined, limit: 15, status: 'ACTIF' }),
  });
  const itemsQ = useQuery({
    // Clé unifiée sous le préfixe ['uniform-items'] → couverte par les
    // invalidations du Catalogue (articles renommés/ajoutés remontent ici).
    queryKey: ['uniform-items', division],
    queryFn: () => uniformService.listItems({ division }),
    staleTime: 0, // toujours rafraîchir à l'ouverture de la Remise
  });
  const items = itemsQ.data?.data || [];

  // Brouillon à rouvrir (mode édition). On le charge pour pré-remplir agent,
  // division, pièces et grandeurs avant finalisation/signature.
  const draftQ = useQuery({
    queryKey: ['issuance-draft', editId],
    queryFn: () => uniformService.getIssuance(editId!),
    enabled: isEdit,
  });
  const draft = draftQ.data?.data as any;

  // Pré-sélection de l'agent si on arrive depuis sa fiche (?employeeId=...)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (isEdit) return; // en édition, l'agent vient du brouillon
    const id = searchParams.get('employeeId');
    if (id) employeeService.getEmployeeById(id).then((r) => setEmployee(r.data)).catch(() => {});
  }, [searchParams, isEdit]);

  // Hydratation de l'entête depuis le brouillon (une seule fois).
  const headerHydrated = useRef(false);
  useEffect(() => {
    if (!draft || headerHydrated.current) return;
    headerHydrated.current = true;
    if (draft.employee) setEmployee(draft.employee);
    if (draft.division) setDivision(draft.division);
    setDueReturnAt(draft.dueReturnAt ? String(draft.dueReturnAt).slice(0, 10) : '');
  }, [draft]);

  // Synchronise rowState avec le catalogue. MERGE et non reset : un simple
  // refetch (ex. après une correction de stock inline) PRÉSERVE les quantités,
  // grandeurs et sources déjà saisies — la remise en cours survit. Seul un
  // changement de division réinitialise tout (rows + lignes libres).
  const prevDivision = useRef(division);
  useEffect(() => {
    const list = itemsQ.data?.data || [];
    const divisionChanged = prevDivision.current !== division;
    prevDivision.current = division;
    setRowState((prev) => {
      const next: Record<string, RowState> = {};
      for (const it of list) {
        const single = it.isOneSize || it.type === 'EQUIPEMENT' ? it.variants?.[0] : undefined;
        const old = divisionChanged ? undefined : prev[it.id];
        if (old) {
          const variantStillExists = !!old.variantId && !!it.variants?.some((v) => v.id === old.variantId);
          next[it.id] = {
            variantId: variantStillExists ? old.variantId : single?.id || '',
            qty: old.qty,
            source: old.source,
          };
        } else {
          // Auto-sélection de la variante pour les pièces "taille unique" / équipement.
          next[it.id] = { variantId: single?.id || '', qty: 0 };
        }
      }
      return next;
    });
    if (divisionChanged) setCustoms([]);
  }, [division, itemsQ.data]); // eslint-disable-line

  // Hydratation des lignes depuis le brouillon, une fois le catalogue de la BONNE
  // division chargé. S'exécute APRÈS l'effet de merge ci-dessus (même cycle) pour
  // écraser les défauts qty 0 par les quantités/grandeurs du brouillon. Les
  // refetchs ultérieurs sont préservés par le merge (division verrouillée).
  const rowsHydrated = useRef(false);
  useEffect(() => {
    if (!draft || rowsHydrated.current) return;
    if (division !== draft.division) return; // attend le catalogue de la bonne division
    if (items.length === 0) return;
    const nextRows: Record<string, RowState> = {};
    for (const it of items) {
      const single = it.isOneSize || it.type === 'EQUIPEMENT' ? it.variants?.[0] : undefined;
      nextRows[it.id] = { variantId: single?.id || '', qty: 0 };
    }
    const nextCustoms: CustomLine[] = [];
    for (const line of draft.lines || []) {
      if (line.variantId) {
        const owning = items.find((it) => it.variants?.some((v) => v.id === line.variantId));
        if (owning) nextRows[owning.id] = { variantId: line.variantId, qty: line.quantity };
      } else if (line.customItemName) {
        nextCustoms.push({ name: line.customItemName, qty: line.quantity, cost: Number(line.unitCostSnapshot ?? 0) });
      }
    }
    setRowState(nextRows);
    setCustoms(nextCustoms);
    rowsHydrated.current = true;
  }, [draft, items, division]); // eslint-disable-line

  const effectiveVariant = (it: UniformItem) => {
    const st = rowState[it.id];
    return it.variants?.find((v) => v.id === st?.variantId);
  };
  const rowCost = (it: UniformItem) => Number(effectiveVariant(it)?.replacementCost ?? it.defaultReplacementCost);

  const setQty = (itemId: string, qty: number) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], qty: Math.max(0, qty) } }));
  const setSize = (itemId: string, variantId: string) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], variantId } }));
  const setSource = (itemId: string, source: UniformSourceMode | null) =>
    setRowState((p) => ({ ...p, [itemId]: { ...p[itemId], source: source ?? undefined } }));

  const handleScan = async (code: string) => {
    try {
      const { data, location } = await uniformService.getByBarcode(code);
      const item = items.find((i) => i.id === data.itemId);
      if (!item) {
        enqueueSnackbar(`« ${data.item?.name} » n'est pas dans la division affichée`, { variant: 'warning' });
        return;
      }
      // Un QR suffixé (-F/-B) force la source de la ligne ; un code sans
      // suffixe ne touche pas à un éventuel forçage existant.
      setRowState((p) => ({
        ...p,
        [item.id]: { variantId: data.id, qty: (p[item.id]?.qty || 0) + 1, source: location ?? p[item.id]?.source },
      }));
      enqueueSnackbar(`+1 ${item.name} (${data.size})${location ? ` · ${locLabel[location]}` : ''}`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Code-barres inconnu', { variant: 'error' });
    }
  };

  const q = norm(search.trim());
  const uniformeItems = useMemo(() => items.filter((i) => i.type === 'UNIFORME' && (!q || norm(i.name).includes(q))), [items, q]);
  const equipItems = useMemo(() => items.filter((i) => i.type === 'EQUIPEMENT' && (!q || norm(i.name).includes(q))), [items, q]);

  const grandTotal =
    items.reduce((s, it) => s + (rowState[it.id]?.qty || 0) * rowCost(it), 0) +
    customs.reduce((s, c) => s + c.qty * c.cost, 0);
  const anyPicked = items.some((it) => (rowState[it.id]?.qty || 0) > 0) || customs.some((c) => c.name && c.qty > 0);
  // Aucun stock utilisable selon la source par défaut → guide l'utilisateur.
  const sourceEmpty = items.length > 0 && items.every((it) => (it.variants || []).every((v) => availForMode(v, defaultMode) === 0));

  // ---- Correction de stock inline (sans quitter la remise) ----
  const [quickFix, setQuickFix] = useState<{ itemId: string; variantId: string; tab: StockQuickFixTab; suggestedQty?: number } | null>(null);
  // Target dérivé des items COURANTS : les compteurs front/back du dialog
  // restent à jour après chaque refetch.
  const quickFixTarget = useMemo<StockQuickFixTarget | null>(() => {
    if (!quickFix) return null;
    const it = items.find((i) => i.id === quickFix.itemId);
    const v = it?.variants?.find((x) => x.id === quickFix.variantId);
    if (!it || !v) return null;
    return { variantId: v.id, label: `${it.name} — ${v.size}`, front: locQty(v, 'FRONT_OFFICE'), back: locQty(v, 'BACK_OFFICE') };
  }, [quickFix, items]);

  // ---- Construction des lignes (partagée brouillon / finalisation) ----
  const validateSizes = () => {
    for (const it of items) {
      const st = rowState[it.id];
      if (st && st.qty > 0 && !st.variantId) {
        throw new Error(`Choisissez une grandeur pour « ${it.name} »`);
      }
    }
  };
  /** Construit les lignes depuis rowState + customs.
   *  withSource=true : éclate AUTO en front/back (pour la finalisation, qui
   *  décrémente le stock). withSource=false : lignes simples sans emplacement
   *  (pour un brouillon — la source est décidée à la finalisation). */
  const buildLines = (withSource: boolean): IssuanceLineInput[] => {
    const lines: IssuanceLineInput[] = [];
    for (const it of items) {
      const st = rowState[it.id];
      const qty = st?.qty || 0;
      if (qty <= 0) continue;
      const base = { variantId: st.variantId, unitCost: rowCost(it) };
      if (!withSource || historical) {
        lines.push({ ...base, quantity: qty });
        continue;
      }
      const mode = st.source ?? defaultMode;
      if (mode === 'AUTO') {
        const split = planSplit(effectiveVariant(it), qty, 'AUTO');
        if (split.front > 0) lines.push({ ...base, quantity: split.front, sourceLocation: 'FRONT_OFFICE' });
        if (split.back > 0) lines.push({ ...base, quantity: split.back, sourceLocation: 'BACK_OFFICE' });
      } else {
        lines.push({ ...base, quantity: qty, sourceLocation: mode });
      }
    }
    lines.push(...customs.filter((c) => c.name && c.qty > 0).map((c) => ({ customItemName: c.name, quantity: c.qty, unitCost: c.cost })));
    return lines;
  };

  // ---- Préparer un brouillon (aucun impact stock/SMS/signature) ----
  const queryClient = useQueryClient();
  const prepareDraft = useMutation({
    mutationFn: async () => {
      validateSizes();
      const lines = buildLines(false);
      if (lines.length === 0) throw new Error('Ajoutez au moins une pièce');
      if (isEdit) {
        await uniformService.updateIssuance(editId!, { dueReturnAt: dueReturnAt || null, lines });
        return editId!;
      }
      const created = await uniformService.prepareDraftIssuance({
        employeeId: employee.id,
        division,
        sourceLocation: defaultMode !== 'AUTO' ? defaultMode : undefined,
        dueReturnAt: dueReturnAt || undefined,
        lines,
      });
      return created.data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issuances'] });
      enqueueSnackbar(isEdit ? 'Brouillon mis à jour' : 'Brouillon préparé — disponible dans « Planifiées »', { variant: 'success' });
      navigate('/uniformes/remises/brouillons');
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  // ---- Finalisation ----
  const [issuanceId, setIssuanceId] = useState<string | null>(null);
  const finalize = useMutation({
    mutationFn: async () => {
      validateSizes();
      const lines = buildLines(true);
      if (lines.length === 0) throw new Error('Ajoutez au moins une pièce');
      let id = editId;
      if (isEdit) {
        // Sauvegarde les pièces éventuellement ajustées, puis finalise le brouillon.
        await uniformService.updateIssuance(editId!, { dueReturnAt: dueReturnAt || null, lines });
      } else {
        const created = await uniformService.createIssuance({
          employeeId: employee.id,
          division,
          dueReturnAt: dueReturnAt || undefined,
          lines,
        });
        id = created.data.id;
      }
      await uniformService.finalizeIssuance(id!, historical ? { historical: true, historicalDate: historicalDate || undefined } : undefined);
      return id!;
    },
    onSuccess: (id) => {
      setIssuanceId(id);
      // Sync inventaire : rafraîchir TOUS les modules uniformes après la remise.
      invalidateUniformCaches(queryClient);
      enqueueSnackbar(historical ? 'Remise historique enregistrée — stock NON modifié' : 'Remise finalisée — stock décrémenté', { variant: 'success' });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  // ---- Signature ----
  const [empSig, setEmpSig] = useState<string | null>(null);
  const [emprSig, setEmprSig] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const [cPayroll, setCPayroll] = useState(true);
  const [cPolicy, setCPolicy] = useState(division === 'SECURITE');
  const [cFit, setCFit] = useState(true);
  useEffect(() => setCPolicy(division === 'SECURITE'), [division]);

  const sendSms = useMutation({
    mutationFn: () => uniformService.sendIssuanceSms(issuanceId!),
    onSuccess: () => enqueueSnackbar('SMS de signature envoyé à l’agent', { variant: 'success' }),
    onError: (e: any) =>
      enqueueSnackbar(
        e?.response?.data?.message || e?.response?.data?.error || 'Échec SMS — utilisez la signature au comptoir',
        { variant: 'warning', autoHideDuration: 12000 }
      ),
  });
  const [employerSigned, setEmployerSigned] = useState(false);
  const saveEmployer = useMutation({
    mutationFn: () => uniformService.counterSignIssuance(issuanceId!, { employerSignatureBase64: emprSig! }),
    onSuccess: () => {
      enqueueSnackbar("Signature de l'employeur enregistrée", { variant: 'success' });
      setEmployerSigned(true);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });
  const counterSign = useMutation({
    mutationFn: () =>
      uniformService.counterSignIssuance(issuanceId!, {
        employeeSignatureBase64: empSig || undefined,
        signedByName,
        consents: { payroll: cPayroll, policy: cPolicy, fit: cFit },
      }),
    onSuccess: () => {
      invalidateUniformCaches(queryClient);
      enqueueSnackbar("Signature de l'agent enregistrée", { variant: 'success' });
      navigate(`/employees/${employee.id}`);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Rendu d'une section (grille type formulaire) ----
  const renderSection = (title: string, list: UniformItem[]) => {
    if (list.length === 0) return null;
    const subtotal = list.reduce((s, it) => s + (rowState[it.id]?.qty || 0) * rowCost(it), 0);

    // Contrôles d'une ligne, factorisés pour être réutilisés en tableau (desktop)
    // ET en cartes (mobile). `stepper(big)` agrandit les cibles tactiles sur mobile.
    const lineParts = (it: UniformItem) => {
      const st = rowState[it.id] || { variantId: '', qty: 0 };
      const v = effectiveVariant(it);
      const sized = !it.isOneSize && it.type !== 'EQUIPEMENT';
      const mode = st.source ?? defaultMode;
      const split = v && st.qty > 0 ? planSplit(v, st.qty, mode) : null;
      const shortfall = !historical && split ? split.shortfall : 0;
      const lineTotal = st.qty * rowCost(it);

      const sizeField = sized ? (
        <TextField
          select size="small" fullWidth value={st.variantId}
          onChange={(e) => setSize(it.id, e.target.value)}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value=""><em>— choisir —</em></MenuItem>
          {(it.variants || []).map((variant) => (
            <MenuItem key={variant.id} value={variant.id}>
              {variant.size} — F:{locQty(variant, 'FRONT_OFFICE')} · B:{locQty(variant, 'BACK_OFFICE')}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {it.isOneSize ? 'Taille unique' : '—'}{v ? ` (F:${locQty(v, 'FRONT_OFFICE')} · B:${locQty(v, 'BACK_OFFICE')})` : ''}
        </Typography>
      );

      const stepper = (big: boolean) => (
        <Stack direction="row" alignItems="center" justifyContent={big ? 'flex-start' : 'center'} spacing={big ? 1 : 0.5}>
          <IconButton size={big ? 'medium' : 'small'} onClick={() => setQty(it.id, (st.qty || 0) - 1)}><RemoveIcon fontSize={big ? 'medium' : 'small'} /></IconButton>
          <TextField
            size="small" type="number" value={st.qty}
            onChange={(e) => setQty(it.id, Number(e.target.value))}
            inputProps={{ style: { textAlign: 'center', width: big ? 60 : 44 }, min: 0 }}
            error={shortfall > 0}
          />
          <IconButton size={big ? 'medium' : 'small'} onClick={() => setQty(it.id, (st.qty || 0) + 1)}><AddIcon fontSize={big ? 'medium' : 'small'} /></IconButton>
        </Stack>
      );

      const sourceToggle = st.qty > 0 && !historical && canWriteUniforms ? (
        <ToggleButtonGroup
          exclusive size="small" value={mode}
          onChange={(_, val: UniformSourceMode | null) => setSource(it.id, val)}
          sx={{ mt: 0.5, '& .MuiToggleButton-root': { py: { xs: 0.4, sm: 0 }, px: { xs: 1.4, sm: 0.9 }, fontSize: { xs: '0.8rem', sm: 11 }, textTransform: 'none', lineHeight: 1.7 } }}
        >
          <ToggleButton value="AUTO">Auto</ToggleButton>
          <ToggleButton value="FRONT_OFFICE">F</ToggleButton>
          <ToggleButton value="BACK_OFFICE">B</ToggleButton>
        </ToggleButtonGroup>
      ) : null;

      const captions = (
        <>
          {split && !historical && shortfall === 0 && canWriteUniforms && (
            <Typography variant="caption" color="text.secondary" display="block">
              Sortie : {[split.front > 0 ? `Front ${split.front}` : null, split.back > 0 ? `Back ${split.back}` : null].filter(Boolean).join(' · ')}
            </Typography>
          )}
          {shortfall > 0 && (
            <>
              <Typography variant="caption" color="error" display="block">
                Manque {shortfall} — dispo F:{locQty(v, 'FRONT_OFFICE')} · B:{locQty(v, 'BACK_OFFICE')}
              </Typography>
              {canWriteUniforms && (
                <Button
                  size="small" color="error"
                  onClick={() => setQuickFix({ itemId: it.id, variantId: st.variantId, tab: 'transfer', suggestedQty: shortfall })}
                  sx={{ textTransform: 'none', py: 0, minHeight: 0, fontSize: 11 }}
                >
                  Corriger le stock
                </Button>
              )}
            </>
          )}
        </>
      );

      const quickFixIcon = canWriteUniforms ? (
        <Tooltip title={st.variantId ? 'Corriger le stock (transfert · ajustement · réappro)' : "Choisissez une grandeur d'abord"}>
          <span>
            <IconButton
              size="small" disabled={!st.variantId}
              onClick={() => setQuickFix({ itemId: it.id, variantId: st.variantId, tab: 'transfer' })}
            >
              <TuneIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null;

      return { st, sizeField, stepper, sourceToggle, captions, quickFixIcon, lineTotal };
    };

    return (
      <Box mb={2}>
        <Typography variant="subtitle2" sx={{ bgcolor: '#eef1f6', px: 1.5, py: 0.75, borderRadius: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        {isMobile ? (
          <Stack spacing={1} mt={1}>
            {list.map((it) => {
              const p = lineParts(it);
              return (
                <Card key={it.id} variant="outlined" sx={{ bgcolor: p.st.qty > 0 ? '#f5faf5' : undefined }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Typography sx={{ fontWeight: 600, flex: 1 }}>{it.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{money(rowCost(it))}</Typography>
                    </Stack>
                    <Box sx={{ mt: 1 }}>{p.sizeField}</Box>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                      {p.stepper(true)}
                      {p.lineTotal > 0 && <Typography sx={{ ml: 'auto', fontWeight: 600 }}>{money(p.lineTotal)}</Typography>}
                      {p.quickFixIcon}
                    </Stack>
                    {p.sourceToggle && <Box sx={{ mt: 1 }}>{p.sourceToggle}</Box>}
                    {p.captions}
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '38%' }}>Pièce</TableCell>
                <TableCell sx={{ width: 170 }}>Taille</TableCell>
                <TableCell align="center" sx={{ width: 170 }}>Quantité</TableCell>
                <TableCell align="right">Coût unit.</TableCell>
                <TableCell align="right">Total</TableCell>
                {canWriteUniforms && <TableCell sx={{ width: 48 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((it) => {
                const p = lineParts(it);
                return (
                  <TableRow key={it.id} sx={p.st.qty > 0 ? { bgcolor: '#f5faf5' } : undefined}>
                    <TableCell>{it.name}</TableCell>
                    <TableCell>{p.sizeField}</TableCell>
                    <TableCell align="center">
                      {p.stepper(false)}
                      {p.sourceToggle}
                      {p.captions}
                    </TableCell>
                    <TableCell align="right">{money(rowCost(it))}</TableCell>
                    <TableCell align="right">{p.lineTotal > 0 ? money(p.lineTotal) : '—'}</TableCell>
                    {canWriteUniforms && (
                      <TableCell align="center" sx={{ px: 0.5 }}>{p.quickFixIcon}</TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Stack direction="row" justifyContent="flex-end" pr={1} mt={0.5}>
          <Typography variant="body2" color="text.secondary">Sous-total {title.toLowerCase()} : <b>{money(subtotal)}</b></Typography>
        </Stack>
      </Box>
    );
  };

  if (!canPrepareUniformDraft) {
    return <Alert severity="info">Accès en lecture seule — la remise d'uniformes n'est pas disponible pour votre profil.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" mb={2}>{isEdit ? 'Brouillon de remise' : "Nouvelle remise d'uniforme"}</Typography>

      {isEdit && draftQ.isLoading && <Alert severity="info" sx={{ mb: 2 }}>Chargement du brouillon…</Alert>}
      {isEdit && !canWriteUniforms && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Vous pouvez ajuster ce brouillon. La <b>finalisation, la signature et l'envoi</b> seront faits par le magasin.
        </Alert>
      )}
      {isEdit && canWriteUniforms && !issuanceId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Brouillon préparé d'avance — vérifiez les pièces et grandeurs, puis <b>Finaliser &amp; signer</b> (le stock sera décrémenté).
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <Autocomplete
            sx={{ flex: 1, minWidth: { xs: 0, md: 260 }, width: { xs: '100%', md: 'auto' } }}
            options={employees.data?.data || []}
            getOptionLabel={(o: any) => `${o.firstName} ${o.lastName}${o.assignment ? ' — ' + o.assignment : ''}`}
            value={employee}
            onChange={(_, v) => setEmployee(v)}
            onInputChange={(_, v) => setEmpSearch(v)}
            renderInput={(params) => <TextField {...params} label="Agent" size="small" />}
            isOptionEqualToValue={(o: any, v: any) => o.id === v?.id}
            disabled={!!issuanceId || isEdit}
          />
          <TextField select size="small" label="Division" value={division} onChange={(e) => setDivision(e.target.value as UniformDivision)} sx={{ minWidth: { xs: 0, md: 170 }, width: { xs: '100%', md: 'auto' } }} disabled={!!issuanceId || isEdit}>
            <MenuItem value="SECURITE">Sécurité</MenuItem>
            <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Source par défaut" value={defaultMode}
            onChange={(e) => setDefaultMode(e.target.value as UniformSourceMode)}
            sx={{ minWidth: { xs: 0, md: 190 }, width: { xs: '100%', md: 'auto' } }} disabled={!!issuanceId}
            helperText="Auto : front d'abord, puis back"
          >
            <MenuItem value="AUTO">Auto (recommandé)</MenuItem>
            <MenuItem value="FRONT_OFFICE">Front office seulement</MenuItem>
            <MenuItem value="BACK_OFFICE">Back office seulement</MenuItem>
          </TextField>
          <TextField type="date" size="small" label="Retour prévu" InputLabelProps={{ shrink: true }} value={dueReturnAt} onChange={(e) => setDueReturnAt(e.target.value)} disabled={!!issuanceId} sx={{ width: { xs: '100%', md: 'auto' } }} />
        </Stack>
        {!isEdit && canWriteUniforms && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
              <FormControlLabel
                control={<Checkbox checked={historical} onChange={(e) => setHistorical(e.target.checked)} disabled={!!issuanceId} />}
                label={<span><b>Remise historique</b> — saisie d'une remise déjà effectuée (ne décrémente PAS le stock)</span>}
              />
              {historical && (
                <TextField
                  type="date"
                  size="small"
                  label="Date de la remise originale"
                  InputLabelProps={{ shrink: true }}
                  value={historicalDate}
                  onChange={(e) => setHistoricalDate(e.target.value)}
                  disabled={!!issuanceId}
                  sx={{ maxWidth: 220 }}
                />
              )}
            </Stack>
            {historical && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Mode historique : le stock n'est pas modifié, la remise est marquée comme signée (consentements papier), aucun SMS n'est envoyé. Vous pourrez joindre le PDF original après la finalisation.
              </Alert>
            )}
          </>
        )}
      </Paper>

      {!issuanceId && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <BarcodeScannerInput onScan={handleScan} autoFocus />
            <Typography variant="caption" color="text.secondary">Scannez une étiquette : la quantité de la ligne correspondante s'incrémente.</Typography>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            {itemsQ.isLoading && <Typography>Chargement du catalogue…</Typography>}
            {!historical && sourceEmpty && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {!canWriteUniforms ? (
                  <>Aucun stock disponible — vous pouvez préparer le brouillon, le magasin réapprovisionnera avant la finalisation.</>
                ) : defaultMode === 'AUTO' ? (
                  <>Aucun stock disponible (front et back). Utilisez l'icône <TuneIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} /> d'une
                  ligne pour réapprovisionner ou ajuster — sans quitter la remise en cours.</>
                ) : (
                  <>Aucun stock à <b>{locLabel[defaultMode]}</b>. Passez la source par défaut à « Auto », ou utilisez
                  l'icône <TuneIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} /> d'une ligne (transfert / réappro) — sans quitter la remise en cours.</>
                )}
              </Alert>
            )}
            <TextField
              size="small" fullWidth placeholder="Rechercher un article par nom…"
              value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2 }}
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} /> }}
            />
            {q && uniformeItems.length === 0 && equipItems.length === 0 && (
              <Typography color="text.secondary" sx={{ py: 1 }}>Aucun article ne correspond à « {search} ».</Typography>
            )}
            {renderSection('Uniforme', uniformeItems)}
            {renderSection('Équipement', equipItems)}

            {/* Lignes "Autre" */}
            <Divider sx={{ my: 1 }} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center" mb={1}>
              <Typography variant="body2" sx={{ minWidth: 60 }}>Autre :</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCustoms([...customs, { name: '', cost: 0, qty: 1 }])}>
                Ajouter une ligne libre
              </Button>
            </Stack>
            {customs.map((c, i) => (
              <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} mb={1}>
                <TextField size="small" label="Désignation" value={c.name} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} sx={{ flex: 1, width: { xs: '100%', sm: 'auto' } }} />
                <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                  <TextField size="small" type="number" label="Qté" value={c.qty} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} sx={{ width: { xs: '50%', sm: 80 } }} />
                  <TextField size="small" type="number" label="Coût ($)" value={c.cost} onChange={(e) => setCustoms(customs.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) } : x))} sx={{ width: { xs: '50%', sm: 110 } }} />
                  <IconButton size="small" onClick={() => setCustoms(customs.filter((_, j) => j !== i))}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              </Stack>
            ))}

            <Divider sx={{ my: 2 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Chip color={anyPicked ? 'primary' : 'default'} label={`${items.filter((it) => (rowState[it.id]?.qty || 0) > 0).length + customs.filter((c) => c.name && c.qty > 0).length} ligne(s)`} />
              <Typography variant={isMobile ? 'subtitle1' : 'h6'}>Coût total du prêt : {money(grandTotal)}</Typography>
            </Stack>
          </Paper>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
            {canPrepareUniformDraft && !historical && (
              <Button
                variant="outlined" size="large" fullWidth={isMobile}
                disabled={!employee || !anyPicked || prepareDraft.isPending}
                onClick={() => prepareDraft.mutate()}
              >
                {isEdit ? 'Enregistrer le brouillon' : 'Préparer (brouillon)'}
              </Button>
            )}
            {canWriteUniforms && (
              <Button variant="contained" size="large" fullWidth={isMobile} disabled={!employee || !anyPicked || finalize.isPending} onClick={() => finalize.mutate()}>
                {historical
                  ? (isMobile ? 'Enregistrer (historique)' : 'Enregistrer la remise historique (sans toucher au stock)')
                  : (isMobile ? 'Finaliser & signer' : 'Finaliser & signer (décrémente le stock)')}
              </Button>
            )}
          </Stack>
        </>
      )}

      {issuanceId && historical && (
        <Paper sx={{ p: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Remise historique enregistrée — <b>stock NON modifié</b> et marquée comme signée (papier).
            Vous pouvez joindre le PDF original ci-dessous.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Button
              variant="contained"
              component="label"
              disabled={uploadingPdf}
            >
              {uploadingPdf ? 'Téléversement…' : 'Téléverser le PDF original'}
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploadingPdf(true);
                  try {
                    await uniformService.uploadIssuancePdf(issuanceId!, f);
                    enqueueSnackbar('PDF joint à la remise', { variant: 'success' });
                  } catch (err: any) {
                    enqueueSnackbar(err?.response?.data?.error || 'Échec téléversement', { variant: 'error' });
                  } finally {
                    setUploadingPdf(false);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </Button>
            <Button variant="outlined" onClick={() => navigate(`/employees/${employee.id}`)}>
              Aller à la fiche de l'agent
            </Button>
          </Stack>
        </Paper>
      )}

      {issuanceId && !historical && (
        <Paper sx={{ p: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Remise finalisée. <b>L'employeur doit signer en premier</b>, puis l'agent (SMS ou au comptoir).
          </Alert>

          {/* 1) Signature employeur — obligatoire avant tout envoi */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" mb={1}>1. Signature de l'employeur</Typography>
            {employerSigned ? (
              <Alert severity="success">✓ Signature de l'employeur enregistrée.</Alert>
            ) : (
              <>
                <SignaturePad label="Signer au nom de XGuard" onChange={setEmprSig} />
                <Stack direction="row" justifyContent="flex-end" mt={1}>
                  <Button variant="contained" disabled={!emprSig || saveEmployer.isPending} onClick={() => saveEmployer.mutate()}>
                    Enregistrer la signature de l'employeur
                  </Button>
                </Stack>
              </>
            )}
          </Box>

          {/* 2) Signature de l'agent — débloquée une fois l'employeur signé */}
          <Box>
            <Typography variant="subtitle1" mb={1}>2. Signature de l'agent</Typography>
            <Stack direction="row" spacing={2} mb={2}>
              <Button variant="outlined" startIcon={<SendIcon />} onClick={() => sendSms.mutate()} disabled={!employerSigned || sendSms.isPending}>
                Envoyer le lien par SMS à l'agent
              </Button>
              <Button variant="text" onClick={() => navigate(`/employees/${employee.id}`)}>Terminer plus tard</Button>
            </Stack>
            <Divider sx={{ my: 2 }}>ou signature au comptoir</Divider>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                L'agent consent au prélèvement du coût total sur sa dernière paie si non retourné à la fin d'emploi.
              </Typography>
              <FormControlLabel control={<Checkbox checked={cPayroll} onChange={(e) => setCPayroll(e.target.checked)} />} label="Consentement prélèvement dernière paie" />
              {division === 'SECURITE' && (
                <FormControlLabel control={<Checkbox checked={cPolicy} onChange={(e) => setCPolicy(e.target.checked)} />} label="Respect du port de l'uniforme (Sécurité)" />
              )}
              <FormControlLabel control={<Checkbox checked={cFit} onChange={(e) => setCFit(e.target.checked)} />} label="Atteste avoir essayé, taille adéquate" />
              <TextField size="small" label="Nom de l'agent" value={signedByName} onChange={(e) => setSignedByName(e.target.value)} sx={{ maxWidth: 360 }} />
              <SignaturePad label="Signature de l'agent" onChange={setEmpSig} />
              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" disabled={!employerSigned || !empSig || counterSign.isPending} onClick={() => counterSign.mutate()}>
                  Enregistrer la signature de l'agent
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>
      )}

      {/* Correction de stock inline : le refetch déclenché au succès met à jour
          les stocks affichés SANS perdre la remise en cours (merge rowState). */}
      <StockQuickFixDialog
        open={!!quickFixTarget}
        target={quickFixTarget}
        initialTab={quickFix?.tab}
        suggestedTransferQty={quickFix?.suggestedQty}
        defaultLocation="FRONT_OFFICE"
        onClose={() => setQuickFix(null)}
      />
    </Box>
  );
}
