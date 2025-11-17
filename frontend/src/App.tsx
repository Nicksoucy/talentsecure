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
import { useAuthStore } from './store/authStore';

function App() {
  const { isAuthenticated, initializeFromStorage } = useAuthStore();

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    initializeFromStorage();
  }, [initializeFromStorage]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/catalogue/:token" element={<CatalogueViewPage />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

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
