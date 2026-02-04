import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../core/config/firebase';
import {
  ScrollText,
  Filter,
  Loader2,
  AlertCircle,
  UserCheck,
  UserX,
  FileCheck,
  Shield,
  Clock,
} from 'lucide-react';

const ACTION_CONFIG = {
  TENANT_SUSPENDED: {
    icon: UserX,
    color: 'text-red-400',
    bgColor: 'bg-red-600/20',
    label: 'Tenant Suspendido',
  },
  TENANT_ACTIVATED: {
    icon: UserCheck,
    color: 'text-green-400',
    bgColor: 'bg-green-600/20',
    label: 'Tenant Activado',
  },
  SERVICE_DELIVERED: {
    icon: FileCheck,
    color: 'text-blue-400',
    bgColor: 'bg-blue-600/20',
    label: 'Servicio Entregado',
  },
  UNAUTHORIZED_ADMIN_ACCESS: {
    icon: Shield,
    color: 'text-amber-400',
    bgColor: 'bg-amber-600/20',
    label: 'Acceso No Autorizado',
  },
};

export function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFilter, setActionFilter] = useState('all');

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const getAuditLog = httpsCallable(functions, 'getAuditLog');
      const result = await getAuditLog({ limit: 100, action: actionFilter });
      setLogs(result.data.logs || []);
    } catch (err) {
      console.error('Error loading audit log:', err);
      setError('Error al cargar el registro de auditoría');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter]);

  const getActionDisplay = (action) => {
    const config = ACTION_CONFIG[action] || {
      icon: Clock,
      color: 'text-secondary-400',
      bgColor: 'bg-secondary-600/20',
      label: action,
    };
    return config;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScrollText className="w-7 h-7 text-primary-400" />
            Registro de Auditoría
          </h1>
          <p className="text-secondary-400 mt-1">
            Historial de acciones administrativas
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-secondary-800 rounded-xl border border-secondary-700 p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-secondary-400" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-secondary-700 border border-secondary-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todas las acciones</option>
            <option value="TENANT_SUSPENDED">Tenants Suspendidos</option>
            <option value="TENANT_ACTIVATED">Tenants Activados</option>
            <option value="SERVICE_DELIVERED">Servicios Entregados</option>
            <option value="UNAUTHORIZED_ADMIN_ACCESS">Accesos No Autorizados</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Logs List */}
      <div className="bg-secondary-800 rounded-xl border border-secondary-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <ScrollText className="w-12 h-12 text-secondary-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Sin registros</h3>
            <p className="text-secondary-400">
              No hay registros de auditoría con los filtros actuales.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-secondary-700">
            {logs.map((log) => {
              const actionConfig = getActionDisplay(log.action);
              const Icon = actionConfig.icon;

              return (
                <div key={log.id} className="p-4 hover:bg-secondary-700/30">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${actionConfig.bgColor}`}
                    >
                      <Icon className={`w-5 h-5 ${actionConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-white font-medium">{actionConfig.label}</p>
                        <span className="text-secondary-400 text-sm whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-secondary-400">
                        {log.adminEmail && (
                          <p>
                            Admin: <span className="text-secondary-300">{log.adminEmail}</span>
                          </p>
                        )}
                        {log.tenantId && (
                          <p>
                            Tenant ID:{' '}
                            <span className="text-secondary-300 font-mono text-xs">
                              {log.tenantId}
                            </span>
                          </p>
                        )}
                        {log.tenantEmail && (
                          <p>
                            Tenant: <span className="text-secondary-300">{log.tenantEmail}</span>
                          </p>
                        )}
                        {log.serviceType && (
                          <p>
                            Servicio: <span className="text-secondary-300">{log.serviceType}</span>
                          </p>
                        )}
                        {log.reason && (
                          <p>
                            Razón: <span className="text-secondary-300">{log.reason}</span>
                          </p>
                        )}
                        {log.userEmail && (
                          <p>
                            Usuario: <span className="text-amber-400">{log.userEmail}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLog;
