import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/context/AuthContext';
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  FileCheck,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Shield,
  Bell,
  ScrollText,
} from 'lucide-react';

const adminNavigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Tenants', href: '/admin/tenants', icon: Users },
  { name: 'Leads', href: '/admin/leads', icon: ShoppingBag },
  { name: 'Entregas', href: '/admin/fulfillment', icon: FileCheck },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Audit Log', href: '/admin/audit', icon: ScrollText },
];

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-secondary-900">
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
          fixed top-0 left-0 z-50 h-full w-64 bg-secondary-800 border-r border-secondary-700
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-secondary-700">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">PLD BDU</h1>
            <p className="text-xs text-red-400">Super Admin</p>
          </div>
          <button
            className="lg:hidden ml-auto p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5 text-secondary-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-1 overflow-y-auto h-[calc(100vh-180px)] scrollbar-thin">
          {adminNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/admin'}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${isActive
                  ? 'bg-red-600/20 text-red-400'
                  : 'text-secondary-300 hover:bg-secondary-700 hover:text-white'
                }
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-secondary-700 bg-secondary-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600/20 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-red-400">
                {user?.email?.charAt(0).toUpperCase() || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.email || 'Admin'}
              </p>
              <p className="text-xs text-red-400 truncate">Super Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top navbar */}
        <header className="sticky top-0 z-30 bg-secondary-800 border-b border-secondary-700">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-secondary-700"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-secondary-300" />
            </button>

            {/* Breadcrumb / Title */}
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold text-white">Panel de Administración</h2>
            </div>

            {/* Spacer */}
            <div className="flex-1 lg:hidden" />

            {/* Right side */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button className="p-2 rounded-lg hover:bg-secondary-700 relative">
                <Bell className="w-5 h-5 text-secondary-300" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              {/* User menu */}
              <div className="relative">
                <button
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary-700"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <div className="w-8 h-8 bg-red-600/20 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-red-400">
                      {user?.email?.charAt(0).toUpperCase() || 'A'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-secondary-400" />
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-secondary-700 rounded-lg shadow-lg border border-secondary-600 py-1">
                    <NavLink
                      to="/admin/settings"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-secondary-200 hover:bg-secondary-600"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings className="w-4 h-4" />
                      Configuración
                    </NavLink>
                    <NavLink
                      to="/dashboard"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-secondary-200 hover:bg-secondary-600"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Vista Usuario
                    </NavLink>
                    <hr className="my-1 border-secondary-600" />
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-secondary-600"
                    >
                      <LogOut className="w-4 h-4" />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 bg-secondary-900 min-h-[calc(100vh-64px)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
