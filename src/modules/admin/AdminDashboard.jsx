import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../core/config/firebase';
import { Link } from 'react-router-dom';
import {
  Users,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  ArrowRight,
  Building2,
} from 'lucide-react';

export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        // Cargar tenants desde Firestore
        const tenantsSnapshot = await getDocs(collection(db, 'tenants'));
        const tenants = tenantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Calcular estadísticas
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const statsData = {
          tenants: {
            total: tenants.length,
            active: tenants.filter(t => t.status !== 'suspended').length,
            suspended: tenants.filter(t => t.status === 'suspended').length,
            newThisMonth: tenants.filter(t => new Date(t.createdAt) >= startOfMonth).length,
            byPlan: tenants.reduce((acc, t) => {
              const plan = t.plan || 'basico';
              acc[plan] = (acc[plan] || 0) + 1;
              return acc;
            }, {}),
            byGiro: tenants.reduce((acc, t) => {
              const giro = t.giro || 'Sin especificar';
              acc[giro] = (acc[giro] || 0) + 1;
              return acc;
            }, {}),
          },
          leads: {
            pending: 0,
            inProgress: 0,
          },
          revenue: {
            estimated: tenants.length * 2500,
          },
        };

        setStats(statsData);
      } catch (err) {
        console.error('Error loading admin stats:', err);
        setError('Error al cargar estadísticas');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-secondary-900">Dashboard Administrativo</h1>
        <p className="text-secondary-500 mt-1">Resumen de la plataforma PLD BDU</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tenants */}
        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary-500 text-sm">Total Empresas</p>
              <p className="text-3xl font-bold text-secondary-900 mt-1">
                {stats?.tenants?.total || 0}
              </p>
              <p className="text-xs text-green-600 mt-1">
                +{stats?.tenants?.newThisMonth || 0} este mes
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Active Tenants */}
        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary-500 text-sm">Empresas Activas</p>
              <p className="text-3xl font-bold text-secondary-900 mt-1">
                {stats?.tenants?.active || 0}
              </p>
              <p className="text-xs text-red-500 mt-1">
                {stats?.tenants?.suspended || 0} suspendidas
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Leads Pendientes */}
        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary-500 text-sm">Leads Pendientes</p>
              <p className="text-3xl font-bold text-secondary-900 mt-1">
                {stats?.leads?.pending || 0}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {stats?.leads?.inProgress || 0} en proceso
              </p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl border border-secondary-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary-500 text-sm">Revenue Estimado</p>
              <p className="text-3xl font-bold text-secondary-900 mt-1">
                ${(stats?.revenue?.estimated || 0).toLocaleString()}
              </p>
              <p className="text-xs text-secondary-400 mt-1">MXN / mes</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenants by Plan */}
        <div className="bg-white rounded-xl border border-secondary-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Empresas por Plan</h3>
          <div className="space-y-3">
            {Object.entries(stats?.tenants?.byPlan || {}).length > 0 ? (
              Object.entries(stats?.tenants?.byPlan || {}).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between">
                  <span className="text-secondary-600 capitalize">{plan}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-secondary-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{
                          width: `${(count / (stats?.tenants?.total || 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-secondary-900 font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-secondary-400 text-sm">No hay datos disponibles</p>
            )}
          </div>
        </div>

        {/* Tenants by Giro */}
        <div className="bg-white rounded-xl border border-secondary-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Empresas por Giro</h3>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {Object.entries(stats?.tenants?.byGiro || {}).length > 0 ? (
              Object.entries(stats?.tenants?.byGiro || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([giro, count]) => (
                  <div key={giro} className="flex items-center justify-between">
                    <span className="text-secondary-600 truncate max-w-[200px]">{giro}</span>
                    <span className="text-secondary-900 font-medium">{count}</span>
                  </div>
                ))
            ) : (
              <p className="text-secondary-400 text-sm">No hay datos disponibles</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/admin/tenants"
          className="bg-white rounded-xl border border-secondary-200 p-5 hover:border-primary-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-secondary-900">Ver Empresas</p>
                <p className="text-xs text-secondary-500">Gestionar tenants</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-600 transition-colors" />
          </div>
        </Link>

        <Link
          to="/admin/leads"
          className="bg-white rounded-xl border border-secondary-200 p-5 hover:border-primary-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-secondary-900">Ver Leads</p>
                <p className="text-xs text-secondary-500">Solicitudes pendientes</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-600 transition-colors" />
          </div>
        </Link>

        <Link
          to="/admin/fulfillment"
          className="bg-white rounded-xl border border-secondary-200 p-5 hover:border-primary-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-secondary-900">Entregas</p>
                <p className="text-xs text-secondary-500">Entregar servicios</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-600 transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  );
}

export default AdminDashboard;
