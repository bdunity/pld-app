import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../core/config/firebase';
import {
  ScrollText,
  Filter,
  Loader2,
  AlertCircle,
  LogIn,
  LogOut,
  UserPlus,
  UserMinus,
  FileUp,
  FileX,
  Download,
  Settings,
  Shield,
  Clock,
  Search,
  Calendar,
} from 'lucide-react';

const ACTION_ICONS = {
  USER_LOGIN: LogIn,
  USER_LOGOUT: LogOut,
  CLIENT_CREATED: UserPlus,
  CLIENT_DELETED: UserMinus,
  DOCUMENT_UPLOADED: FileUp,
  DOCUMENT_DELETED: FileX,
  DOCUMENT_DOWNLOADED: Download,
  SETTINGS_CHANGED: Settings,
  SCREENING_SEARCH: Shield,
  SCREENING_CONFIRMED: AlertCircle,
  default: Clock,
};

const ACTION_COLORS = {
  USER_LOGIN: 'bg-green-100 text-green-600',
  USER_LOGOUT: 'bg-secondary-100 text-secondary-600',
  CLIENT_CREATED: 'bg-blue-100 text-blue-600',
  CLIENT_DELETED: 'bg-red-100 text-red-600',
  DOCUMENT_UPLOADED: 'bg-purple-100 text-purple-600',
  DOCUMENT_DELETED: 'bg-red-100 text-red-600',
  SCREENING_CONFIRMED: 'bg-amber-100 text-amber-600',
  default: 'bg-secondary-100 text-secondary-600',
};

export function AuditLogView() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ total: 0, byAction: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    action: 'all',
    userId: 'all',
    startDate: '',
    endDate: '',
  });
  const [availableActions, setAvailableActions] = useState([]);

  useEffect(() => {
    loadAuditLog();
    loadActions();
  }, [filters.action]);

  const loadActions = async () => {
    try {
      const getAuditActions = httpsCallable(functions, 'getAuditActions');
      const result = await getAuditActions();
      setAvailableActions(result.data.actions || []);
    } catch (error) {
      console.error('Error loading actions:', error);
    }
  };

  const loadAuditLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const getTenantAuditLog = httpsCallable(functions, 'getTenantAuditLog');
      const result = await getTenantAuditLog({
        action: filters.action,
        limit: 100,
      });
      setLogs(result.data.logs || []);
      setSummary(result.data.summary || { total: 0, byAction: {} });
    } catch (err) {
      console.error('Error loading audit log:', err);
      setError('Error al cargar el registro de auditoría');
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action) => {
    return action
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getActionIcon = (action) => {
    return ACTION_ICONS[action] || ACTION_ICONS.default;
  };

  const getActionColor = (action) => {
    return ACTION_COLORS[action] || ACTION_COLORS.default;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900 flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary-600" />
            Bitácora de Auditoría
          </h2>
          <p className="text-secondary-600 mt-1">
            Registro inmutable de todas las acciones en el sistema
          </p>
        </div>
        <div className="text-sm text-secondary-500">
          Total de registros: <strong>{summary.total}</strong>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Registro de Solo Lectura</h4>
            <p className="text-sm text-blue-700 mt-1">
              Este registro es inmutable y no puede ser modificado ni eliminado. Cumple con
              los requisitos de auditoría de la LFPIORPI.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-secondary-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-secondary-400" />
            <span className="text-sm font-medium text-secondary-700">Filtros:</span>
          </div>

          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="input-field max-w-xs"
          >
            <option value="all">Todas las acciones</option>
            {availableActions.map((action) => (
              <option key={action} value={action}>
                {formatAction(action)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(summary.byAction)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([action, count]) => {
            const Icon = getActionIcon(action);
            const colorClass = getActionColor(action);

            return (
              <button
                key={action}
                onClick={() => setFilters({ ...filters, action })}
                className={`bg-white rounded-xl border p-4 text-left transition-colors ${
                  filters.action === action
                    ? 'border-primary-500 ring-1 ring-primary-500'
                    : 'border-secondary-200 hover:border-secondary-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-secondary-900">{count}</p>
                    <p className="text-xs text-secondary-500 truncate max-w-[100px]">
                      {formatAction(action)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <ScrollText className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-secondary-900 mb-2">
              Sin registros
            </h3>
            <p className="text-secondary-600">
              No hay registros de auditoría con los filtros actuales.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-secondary-200">
            {logs.map((log) => {
              const Icon = getActionIcon(log.action);
              const colorClass = getActionColor(log.action);

              return (
                <div key={log.id} className="p-4 hover:bg-secondary-50">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-medium text-secondary-900">
                          {formatAction(log.action)}
                        </p>
                        <span className="text-sm text-secondary-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('es-MX', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-secondary-600">
                        <p>Usuario: {log.userEmail || 'Sistema'}</p>
                        {log.ip && <p>IP: {log.ip}</p>}
                      </div>

                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 bg-secondary-50 rounded p-2">
                          <p className="text-xs font-medium text-secondary-500 mb-1">
                            Detalles:
                          </p>
                          <div className="text-xs text-secondary-600 space-y-0.5">
                            {Object.entries(log.details).map(([key, value]) => (
                              <p key={key}>
                                <span className="font-medium">{key}:</span>{' '}
                                {typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
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

export default AuditLogView;
