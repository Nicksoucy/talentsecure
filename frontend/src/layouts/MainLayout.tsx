import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  PersonSearch as PersonSearchIcon,
  Description as DescriptionIcon,
  Business as BusinessIcon,
  Logout as LogoutIcon,
  WorkOutline as WorkIcon,
  ShoppingCart as ShoppingCartIcon,
  Badge as BadgeIcon,
  Checkroom as CheckroomIcon,
  ManageAccounts as ManageAccountsIcon,
} from '@mui/icons-material';
import { useAuthStore } from '@/store/authStore';
import { usePerms } from '@/hooks/usePerms';
import NotificationBell from './components/NotificationBell';
import GlobalSearchBar from '@/components/GlobalSearch/GlobalSearchBar';
import { authService } from '@/services/auth.service';

const DRAWER_WIDTH = 240;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
      navigate('/login');
    }
  };

  const { canViewUniforms, canManageUsers, isMagasinAny } = usePerms();

  // Menu filtré par rôle. Les profils MAGASIN (lecture seule ET gestion) ne
  // voient que Employés + Uniformes — pas le côté recrutement.
  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', show: !isMagasinAny },
    { text: 'Candidats', icon: <PeopleIcon />, path: '/candidates', show: !isMagasinAny },
    { text: 'Employés', icon: <BadgeIcon />, path: '/employees', show: true },
    { text: 'Candidats Potentiels', icon: <PersonSearchIcon />, path: '/prospects', show: !isMagasinAny },
    { text: 'Catalogues', icon: <DescriptionIcon />, path: '/catalogues', show: !isMagasinAny },
    { text: 'Clients', icon: <BusinessIcon />, path: '/clients', show: !isMagasinAny },
    { text: 'Demandes Clients', icon: <ShoppingCartIcon />, path: '/wishlists', show: !isMagasinAny },
    { text: 'Autre Compétence', icon: <WorkIcon />, path: '/autres-competances', show: !isMagasinAny },
    { text: 'Uniformes', icon: <CheckroomIcon />, path: '/uniformes', show: canViewUniforms },
    { text: 'Utilisateurs', icon: <ManageAccountsIcon />, path: '/users', show: canManageUsers },
  ].filter((item) => item.show);

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          TalentSecure
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find((item) => item.path === location.pathname)?.text ||
              'TalentSecure'}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GlobalSearchBar />
            <NotificationBell />
            <Typography variant="body2" sx={{ ml: 1 }}>
              {user?.firstName} {user?.lastName}
            </Typography>
            <IconButton onClick={handleMenuOpen} size="small">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.firstName[0]}
                {user?.lastName[0]}
              </Avatar>
            </IconButton>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                {user?.role}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Déconnexion
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: 8,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;

