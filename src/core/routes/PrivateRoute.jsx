import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

// Loading screen component
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
        <p className="text-secondary-600">Verificando sesión...</p>
      </div>
    </div>
  );
}

/**
 * PrivateRoute - Protege rutas que requieren autenticación
 *
 * Lógica:
 * 1. Si está cargando -> Mostrar loading
 * 2. Si NO está autenticado -> Redirigir a /login
 * 3. Si está autenticado pero NO completó onboarding -> Redirigir a /onboarding
 * 4. Si está autenticado Y completó onboarding -> Mostrar contenido
 */
export function PrivateRoute({ children }) {
  const { user, loading, checkingTenant, hasCompletedOnboarding } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras verifica auth o tenant
  if (loading || checkingTenant) {
    return <LoadingScreen />;
  }

  // Si no está autenticado, redirigir a login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si está autenticado pero no completó onboarding, redirigir a onboarding
  // Excepción: si ya está en /onboarding, permitir
  if (!hasCompletedOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Todo bien, mostrar el contenido protegido
  return children;
}

/**
 * OnboardingRoute - Ruta especial para el onboarding
 *
 * Lógica:
 * 1. Si está cargando -> Mostrar loading
 * 2. Si NO está autenticado -> Redirigir a /login
 * 3. Si YA completó onboarding -> Redirigir a /dashboard
 * 4. Si está autenticado y NO completó onboarding -> Mostrar onboarding
 */
export function OnboardingRoute({ children }) {
  const { user, loading, checkingTenant, hasCompletedOnboarding } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras verifica auth o tenant
  if (loading || checkingTenant) {
    return <LoadingScreen />;
  }

  // Si no está autenticado, redirigir a login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si ya completó onboarding, redirigir al dashboard
  if (hasCompletedOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }

  // Mostrar onboarding
  return children;
}

/**
 * PublicRoute - Rutas públicas que redirigen si ya está autenticado
 *
 * Lógica:
 * 1. Si está cargando -> Mostrar loading
 * 2. Si está autenticado y completó onboarding -> Redirigir a /dashboard
 * 3. Si está autenticado pero NO completó onboarding -> Redirigir a /onboarding
 * 4. Si NO está autenticado -> Mostrar contenido público
 */
export function PublicRoute({ children }) {
  const { user, loading, checkingTenant, hasCompletedOnboarding } = useAuth();

  // Mostrar loading mientras verifica auth
  if (loading || checkingTenant) {
    return <LoadingScreen />;
  }

  // Si está autenticado, redirigir según estado de onboarding
  if (user) {
    if (hasCompletedOnboarding) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  // Mostrar contenido público
  return children;
}

export default PrivateRoute;
