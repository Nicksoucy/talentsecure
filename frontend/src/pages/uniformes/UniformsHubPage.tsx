import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';

const TABS = [
  { label: 'Catalogue', path: '/uniformes' },
  { label: 'Inventaire', path: '/uniformes/inventaire' },
  { label: 'Remise', path: '/uniformes/remises/nouvelle' },
  { label: 'Retour', path: '/uniformes/retours' },
  { label: 'Lots de lavage', path: '/uniformes/lavage' },
  { label: 'Rapports', path: '/uniformes/rapports' },
];

/**
 * Hub du module Uniformes : une seule entrée dans le menu, sous-onglets en haut.
 * Le contenu de chaque onglet est rendu via <Outlet /> (routes enfants).
 */
export default function UniformsHubPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  let active = 0;
  if (pathname.startsWith('/uniformes/inventaire')) active = 1;
  else if (pathname.startsWith('/uniformes/remises')) active = 2;
  else if (pathname.startsWith('/uniformes/retours')) active = 3;
  else if (pathname.startsWith('/uniformes/lavage')) active = 4;
  else if (pathname.startsWith('/uniformes/rapports')) active = 5;

  return (
    <Box>
      <Tabs
        value={active}
        onChange={(_, v) => navigate(TABS[v].path)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => <Tab key={t.path} label={t.label} />)}
      </Tabs>
      <Outlet />
    </Box>
  );
}
