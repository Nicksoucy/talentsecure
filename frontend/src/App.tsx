import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import ErrorBoundary from './components/ErrorBoundary';
import RequireRole from './components/RequireRole';
import { useAuthStore } from './store/authStore';
import { useClientAuthStore } from './store/clientAuthStore';

// Atterrissage selon le rôle : les profils MAGASIN ne voient pas /dashboard.
function HomeRedirect() {
  const role = useAuthStore((s) => s.user?.role);
  const isMagasin = role === 'MAGASIN' || role === 'MAGASIN_GESTION';
  return <Navigate to={isMagasin ? '/uniformes' : '/dashboard'} replace />;
}

// Rôles staff hors MAGASIN (sections recrutement que les magasins ne voient pas).
const STAFF_NO_MAGASIN: Array<'ADMIN' | 'RH_RECRUITER' | 'SALES'> = ['ADMIN', 'RH_RECRUITER', 'SALES'];

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CandidatesListPage = lazy(() => import('./pages/candidates/CandidatesListPage'));
const CandidateDetailPage = lazy(() => import('./pages/candidates/CandidateDetailPage'));
const CataloguesPage = lazy(() => import('./pages/catalogues/CataloguesPage'));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/clients/ClientDetailPage'));


const EmployeesPage = lazy(() => import('./pages/employees/EmployeesPage'));
const EmployeeDetailPage = lazy(() => import('./pages/employees/EmployeeDetailPage'));
const ProspectsPage = lazy(() => import('./pages/prospects/ProspectsPage'));
const ProspectDetailPage = lazy(() => import('./pages/prospects/ProspectDetailPage'));
const ProspectConvertPage = lazy(() => import('./pages/prospects/ProspectConvertPage'));
const AutresCompetancesPage = lazy(() => import('./pages/autres-competances/AutresCompetancesPage'));
const WishlistsPage = lazy(() => import('./pages/wishlists/WishlistsPage'));
const ExportPage = lazy(() => import('./pages/exports/ExportPage'));
const CatalogueViewPage = lazy(() => import('./pages/public/CatalogueViewPage'));
const UniformSignPage = lazy(() => import('./pages/public/UniformSignPage'));
const UniformsHubPage = lazy(() => import('./pages/uniformes/UniformsHubPage'));
const UniformsCataloguePage = lazy(() => import('./pages/uniformes/UniformsCataloguePage'));
const UniformInventoryPage = lazy(() => import('./pages/uniformes/UniformInventoryPage'));
const UniformIssuanceWizardPage = lazy(() => import('./pages/uniformes/UniformIssuanceWizardPage'));
const UniformReturnsPage = lazy(() => import('./pages/uniformes/UniformReturnsPage'));
const UniformReportsPage = lazy(() => import('./pages/uniformes/UniformReportsPage'));
const UniformWashBatchesPage = lazy(() => import('./pages/uniformes/UniformWashBatchesPage'));
const ClientLoginPage = lazy(() => import('./pages/client/ClientLoginPage'));
const ClientRegisterPage = lazy(() => import('./pages/client/ClientRegisterPage'));
const ClientDashboardPage = lazy(() => import('./pages/client/ClientDashboardPage'));
const TalentMarketplacePage = lazy(() => import('./pages/client/TalentMarketplacePage'));
const ClientPurchasesPage = lazy(() => import('./pages/client/ClientPurchasesPage'));
const ClientCatalogueDetailPage = lazy(() => import('./pages/client/ClientCatalogueDetailPage'));
const UsersAdminPage = lazy(() => import('./pages/users/UsersAdminPage'));

function App() {
  // Les stores s'initialisent SYNCHRONIQUEMENT depuis localStorage à leur création
  // (cf. getInitialAuthState dans authStore.ts), donc isAuthenticated est déjà
  // correct dès le premier render — plus besoin d'un useEffect de réhydratation.
  const { isAuthenticated, user } = useAuthStore();
  const { isAuthenticated: isClientAuthenticated } = useClientAuthStore();

  // Defense in depth: even if a client token somehow ended up in the admin
  // store (token swap, manual localStorage tampering, etc.), block access
  // to the admin panel unless the role is one of the staff roles.
  const ADMIN_ROLES = ['ADMIN', 'RH_RECRUITER', 'SALES', 'MAGASIN', 'MAGASIN_GESTION'];
  const canAccessAdminPanel = isAuthenticated && !!user?.role && ADMIN_ROLES.includes(user.role);

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
          <Route path="/uniformes/signer/:token" element={<UniformSignPage />} />

          {/* Admin auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Client auth routes */}
          <Route path="/client/login" element={<ClientLoginPage />} />
          <Route path="/client/register" element={<ClientRegisterPage />} />

          {/* Client protected routes */}
          <Route
            path="/client/dashboard"
            element={
              isClientAuthenticated ? <ClientDashboardPage /> : <Navigate to="/client/login" replace />
            }
          />
          <Route
            path="/client/talents"
            element={
              isClientAuthenticated ? <TalentMarketplacePage /> : <Navigate to="/client/login" replace />
            }
          />
          <Route
            path="/client/purchases"
            element={
              isClientAuthenticated ? <ClientPurchasesPage /> : <Navigate to="/client/login" replace />
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
              canAccessAdminPanel ? <MainLayout /> : <Navigate to="/login" replace />
            }
          >
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/dashboard" element={<RequireRole roles={STAFF_NO_MAGASIN}><DashboardPage /></RequireRole>} />
            <Route path="/candidates" element={<RequireRole roles={STAFF_NO_MAGASIN}><CandidatesListPage /></RequireRole>} />
            <Route path="/candidates/:id" element={<RequireRole roles={STAFF_NO_MAGASIN}><CandidateDetailPage /></RequireRole>} />
            {/* Employés : visibles aussi par MAGASIN (lecture seule) */}
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/employees/:id" element={<EmployeeDetailPage />} />
            <Route path="/prospects" element={<RequireRole roles={STAFF_NO_MAGASIN}><ProspectsPage /></RequireRole>} />
            <Route path="/prospects/:id" element={<RequireRole roles={STAFF_NO_MAGASIN}><ProspectDetailPage /></RequireRole>} />
            <Route path="/prospects/:id/convert" element={<RequireRole roles={STAFF_NO_MAGASIN}><ProspectConvertPage /></RequireRole>} />
            <Route path="/catalogues" element={<RequireRole roles={STAFF_NO_MAGASIN}><CataloguesPage /></RequireRole>} />
            <Route path="/clients" element={<RequireRole roles={STAFF_NO_MAGASIN}><ClientsPage /></RequireRole>} />
            <Route path="/clients/:id" element={<RequireRole roles={STAFF_NO_MAGASIN}><ClientDetailPage /></RequireRole>} />
            <Route path="/autres-competances" element={<RequireRole roles={STAFF_NO_MAGASIN}><AutresCompetancesPage /></RequireRole>} />
            <Route path="/wishlists" element={<RequireRole roles={STAFF_NO_MAGASIN}><WishlistsPage /></RequireRole>} />
            <Route path="/exports" element={<RequireRole roles={STAFF_NO_MAGASIN}><ExportPage /></RequireRole>} />
            {/* Gestion des comptes : ADMIN uniquement */}
            <Route path="/users" element={<RequireRole roles={['ADMIN']}><UsersAdminPage /></RequireRole>} />
            {/* Uniformes : ADMIN, RH, MAGASIN (lecture seule) */}
            <Route
              path="/uniformes"
              element={<RequireRole roles={['ADMIN', 'RH_RECRUITER', 'MAGASIN', 'MAGASIN_GESTION']}><UniformsHubPage /></RequireRole>}
            >
              <Route index element={<UniformsCataloguePage />} />
              <Route path="inventaire" element={<UniformInventoryPage />} />
              <Route path="remises/nouvelle" element={<UniformIssuanceWizardPage />} />
              <Route path="retours" element={<UniformReturnsPage />} />
              <Route path="lavage" element={<UniformWashBatchesPage />} />
              <Route path="lavage/:id" element={<UniformWashBatchesPage />} />
              <Route path="rapports" element={<UniformReportsPage />} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;

