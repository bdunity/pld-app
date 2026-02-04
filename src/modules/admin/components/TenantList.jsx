import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../core/config/firebase';
import {
  Search,
  Filter,
  MoreVertical,
  UserCheck,
  UserX,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Building2,
} from 'lucide-react';

export function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(null);

  const loadTenants = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const getAllTenants = httpsCallable(functions, 'getAllTenants');
      const result = await getAllTenants({
        page,
        limit: 20,
        status: statusFilter,
        search,
      });
      setTenants(result.data.tenants || []);
      setPagination(result.data.pagination);
    } catch (err) {
      console.error('Error loading tenants:', err);
      setError('Error al cargar tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadTenants(1);
  };

  const handleToggleStatus = async (tenantId, currentStatus) => {
    const action = currentStatus === 'SUSPENDED' ? 'ACTIVATE' : 'SUSPEND';
    const confirmMessage =
      action === 'SUSPEND'
        ? '¿Estás seguro de suspender este tenant? No podrá acceder a la plataforma.'
        : '¿Estás seguro de activar este tenant?';

    if (!confirm(confirmMessage)) return;

    setActionLoading(tenantId);
    try {
      const toggleTenantStatus = httpsCallable(functions, 'toggleTenantStatus');
      await toggleTenantStatus({ tenantId, action });
      await loadTenants(pagination.page);
    } catch (err) {
      console.error('Error toggling status:', err);
      alert('Error al cambiar estado del tenant');
    } finally {
      setActionLoading(null);
      setShowActionMenu(null);
    }
  };

  const handleViewDetail = async (tenantId) => {
    setActionLoading(tenantId);
    try {
      const getTenantDetail = httpsCallable(functions, 'getTenantDetail');
      const result = await getTenantDetail({ tenantId });
      setSelectedTenant(result.data.tenant);
      setShowDetailModal(true);
    } catch (err) {
      console.error('Error loading tenant detail:', err);
      alert('Error al cargar detalle del tenant');
    } finally {
      setActionLoading(null);
      setShowActionMenu(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-600/20 text-green-400">
            Activo
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-600/20 text-red-400">
            Suspendido
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary-600 text-secondary-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestión de Tenants</h1>
          <p className="text-secondary-400 mt-1">
            {pagination.total} tenants registrados
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-secondary-800 rounded-xl border border-secondary-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, RFC o email..."
                className="w-full pl-10 pr-4 py-2 bg-secondary-700 border border-secondary-600 rounded-lg text-white placeholder-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </form>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-secondary-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-secondary-700 border border-secondary-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="SUSPENDED">Suspendidos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-secondary-800 rounded-xl border border-secondary-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Razón Social
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    RFC
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Último Acceso
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-700">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-secondary-700/30">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{tenant.razonSocial}</p>
                          <p className="text-secondary-400 text-sm">{tenant.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-secondary-300 font-mono text-sm">{tenant.rfc}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-secondary-300 capitalize">{tenant.planName}</span>
                    </td>
                    <td className="px-4 py-4">{getStatusBadge(tenant.status)}</td>
                    <td className="px-4 py-4">
                      <span className="text-secondary-400 text-sm">
                        {tenant.lastAccess
                          ? new Date(tenant.lastAccess).toLocaleDateString('es-MX')
                          : 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowActionMenu(showActionMenu === tenant.id ? null : tenant.id)
                          }
                          className="p-2 hover:bg-secondary-600 rounded-lg"
                          disabled={actionLoading === tenant.id}
                        >
                          {actionLoading === tenant.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-secondary-400" />
                          ) : (
                            <MoreVertical className="w-5 h-5 text-secondary-400" />
                          )}
                        </button>

                        {showActionMenu === tenant.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-secondary-700 rounded-lg shadow-lg border border-secondary-600 py-1 z-10">
                            <button
                              onClick={() => handleViewDetail(tenant.id)}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-secondary-200 hover:bg-secondary-600"
                            >
                              <Eye className="w-4 h-4" />
                              Ver detalle
                            </button>
                            {tenant.status === 'SUSPENDED' ? (
                              <button
                                onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-green-400 hover:bg-secondary-600"
                              >
                                <UserCheck className="w-4 h-4" />
                                Activar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-secondary-600"
                              >
                                <UserX className="w-4 h-4" />
                                Suspender
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-secondary-700">
            <p className="text-sm text-secondary-400">
              Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loadTenants(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg bg-secondary-700 hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5 text-secondary-300" />
              </button>
              <button
                onClick={() => loadTenants(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg bg-secondary-700 hover:bg-secondary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5 text-secondary-300" />
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && tenants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-secondary-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No hay tenants</h3>
            <p className="text-secondary-400">
              No se encontraron tenants con los filtros actuales.
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-secondary-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-secondary-700">
              <h3 className="text-xl font-semibold text-white">Detalle del Tenant</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-secondary-400 text-sm">Razón Social</p>
                  <p className="text-white font-medium">
                    {selectedTenant.razonSocial || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">RFC</p>
                  <p className="text-white font-mono">{selectedTenant.rfc || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">Email</p>
                  <p className="text-white">{selectedTenant.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">Giro</p>
                  <p className="text-white">{selectedTenant.giro || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">Plan</p>
                  <p className="text-white capitalize">
                    {selectedTenant.subscription?.planName || 'Gratuito'}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">Estado</p>
                  {getStatusBadge(selectedTenant.status)}
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">Total Operaciones</p>
                  <p className="text-white font-medium">
                    {selectedTenant.stats?.totalOperations || 0}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-sm">Alertas Pendientes</p>
                  <p className="text-white font-medium">
                    {selectedTenant.stats?.pendingAlerts || 0}
                  </p>
                </div>
              </div>

              {selectedTenant.oficialCumplimiento && (
                <div className="border-t border-secondary-700 pt-4">
                  <h4 className="text-white font-medium mb-2">Oficial de Cumplimiento</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-secondary-400 text-sm">Nombre</p>
                      <p className="text-white">
                        {selectedTenant.oficialCumplimiento.nombre || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-secondary-400 text-sm">Email</p>
                      <p className="text-white">
                        {selectedTenant.oficialCumplimiento.email || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selectedTenant.leads?.length > 0 && (
                <div className="border-t border-secondary-700 pt-4">
                  <h4 className="text-white font-medium mb-2">Leads</h4>
                  <div className="space-y-2">
                    {selectedTenant.leads.map((lead) => (
                      <div
                        key={lead.id}
                        className="bg-secondary-700/50 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-white text-sm">{lead.serviceName}</p>
                          <p className="text-secondary-400 text-xs">
                            {new Date(lead.createdAt).toLocaleDateString('es-MX')}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            lead.status === 'COMPLETED'
                              ? 'bg-green-600/20 text-green-400'
                              : lead.status === 'PENDING'
                              ? 'bg-amber-600/20 text-amber-400'
                              : 'bg-secondary-600 text-secondary-300'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-secondary-700 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-secondary-700 hover:bg-secondary-600 rounded-lg text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TenantList;
