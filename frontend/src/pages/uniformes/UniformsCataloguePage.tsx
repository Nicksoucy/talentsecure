import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Stack, TextField, MenuItem, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  Card, CardContent, CardActions, CircularProgress, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import StraightenIcon from '@mui/icons-material/Straighten';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useSnackbar } from 'notistack';
import { uniformService } from '@/services/uniform.service';
import type { UniformDivision, UniformItem, UniformStockLocation, UniformVariant } from '@/types/uniform';

const money = (n: any) => `$ ${Number(n).toFixed(2)}`;
const locQty = (v: UniformVariant, loc: UniformStockLocation) =>
  v.stockByLocation?.find((s) => s.location === loc)?.quantityOnHand ?? 0;
const sumLoc = (vs: UniformVariant[] | undefined, loc: UniformStockLocation) =>
  (vs || []).reduce((s, v) => s + locQty(v, loc), 0);

/** Ouvre un Blob (PDF) dans un nouvel onglet puis libère l'URL. */
function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

interface QrPreviewState {
  variant: UniformVariant;
  location: UniformStockLocation;
  itemName: string;
}

/** Aperçu + impression du QR d'une grandeur pour un emplacement (casier/bac). */
function QrPreviewDialog({ state, onClose }: { state: QrPreviewState | null; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!state) { setImgUrl(null); return; }
    let active = true;
    let url: string | null = null;
    setLoading(true);
    uniformService.variantQrPng(state.variant.id, state.location)
      .then((blob) => { if (!active) return; url = URL.createObjectURL(blob); setImgUrl(url); })
      .catch(() => { if (active) setImgUrl(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [state?.variant.id, state?.location]);

  const isFront = state?.location === 'FRONT_OFFICE';
  const locLabel = isFront ? 'Front · casier' : 'Back · bac';
  const code = state ? `${state.variant.barcode}-${isFront ? 'F' : 'B'}` : '';

  const print = async () => {
    if (!state) return;
    setPrinting(true);
    try { openBlob(await uniformService.variantLabelPdf(state.variant.id, state.location)); }
    catch { enqueueSnackbar('Erreur impression', { variant: 'error' }); }
    finally { setPrinting(false); }
  };

  return (
    <Dialog open={!!state} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        QR — {state?.itemName} {state?.variant.size}
        <Typography variant="body2" color="text.secondary">{locLabel}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack alignItems="center" spacing={1.5} py={1}>
          {loading ? (
            <CircularProgress />
          ) : imgUrl ? (
            <Box component="img" src={imgUrl} alt="QR" sx={{ width: 220, height: 220, imageRendering: 'pixelated' }} />
          ) : (
            <Typography color="error">QR indisponible</Typography>
          )}
          <Chip label={code} sx={{ fontFamily: 'monospace' }} />
          <Typography variant="caption" color="text.secondary" textAlign="center">
            À coller sur {isFront ? 'le casier (front office)' : 'le bac (back office)'}.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fermer</Button>
        <Button variant="contained" startIcon={<PrintIcon />} disabled={printing} onClick={print}>
          Imprimer cette étiquette
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UniformsCataloguePage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [division, setDivision] = useState<UniformDivision | ''>('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['uniform-items', division, search],
    queryFn: () => uniformService.listItems({ division: division || undefined, search: search || undefined }),
  });
  const items = data?.data || [];

  // ---- Dialog: nouveau morceau ----
  const [itemDlg, setItemDlg] = useState(false);
  const [itemForm, setItemForm] = useState({ division: 'SECURITE', type: 'UNIFORME', name: '', isOneSize: false, defaultReplacementCost: 0 });
  const createItem = useMutation({
    mutationFn: () => uniformService.createItem(itemForm as any),
    onSuccess: () => {
      enqueueSnackbar('Morceau créé', { variant: 'success' });
      setItemDlg(false);
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Dialog: nouvelle grandeur ----
  const [variantDlg, setVariantDlg] = useState<UniformItem | null>(null);
  const [variantForm, setVariantForm] = useState({ size: '', replacementCost: '', reorderThreshold: '', emplacement: '' });
  const createVariant = useMutation({
    mutationFn: () =>
      uniformService.createVariant(variantDlg!.id, {
        size: variantForm.size,
        replacementCost: variantForm.replacementCost ? Number(variantForm.replacementCost) : undefined,
        reorderThreshold: variantForm.reorderThreshold ? Number(variantForm.reorderThreshold) : undefined,
        ...(variantForm.emplacement ? { emplacement: variantForm.emplacement } : {}),
      } as any),
    onSuccess: () => {
      enqueueSnackbar('Grandeur ajoutée', { variant: 'success' });
      setVariantDlg(null);
      setVariantForm({ size: '', replacementCost: '', reorderThreshold: '', emplacement: '' });
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Dialog: réappro ----
  const [replenish, setReplenish] = useState<{ variantId: string; label: string } | null>(null);
  const [replenishQty, setReplenishQty] = useState('');
  const [replenishLoc, setReplenishLoc] = useState<UniformStockLocation>('BACK_OFFICE');
  const doReplenish = useMutation({
    mutationFn: () => uniformService.replenish(replenish!.variantId, Number(replenishQty), undefined, replenishLoc),
    onSuccess: () => {
      enqueueSnackbar('Stock ajouté', { variant: 'success' });
      setReplenish(null);
      setReplenishQty('');
      setReplenishLoc('BACK_OFFICE');
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Erreur', { variant: 'error' }),
  });

  // ---- Photo par morceau ----
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const uploadImage = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uniformService.uploadItemImage(id, file),
    onMutate: ({ id }) => setUploadingId(id),
    onSuccess: () => {
      enqueueSnackbar('Photo enregistrée', { variant: 'success' });
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || 'Échec photo', { variant: 'error' }),
    onSettled: () => setUploadingId(null),
  });

  // ---- Impression QR d'un morceau (front + back par grandeur) ----
  const printItemLabels = useMutation({
    mutationFn: (item: UniformItem) => {
      const ids = (item.variants || []).map((v) => v.id);
      if (ids.length === 0) throw new Error('Aucune grandeur à imprimer');
      return uniformService.labelsSheet(ids);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    onError: (e: any) => enqueueSnackbar(e?.response?.data?.error || e?.message || 'Erreur', { variant: 'error' }),
  });

  // ---- Dialog: détails / grandeurs d'un morceau ----
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsItem = useMemo(() => items.find((i) => i.id === detailsId) || null, [items, detailsId]);

  // ---- Aperçu QR par grandeur + emplacement ----
  const [qrPreview, setQrPreview] = useState<QrPreviewState | null>(null);
  const printVariantBoth = async (variantId: string) => {
    try { openBlob(await uniformService.variantLabelPdf(variantId)); }
    catch { enqueueSnackbar('Erreur étiquette', { variant: 'error' }); }
  };

  // ---- Réordonnancement par glisser-déposer (sortOrder) ----
  // Copie locale ordonnée, resynchronisée quand la liste serveur change.
  const [ordered, setOrdered] = useState<UniformItem[]>([]);
  useEffect(() => { setOrdered(items); }, [items]);
  const dragId = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const reorder = useMutation({
    mutationFn: (ids: string[]) => uniformService.reorderItems(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uniform-items'] }),
    onError: () => {
      enqueueSnackbar('Erreur lors du réordonnancement', { variant: 'error' });
      qc.invalidateQueries({ queryKey: ['uniform-items'] });
    },
  });
  const onCardDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    const from = dragId.current;
    if (!from || from === overId) return;
    setOrdered((prev) => {
      const a = [...prev];
      const fi = a.findIndex((i) => i.id === from);
      const oi = a.findIndex((i) => i.id === overId);
      if (fi < 0 || oi < 0) return prev;
      const [moved] = a.splice(fi, 1);
      a.splice(oi, 0, moved);
      return a;
    });
  };
  const onDragEnd = () => {
    if (dragId.current) reorder.mutate(ordered.map((i) => i.id));
    dragId.current = null;
    setDraggingId(null);
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} mb={2}>
        <Typography variant="h5">Catalogue des uniformes</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setItemDlg(true)}>
          Nouveau morceau
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        <TextField select size="small" label="Division" value={division} onChange={(e) => setDivision(e.target.value as any)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Toutes</MenuItem>
          <MenuItem value="SECURITE">Sécurité</MenuItem>
          <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
        </TextField>
        <TextField size="small" label="Recherche" value={search} onChange={(e) => setSearch(e.target.value)} fullWidth sx={{ maxWidth: 320 }} />
      </Stack>

      {isLoading && <Typography>Chargement…</Typography>}
      {!isLoading && items.length === 0 && <Typography color="text.secondary">Aucun morceau. Lancez le seed ou créez-en un.</Typography>}

      {!isLoading && ordered.length > 0 && (
        <Stack direction="row" alignItems="center" spacing={0.5} mb={1.5} color="text.secondary">
          <DragIndicatorIcon fontSize="small" />
          <Typography variant="caption">
            Glissez les cartes par la poignée (coin haut-gauche) pour les réordonner — du plus utilisé au moins utilisé.
          </Typography>
        </Stack>
      )}

      {/* Grille de cartes */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 2,
        }}
      >
        {ordered.map((item) => {
          const nbSizes = item.variants?.length || 0;
          const frontSum = sumLoc(item.variants, 'FRONT_OFFICE');
          const backSum = sumLoc(item.variants, 'BACK_OFFICE');
          const emplacements = [...new Set((item.variants || []).map((v) => v.emplacement).filter(Boolean))] as string[];
          const isUploading = uploadingId === item.id;
          return (
            <Card
              key={item.id}
              variant="outlined"
              onDragOver={(e) => onCardDragOver(e, item.id)}
              sx={{
                display: 'flex', flexDirection: 'column', position: 'relative',
                opacity: draggingId === item.id ? 0.4 : 1,
                outline: draggingId && draggingId !== item.id ? '1px dashed' : 'none',
                outlineColor: 'primary.light',
              }}
            >
              {/* Poignée de glisser-déposer */}
              <Box
                draggable
                onDragStart={(e) => { dragId.current = item.id; setDraggingId(item.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={onDragEnd}
                title="Glisser pour réordonner"
                sx={{
                  position: 'absolute', top: 4, left: 4, zIndex: 3, cursor: 'grab',
                  display: 'flex', p: 0.25, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.85)',
                  '&:active': { cursor: 'grabbing' },
                }}
              >
                <DragIndicatorIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </Box>

              {/* Zone photo (cliquable pour téléverser) */}
              <Box
                component="label"
                sx={{
                  position: 'relative', height: 150, bgcolor: 'grey.100', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  borderBottom: '1px solid', borderColor: 'divider',
                  '&:hover .photo-overlay': { opacity: 1 },
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage.mutate({ id: item.id, file: f });
                    (e.target as HTMLInputElement).value = '';
                  }}
                />
                {item.imageUrl ? (
                  <Box component="img" src={item.imageUrl} alt={item.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Stack alignItems="center" spacing={0.5} sx={{ color: 'text.disabled' }}>
                    <CheckroomIcon sx={{ fontSize: 40 }} />
                    <Typography variant="caption">Ajouter une photo</Typography>
                  </Stack>
                )}
                {/* Overlay au survol / pendant l'upload */}
                <Box
                  className="photo-overlay"
                  sx={{
                    position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.45)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: isUploading ? 1 : 0, transition: 'opacity 0.2s',
                  }}
                >
                  {isUploading ? <CircularProgress size={28} sx={{ color: '#fff' }} /> : <AddAPhotoIcon />}
                </Box>
              </Box>

              <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.2 }}>{item.name}</Typography>
                <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={item.division === 'SIGNALISATION' ? 'Signalisation' : 'Sécurité'} />
                  <Chip size="small" variant="outlined" label={item.type === 'EQUIPEMENT' ? 'Équipement' : 'Uniforme'} />
                </Stack>
                <Typography variant="body2" color="text.secondary" mt={1}>
                  {money(item.defaultReplacementCost)} · {nbSizes} grandeur{nbSizes > 1 ? 's' : ''}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color="info" variant="outlined" label={`Front ${frontSum}`} />
                  <Chip size="small" color="warning" variant="outlined" label={`Back ${backSum}`} />
                </Stack>
                {emplacements.length > 0 && (
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    Emplacement : {emplacements.join(', ')}
                  </Typography>
                )}
              </CardContent>

              <CardActions sx={{ px: 2, pb: 1.5, pt: 0, justifyContent: 'space-between' }}>
                <Button size="small" startIcon={<StraightenIcon />} onClick={() => setDetailsId(item.id)}>
                  Grandeurs
                </Button>
                <Tooltip title="Imprimer les étiquettes QR (front + back)">
                  <span>
                    <Button
                      size="small"
                      startIcon={<QrCode2Icon />}
                      disabled={nbSizes === 0 || printItemLabels.isPending}
                      onClick={() => printItemLabels.mutate(item)}
                    >
                      QR
                    </Button>
                  </span>
                </Tooltip>
              </CardActions>
            </Card>
          );
        })}
      </Box>

      {/* Nouveau morceau */}
      <Dialog open={itemDlg} onClose={() => setItemDlg(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nouveau morceau</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField select label="Division" value={itemForm.division} onChange={(e) => setItemForm({ ...itemForm, division: e.target.value })}>
              <MenuItem value="SECURITE">Sécurité</MenuItem>
              <MenuItem value="SIGNALISATION">Signalisation</MenuItem>
            </TextField>
            <TextField select label="Type" value={itemForm.type} onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}>
              <MenuItem value="UNIFORME">Uniforme</MenuItem>
              <MenuItem value="EQUIPEMENT">Équipement</MenuItem>
            </TextField>
            <TextField label="Nom" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
            <TextField select label="Taille unique ?" value={itemForm.isOneSize ? 'oui' : 'non'} onChange={(e) => setItemForm({ ...itemForm, isOneSize: e.target.value === 'oui' })}>
              <MenuItem value="non">Non (avec grandeurs)</MenuItem>
              <MenuItem value="oui">Oui (taille unique)</MenuItem>
            </TextField>
            <TextField type="number" label="Coût unitaire ($)" value={itemForm.defaultReplacementCost} onChange={(e) => setItemForm({ ...itemForm, defaultReplacementCost: Number(e.target.value) })} />
            <Typography variant="caption" color="text.secondary">
              La photo s'ajoute ensuite directement sur la carte du morceau.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemDlg(false)}>Annuler</Button>
          <Button variant="contained" disabled={!itemForm.name || createItem.isPending} onClick={() => createItem.mutate()}>Créer</Button>
        </DialogActions>
      </Dialog>

      {/* Détails / grandeurs */}
      <Dialog open={!!detailsItem} onClose={() => setDetailsId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detailsItem?.name} — grandeurs</DialogTitle>
        <DialogContent dividers>
          <Stack direction="row" justifyContent="flex-end" mb={1}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => detailsItem && setVariantDlg(detailsItem)}>
              Ajouter une grandeur
            </Button>
          </Stack>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Grandeur</TableCell>
                  <TableCell>Code-barres</TableCell>
                  <TableCell>Emplacement</TableCell>
                  <TableCell align="right">Coût</TableCell>
                  <TableCell align="right">Front / Back</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(detailsItem?.variants || []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.size}</TableCell>
                    <TableCell><code>{v.barcode}</code></TableCell>
                    <TableCell>{v.emplacement || '—'}</TableCell>
                    <TableCell align="right">{money(v.replacementCost)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        <Tooltip title="Voir / imprimer le QR Front (casier)" arrow>
                          <Chip
                            size="small" color="info" variant="outlined" clickable
                            icon={<QrCode2Icon />} label={locQty(v, 'FRONT_OFFICE')}
                            onClick={() => setQrPreview({ variant: v, location: 'FRONT_OFFICE', itemName: detailsItem?.name || '' })}
                          />
                        </Tooltip>
                        <Tooltip title="Voir / imprimer le QR Back (bac)" arrow>
                          <Chip
                            size="small" color="warning" variant="outlined" clickable
                            icon={<QrCode2Icon />} label={locQty(v, 'BACK_OFFICE')}
                            onClick={() => setQrPreview({ variant: v, location: 'BACK_OFFICE', itemName: detailsItem?.name || '' })}
                          />
                        </Tooltip>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Réapprovisionner">
                        <IconButton size="small" onClick={() => setReplenish({ variantId: v.id, label: `${detailsItem?.name} — ${v.size}` })}>
                          <Inventory2Icon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Imprimer les 2 étiquettes (front + back)">
                        <IconButton size="small" onClick={() => printVariantBoth(v.id)}>
                          <PrintIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {(detailsItem?.variants || []).length === 0 && (
                  <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Aucune grandeur.</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsId(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Nouvelle grandeur */}
      <Dialog open={!!variantDlg} onClose={() => setVariantDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Ajouter une grandeur — {variantDlg?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Grandeur (ex. M, 34, Unique)" value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} />
            <TextField type="number" label="Coût ($) — défaut du morceau si vide" value={variantForm.replacementCost} onChange={(e) => setVariantForm({ ...variantForm, replacementCost: e.target.value })} />
            <TextField type="number" label="Seuil de réappro (optionnel)" value={variantForm.reorderThreshold} onChange={(e) => setVariantForm({ ...variantForm, reorderThreshold: e.target.value })} />
            <TextField label="Emplacement (ex. B4, A1-A2, Étagère)" value={variantForm.emplacement} onChange={(e) => setVariantForm({ ...variantForm, emplacement: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariantDlg(null)}>Annuler</Button>
          <Button variant="contained" disabled={!variantForm.size || createVariant.isPending} onClick={() => createVariant.mutate()}>Ajouter</Button>
        </DialogActions>
      </Dialog>

      {/* Réappro */}
      <Dialog open={!!replenish} onClose={() => setReplenish(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Réapprovisionner</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>{replenish?.label}</Typography>
          <Stack spacing={2}>
            <TextField type="number" fullWidth label="Quantité à ajouter" value={replenishQty} onChange={(e) => setReplenishQty(e.target.value)} />
            <TextField select fullWidth label="Emplacement" value={replenishLoc} onChange={(e) => setReplenishLoc(e.target.value as UniformStockLocation)}>
              <MenuItem value="BACK_OFFICE">Back office (entrepôt)</MenuItem>
              <MenuItem value="FRONT_OFFICE">Front office (comptoir)</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplenish(null)}>Annuler</Button>
          <Button variant="contained" disabled={!replenishQty || doReplenish.isPending} onClick={() => doReplenish.mutate()}>Ajouter au stock</Button>
        </DialogActions>
      </Dialog>

      {/* Aperçu / impression QR par emplacement */}
      <QrPreviewDialog state={qrPreview} onClose={() => setQrPreview(null)} />
    </Box>
  );
}
