import { Suspense, useEffect, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuthStore } from './store/authStore';
import { useClientAuthStore } from './store/clientAuthStore';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CandidatesListPage = lazy(() => import('./pages/candidates/CandidatesListPage'));
const CandidateDetailPage = lazy(() => import('./pages/candidates/CandidateDetailPage'));
const CataloguesPage = lazy(() => import('./pages/catalogues/CataloguesPage'));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'));
const ProspectsPage = lazy(() => import('./pages/prospects/ProspectsPage'));
const ProspectDetailPage = lazy(() => import('./pages/prospects/ProspectDetailPage'));
const CatalogueViewPage = lazy(() => import('./pages/public/CatalogueViewPage'));
const ClientLoginPage = lazy(() => import('./pages/client/ClientLoginPage'));
const ClientDashboardPage = lazy(() => import('./pages/client/ClientDashboardPage'));
const ClientCatalogueDetailPage = lazy(() => import('./pages/client/ClientCatalogueDetailPage'));

function App() {
  const { isAuthenticated, initializeFromStorage } = useAuthStore();
  const { isAuthenticated: isClientAuthenticated, initializeFromStorage: initializeClientFromStorage } = useClientAuthStore();

  useEffect(() => {
    initializeFromStorage();
    initializeClientFromStorage();
  }, [initializeFromStorage, initializeClientFromStorage]);

  const LoadingScreen = () => (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight="60vh" gap={2}>
      <CircularProgress />
      <Typography variant="body1" color="text.secondary">
        Chargement de l'interface en cours...
      </Typography>
    </Box>
  );

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public routes */}
          <Route path="/catalogue/:token" element={<CatalogueViewPage />} />

          {/* Admin auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Client auth routes */}
          <Route path="/client/login" element={<ClientLoginPage />} />

          {/* Client protected routes */}
          <Route
            path="/client/dashboard"
            element={
              isClientAuthenticated ? <ClientDashboardPage /> : <Navigate to="/client/login" replace />
            }
          />
          <Route
            path="/client/catalogue/:id"
            element={
              isClientAuthenticated ? <ClientCatalogueDetailPage /> : <Navigate to="/client/login" replace />
            }
          />

          {/* Protected routes */}
          <Route
            element={
              isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/candidates" element={<CandidatesListPage />} />
            <Route path="/candidates/:id" element={<CandidateDetailPage />} />
            <Route path="/prospects" element={<ProspectsPage />} />
            <Route path="/prospects/:id" element={<ProspectDetailPage />} />
            <Route path="/catalogues" element={<CataloguesPage />} />
            <Route path="/clients" element={<ClientsPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
