import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './core/context/AuthContext';
import { TenantProvider } from './core/context/TenantContext';
import { PrivateRoute, OnboardingRoute, PublicRoute } from './core/routes';

// Layouts
import { MainLayout, AuthLayout } from './shared/layouts';
import { AdminLayout } from './shared/layouts/AdminLayout';

// Loading component
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-secondary-50">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-secondary-600">Cargando...</p>
    </div>
  </div>
);

// Lazy load modules
const Login = lazy(() => import('./modules/auth/Login'));
const Register = lazy(() => import('./modules/auth/Register'));
const Recovery = lazy(() => import('./modules/auth/Recovery'));
const Wizard = lazy(() => import('./modules/onboarding/Wizard'));
const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'));
const IngestPage = lazy(() => import('./modules/ingest/IngestPage'));
const RiskEnginePage = lazy(() => import('./modules/risk-engine/RiskEnginePage'));
const XmlFactoryPage = lazy(() => import('./modules/xml-factory/XmlFactoryPage'));
const ComplianceVaultPage = lazy(() => import('./modules/compliance-vault/ComplianceVaultPage'));
const AnalyticsPage = lazy(() => import('./modules/analytics/AnalyticsPage'));
const BillingPage = lazy(() => import('./modules/billing/BillingPage'));
const SupportPage = lazy(() => import('./modules/support/SupportPage'));
const AdminPage = lazy(() => import('./modules/admin/AdminPage'));
const MarketplacePage = lazy(() => import('./modules/marketplace/MarketplacePage'));
const LMSPage = lazy(() => import('./modules/lms/LMSPage'));
const AuditLogView = lazy(() => import('./modules/settings/AuditLogView'));

// Admin module pages
const AdminDashboard = lazy(() => import('./modules/admin/AdminDashboard'));
const TenantList = lazy(() => import('./modules/admin/components/TenantList'));
const LeadsList = lazy(() => import('./modules/admin/components/LeadsList'));
const ServiceFulfillment = lazy(() => import('./modules/admin/components/ServiceFulfillment'));
const AuditLog = lazy(() => import('./modules/admin/components/AuditLog'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              {/* ========================================
                  RUTAS PÚBLICAS (Login, Register, Recovery)
                  Redirigen al dashboard si ya está autenticado
                  ======================================== */}
              <Route
                element={
                  <PublicRoute>
                    <AuthLayout />
                  </PublicRoute>
                }
              >
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/recovery" element={<Recovery />} />
              </Route>

              {/* ========================================
                  ONBOARDING (Wizard Fiscal)
                  Solo accesible si está autenticado pero
                  NO ha completado el onboarding
                  ======================================== */}
              <Route
                path="/onboarding"
                element={
                  <OnboardingRoute>
                    <Wizard />
                  </OnboardingRoute>
                }
              />

              {/* ========================================
                  RUTAS PROTEGIDAS (Dashboard y módulos)
                  Requieren auth + onboarding completado
                  ======================================== */}
              <Route
                element={
                  <PrivateRoute>
                    <MainLayout />
                  </PrivateRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/ingest" element={<IngestPage />} />
                <Route path="/risk-engine" element={<RiskEnginePage />} />
                <Route path="/xml-factory" element={<XmlFactoryPage />} />
                <Route path="/compliance-vault" element={<ComplianceVaultPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/marketplace" element={<MarketplacePage />} />
                <Route path="/capacitacion" element={<LMSPage />} />
                <Route path="/settings/audit" element={<AuditLogView />} />
              </Route>

              {/* ========================================
                  RUTAS DE ADMIN (Super Admin Panel)
                  Requieren auth + rol de admin
                  ======================================== */}
              <Route
                element={
                  <PrivateRoute>
                    <AdminLayout />
                  </PrivateRoute>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/tenants" element={<TenantList />} />
                <Route path="/admin/leads" element={<LeadsList />} />
                <Route path="/admin/fulfillment" element={<ServiceFulfillment />} />
                <Route path="/admin/audit" element={<AuditLog />} />
              </Route>

              {/* ========================================
                  REDIRECCIONES POR DEFECTO
                  ======================================== */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
