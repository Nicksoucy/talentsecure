import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Dialog,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  TextField,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import {
  peopleSearchService,
  PeopleSearchHit,
  PeopleSection,
} from '@/services/peopleSearch.service';

const SECTION_META: Record<PeopleSection, { route: string; label: string; color: 'primary' | 'secondary' | 'default' }> = {
  employee: { route: '/employees', label: 'Employés', color: 'primary' },
  candidate: { route: '/candidates', label: 'Candidats', color: 'secondary' },
  prospect: { route: '/prospects', label: 'Candidats potentiels', color: 'default' },
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Omnibox global (Cmd/Ctrl+K) : recherche simultanée employés + candidats +
 * prospects (moteur tokenisé/accent-insensible/flou côté backend, rôle-aware).
 * Résultats groupés par type, chaque ligne ouvre la fiche détaillée.
 */
export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Raccourci clavier global Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounce de la requête.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Réinitialise à la fermeture.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
    }
  }, [open]);

  const term = debounced.trim();
  const { data, isFetching } = useQuery({
    queryKey: ['globalSearch', term],
    queryFn: () => peopleSearchService.searchAll(term, 6),
    enabled: open && term.length >= 2,
    staleTime: 60_000,
  });

  const groups: Array<{ section: PeopleSection; hits: PeopleSearchHit[] }> = useMemo(() => {
    if (!data) return [];
    return [
      { section: 'employee' as const, hits: data.employees },
      { section: 'candidate' as const, hits: data.candidates },
      { section: 'prospect' as const, hits: data.prospects },
    ].filter((g) => g.hits.length > 0);
  }, [data]);

  const totalHits = groups.reduce((n, g) => n + g.hits.length, 0);

  const goTo = (hit: PeopleSearchHit) => {
    setOpen(false);
    navigate(`${SECTION_META[hit.section].route}/${hit.id}`);
  };

  return (
    <>
      {/* Déclencheur dans la barre du haut */}
      <Box
        onClick={() => setOpen(true)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.5,
          mr: 1,
          borderRadius: 1,
          cursor: 'pointer',
          color: 'inherit',
          bgcolor: 'rgba(255,255,255,0.15)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
          minWidth: { xs: 'auto', sm: 220 },
        }}
      >
        <SearchIcon fontSize="small" />
        <Typography variant="body2" sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }}>
          Rechercher une personne…
        </Typography>
        <Chip
          label={isMac ? '⌘K' : 'Ctrl K'}
          size="small"
          sx={{ display: { xs: 'none', sm: 'flex' }, height: 20, bgcolor: 'rgba(255,255,255,0.25)', color: 'inherit' }}
        />
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { position: 'fixed', top: 80, m: 0 } }}
      >
        <TextField
          autoFocus
          fullWidth
          placeholder="Nom, email ou téléphone — employés, candidats, prospects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          variant="outlined"
          sx={{ p: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isFetching ? <CircularProgress size={18} /> : <SearchIcon />}
              </InputAdornment>
            ),
          }}
        />
        <Divider />
        <Box sx={{ maxHeight: 440, overflowY: 'auto' }}>
          {term.length < 2 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Tapez au moins 2 caractères. Astuce : accents, ordre des noms et format du téléphone n'ont pas d'importance.
            </Typography>
          ) : !isFetching && totalHits === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Aucune personne trouvée pour « {term} ».
            </Typography>
          ) : (
            <List dense disablePadding>
              {groups.map((g) => (
                <li key={g.section}>
                  <ul style={{ padding: 0 }}>
                    <ListSubheader sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper' }}>
                      {SECTION_META[g.section].label}
                      <Chip label={g.hits.length} size="small" color={SECTION_META[g.section].color} />
                    </ListSubheader>
                    {g.hits.map((hit) => (
                      <ListItemButton key={`${g.section}-${hit.id}`} onClick={() => goTo(hit)}>
                        <ListItemText
                          primary={`${hit.firstName} ${hit.lastName}`.trim()}
                          secondary={hit.email || undefined}
                        />
                      </ListItemButton>
                    ))}
                  </ul>
                </li>
              ))}
            </List>
          )}
        </Box>
      </Dialog>
    </>
  );
}
