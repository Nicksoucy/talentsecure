import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import { usePerms } from '@/hooks/usePerms';

// `write: true` = onglet menant à un flux d'écriture (masqué en lecture seule).
const ALL_TABS = [
  { label: 'Catalogue', path: '/uniformes', match: (p: string) => p === '/uniformes' || p === '/uniformes/' },
  { label: 'Inventaire', path: '/uniformes/inventaire', match: (p: string) => p.startsWith('/uniformes/inventaire') },
  { label: 'Remise', path: '/uniformes/remises/nouvelle', match: (p: string) => p.startsWith('/uniformes/remises'), write: true },
  { label: 'Retour', path: '/uniformes/retours', match: (p: string) => p.startsWith('/uniformes/retours'), write: true },
  { label: 'Lots de lavage', path: '/uniformes/lavage', match: (p: string) => p.startsWith('/uniformes/lavage') },
  { label: 'Rapports', path: '/uniformes/rapports', match: (p: string) => p.startsWith('/uniformes/rapports') },
];

/**
 * Hub du module Uniformes : une seule entrée dans le menu, sous-onglets en haut.
 * Le contenu de chaque onglet est rendu via <Outlet /> (routes enfants).
 * En lecture seule (MAGASIN), les onglets d'écriture (Remise, Retour) sont masqués.
 */
export default function UniformsHubPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canWriteUniforms } = usePerms();

  const tabs = ALL_TABS.filter((t) => canWriteUniforms || !t.write);
  let active = tabs.findIndex((t) => t.match(pathname));
  if (active < 0) active = 0;

  return (
    <Box>
      <Tabs
        value={active}
        onChange={(_, v) => navigate(tabs[v].path)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t) => <Tab key={t.path} label={t.label} />)}
      </Tabs>
      <Outlet />
    </Box>
  );
}
