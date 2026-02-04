import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../core/config/firebase';
import {
  Search,
  Filter,
  MoreVertical,
  CheckCircle,
  Clock,
  XCircle,
  Phone,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ShoppingBag,
  Mail,
  Building2,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendiente', color: 'bg-amber-600/20 text-amber-400' },
  { value: 'CONTACTED', label: 'Contactado', color: 'bg-blue-600/20 text-blue-400' },
  { value: 'IN_PROGRESS', label: 'En proceso', color: 'bg-purple-600/20 text-purple-400' },
  { value: 'COMPLETED', label: 'Completado', color: 'bg-green-600/20 text-green-400' },
  { value: 'CANCELLED', label: 'Cancelado', color: 'bg-red-600/20 text-red-400' },
];

export function LeadsList() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showActionMenu, setShowActionMenu] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');

  const loadLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const getPendingLeads = httpsCallable(functions, 'getPendingLeads');
      const result = await getPendingLeads({ status: statusFilter, limit: 100 });
      setLeads(result.data.leads || []);
    } catch (err) {
      console.error('Error loading leads:', err);
      setError('Error al cargar leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [statusFilter]);

  const handleUpdateStatus = async (leadId) => {
    if (!newStatus) return;

    setActionLoading(leadId);
    try {
      const updateLeadStatus = httpsCallable(functions, 'updateLeadStatus');
      await updateLeadStatus({ leadId, status: newStatus, notes: statusNotes });
      await loadLeads();
      setShowStatusModal(null);
      setNewStatus('');
      setStatusNotes('');
    } catch (err) {
      console.error('Error updating lead status:', err);
      alert('Error al actualizar estado del lead');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = STATUS_OPTIONS.find((s) => s.value === status);
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig?.color || 'bg-secondary-600 text-secondary-300'}`}>
        {statusConfig?.label || status}
      </span>
    );
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price || 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestión de Leads</h1>
          <p className="text-secondary-400 mt-1">
            Solicitudes de servicios del marketplace
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-secondary-800 rounded-xl border border-secondary-700 p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-secondary-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-secondary-700 border border-secondary-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los estados</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {STATUS_OPTIONS.map((status) => {
          const count = leads.filter((l) => l.status === status.value).length;
          return (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`bg-secondary-800 rounded-xl border p-4 text-center transition-colors ${
                statusFilter === status.value
                  ? 'border-primary-500'
                  : 'border-secondary-700 hover:border-secondary-600'
              }`}
            >
              <p className="text-2xl font-bold text-white">{count}</p>
              <p className="text-xs text-secondary-400">{status.label}</p>
            </button>
          );
        })}
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
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Servicio
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-secondary-300 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-700">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-secondary-700/30">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{lead.tenantName}</p>
                          <p className="text-secondary-400 text-sm">{lead.tenantEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-white">{lead.serviceName}</p>
                      {lead.notes && (
                        <p className="text-secondary-400 text-sm truncate max-w-[200px]">
                          {lead.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-white font-medium">
                        {formatPrice(lead.servicePrice)}
                      </span>
                    </td>
                    <td className="px-4 py-4">{getStatusBadge(lead.status)}</td>
                    <td className="px-4 py-4">
                      <span className="text-secondary-400 text-sm">
                        {new Date(lead.createdAt).toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowActionMenu(showActionMenu === lead.id ? null : lead.id)
                          }
                          className="p-2 hover:bg-secondary-600 rounded-lg"
                          disabled={actionLoading === lead.id}
                        >
                          {actionLoading === lead.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-secondary-400" />
                          ) : (
                            <MoreVertical className="w-5 h-5 text-secondary-400" />
                          )}
                        </button>

                        {showActionMenu === lead.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-secondary-700 rounded-lg shadow-lg border border-secondary-600 py-1 z-10">
                            <button
                              onClick={() => {
                                setShowStatusModal(lead);
                                setShowActionMenu(null);
                              }}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-secondary-200 hover:bg-secondary-600"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Cambiar estado
                            </button>
                            <a
                              href={`mailto:${lead.tenantEmail}`}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-secondary-200 hover:bg-secondary-600"
                            >
                              <Mail className="w-4 h-4" />
                              Enviar email
                            </a>
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

        {/* Empty State */}
        {!loading && leads.length === 0 && (
          <div className="text-center py-12">
            <ShoppingBag className="w-12 h-12 text-secondary-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No hay leads</h3>
            <p className="text-secondary-400">
              No se encontraron leads con los filtros actuales.
            </p>
          </div>
        )}
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-secondary-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Actualizar Estado</h3>

            <div className="space-y-4">
              <div>
                <p className="text-secondary-400 text-sm mb-1">Lead</p>
                <p className="text-white">{showStatusModal.serviceName}</p>
                <p className="text-secondary-400 text-sm">{showStatusModal.tenantName}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-300 mb-1">
                  Nuevo estado
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full bg-secondary-700 border border-secondary-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Seleccionar estado</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-300 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="Agregar notas sobre el seguimiento..."
                  className="w-full bg-secondary-700 border border-secondary-600 rounded-lg px-3 py-2 text-white placeholder-secondary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowStatusModal(null);
                  setNewStatus('');
                  setStatusNotes('');
                }}
                className="flex-1 px-4 py-2 bg-secondary-700 hover:bg-secondary-600 rounded-lg text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateStatus(showStatusModal.id)}
                disabled={!newStatus || actionLoading}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadsList;
