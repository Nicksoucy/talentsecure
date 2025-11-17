import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CandidatesListPage from './pages/candidates/CandidatesListPage';
import CandidateDetailPage from './pages/candidates/CandidateDetailPage';
import CataloguesPage from './pages/catalogues/CataloguesPage';
import ClientsPage from './pages/clients/ClientsPage';
import ProspectsPage from './pages/prospects/ProspectsPage';
import ProspectDetailPage from './pages/prospects/ProspectDetailPage';
import CatalogueViewPage from './pages/public/CatalogueViewPage';
import ClientLoginPage from './pages/client/ClientLoginPage';
import ClientDashboardPage from './pages/client/ClientDashboardPage';
import ClientCatalogueDetailPage from './pages/client/ClientCatalogueDetailPage';
import { useAuthStore } from './store/authStore';
import { useClientAuthStore } from './store/clientAuthStore';

function App() {
  const { isAuthenticated, initializeFromStorage } = useAuthStore();
  const { isAuthenticated: isClientAuthenticated, initializeFromStorage: initializeClientFromStorage } = useClientAuthStore();

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    initializeFromStorage();
    initializeClientFromStorage();
  }, [initializeFromStorage, initializeClientFromStorage]);

  return (
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
  );
}

export default App;
