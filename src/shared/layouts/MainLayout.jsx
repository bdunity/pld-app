import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/context/AuthContext';
import { ChatbotWidget } from '../../modules/support/components/ChatbotWidget';
import {
  LayoutDashboard,
  Upload,
  AlertTriangle,
  Eye,
  FileCode,
  FolderLock,
  BarChart3,
  CreditCard,
  HelpCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Shield,
  ShoppingBag,
  GraduationCap,
  ScrollText,
  Building2,
  Users,
  ClipboardList,
  Wrench,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Carga de Datos', href: '/ingest', icon: Upload },
  { name: 'Motor de Riesgo', href: '/risk-engine', icon: AlertTriangle },
  { name: 'Monitoreo', href: '/monitoring', icon: Eye },
  { name: 'Generador XML', href: '/xml-factory', icon: FileCode },
  { name: 'Bóveda Digital', href: '/compliance-vault', icon: FolderLock },
  { name: 'Capacitación', href: '/capacitacion', icon: GraduationCap },
  { name: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Facturación', href: '/billing', icon: CreditCard },
  { name: 'Soporte', href: '/support', icon: HelpCircle },
];

const adminNavigation = [
  { name: 'Panel Admin', href: '/admin', icon: LayoutDashboard },
  { name: 'Empresas', href: '/admin/tenants', icon: Building2 },
  { name: 'Leads', href: '/admin/leads', icon: Users },
  { name: 'Servicios', href: '/admin/fulfillment', icon: Wrench },
  { name: 'Auditoría', href: '/admin/audit', icon: ClipboardList },
];

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-secondary-200
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-secondary-200">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-secondary-900">PLD BDU</h1>
            <p className="text-xs text-secondary-500">Cumplimiento Legal</p>
          </div>
          <button
            className="lg:hidden ml-auto p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-1 overflow-y-auto h-[calc(100vh-180px)] scrollbar-thin">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900'
                }
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}

          {/* Admin Section - Solo para Super Admins */}
          {isSuperAdmin && (
            <>
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-semibold text-secondary-400 uppercase tracking-wider">
                  Administración
                </p>
              </div>
              {adminNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-colors duration-200
                    ${isActive
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900'
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-secondary-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-700">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-secondary-900 truncate">
                {user?.email || 'Usuario'}
              </p>
              <p className="text-xs text-secondary-500 truncate">
                {user?.role || 'user'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top navbar */}
        <header className="sticky top-0 z-30 bg-white border-b border-secondary-200">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-secondary-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-secondary-600" />
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* User menu */}
            <div className="relative">
              <button
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary-100"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary-700">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-secondary-500" />
              </button>

              {/* Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-secondary-200 py-1">
                  <NavLink
                    to="/settings"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-100"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4" />
                    Configuración
                  </NavLink>
                  <NavLink
                    to="/settings/audit"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-100"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ScrollText className="w-4 h-4" />
                    Bitácora
                  </NavLink>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Chatbot Widget - Flotante global */}
      <ChatbotWidget />
    </div>
  );
}

export default MainLayout;
