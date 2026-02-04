import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../core/config/firebase';
import {
  Search,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  RefreshCw,
  Filter,
  Clock,
  AlertOctagon,
  UserX,
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDING_REVIEW: {
    label: 'Pendiente Revisión',
    color: 'bg-amber-600/20 text-amber-400 border-amber-600',
    icon: Clock,
  },
  CLEARED: {
    label: 'Limpio',
    color: 'bg-green-600/20 text-green-400 border-green-600',
    icon: CheckCircle,
  },
  CONFIRMED_RISK: {
    label: 'Riesgo Confirmado',
    color: 'bg-red-600/20 text-red-400 border-red-600',
    icon: AlertOctagon,
  },
  DISMISSED: {
    label: 'Descartado',
    color: 'bg-secondary-600/20 text-secondary-400 border-secondary-600',
    icon: XCircle,
  },
};

const RISK_CONFIG = {
  CRITICAL: { label: 'Crítico', color: 'bg-red-500 text-white' },
  HIGH: { label: 'Alto', color: 'bg-orange-500 text-white' },
  MEDIUM: { label: 'Medio', color: 'bg-yellow-500 text-black' },
  LOW: { label: 'Bajo', color: 'bg-green-500 text-white' },
};

export function ScreeningView() {
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState({ name: '', rfc: '' });
  const [searchResults, setSearchResults] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const loadResults = async () => {
    setLoading(true);
    try {
      const getScreeningResults = httpsCallable(functions, 'getScreeningResults');
      const result = await getScreeningResults({ status: statusFilter, limit: 100 });
      setResults(result.data.results || []);
      setStats(result.data.stats || {});
    } catch (error) {
      console.error('Error loading screening results:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, [statusFilter]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.name && !searchQuery.rfc) return;

    setSearchLoading(true);
    try {
      const checkBlacklists = httpsCallable(functions, 'checkBlacklists');
      const result = await checkBlacklists(searchQuery);
      setSearchResults(result.data);
    } catch (error) {
      console.error('Error searching blacklists:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleReview = async (screeningId, action) => {
    const confirmMessage =
      action === 'CONFIRM_RISK'
        ? '¿Confirmar que este cliente representa un riesgo real? Se marcará como alto riesgo.'
        : '¿Descartar como falso positivo?';

    if (!confirm(confirmMessage)) return;

    setActionLoading(screeningId);
    try {
      const reviewScreeningResult = httpsCallable(functions, 'reviewScreeningResult');
      await reviewScreeningResult({ screeningId, action });
      await loadResults();
      setSelectedResult(null);
    } catch (error) {
      console.error('Error reviewing result:', error);
      alert('Error al procesar la revisión');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunBatch = async () => {
    if (!confirm('¿Ejecutar screening masivo de todos los clientes? Esto puede tomar varios minutos.')) {
      return;
    }

    setLoading(true);
    try {
      const runBatchScreening = httpsCallable(functions, 'runBatchScreening');
      const result = await runBatchScreening();
      alert(result.data.message);
      await loadResults();
    } catch (error) {
      console.error('Error running batch screening:', error);
      alert('Error al ejecutar screening masivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary-600" />
            Screening de Listas Negras
          </h2>
          <p className="text-secondary-600 mt-1">
            Detección de clientes en SAT 69-B, PEPs y Sanciones ONU
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearchModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Buscar Manual
          </button>
          <button
            onClick={handleRunBatch}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Screening Masivo
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.pendingReview || 0}</p>
              <p className="text-xs text-secondary-500">Pendientes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertOctagon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.confirmed || 0}</p>
              <p className="text-xs text-secondary-500">Confirmados</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.cleared || 0}</p>
              <p className="text-xs text-secondary-500">Limpios</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.dismissed || 0}</p>
              <p className="text-xs text-secondary-500">Descartados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-secondary-200 p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-secondary-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field max-w-xs"
          >
            <option value="all">Todos los estados</option>
            <option value="PENDING_REVIEW">Pendientes de revisión</option>
            <option value="CONFIRMED_RISK">Riesgo confirmado</option>
            <option value="CLEARED">Limpios</option>
            <option value="DISMISSED">Descartados</option>
          </select>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-secondary-900 mb-2">Sin resultados</h3>
            <p className="text-secondary-600">
              No hay resultados de screening con los filtros actuales.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                    RFC
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                    Coincidencias
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-secondary-500 uppercase">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-secondary-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200">
                {results.map((result) => {
                  const statusConfig = STATUS_CONFIG[result.status] || STATUS_CONFIG.PENDING_REVIEW;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <tr key={result.id} className="hover:bg-secondary-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                            <UserX className="w-5 h-5 text-secondary-500" />
                          </div>
                          <div>
                            <p className="font-medium text-secondary-900">{result.clientName}</p>
                            <p className="text-xs text-secondary-500">{result.clientType}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-secondary-600">
                          {result.clientRfc || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {result.matches?.length > 0 ? (
                          <div className="space-y-1">
                            {result.matches.slice(0, 2).map((match, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    RISK_CONFIG[match.risk]?.color || 'bg-secondary-200'
                                  }`}
                                >
                                  {match.source}
                                </span>
                                <span className="text-xs text-secondary-500">
                                  {Math.round(match.score * 100)}%
                                </span>
                              </div>
                            ))}
                            {result.matches.length > 2 && (
                              <span className="text-xs text-secondary-400">
                                +{result.matches.length - 2} más
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-secondary-400 text-sm">Sin coincidencias</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-secondary-500">
                          {new Date(result.searchedAt).toLocaleDateString('es-MX')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedResult(result)}
                            className="p-2 hover:bg-secondary-100 rounded-lg"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 text-secondary-500" />
                          </button>
                          {result.status === 'PENDING_REVIEW' && (
                            <>
                              <button
                                onClick={() => handleReview(result.id, 'CONFIRM_RISK')}
                                disabled={actionLoading === result.id}
                                className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                                title="Confirmar riesgo"
                              >
                                {actionLoading === result.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleReview(result.id, 'DISMISS')}
                                disabled={actionLoading === result.id}
                                className="p-2 hover:bg-green-50 rounded-lg text-green-600"
                                title="Descartar falso positivo"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Búsqueda Manual en Listas Negras
            </h3>

            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Nombre o Razón Social
                </label>
                <input
                  type="text"
                  value={searchQuery.name}
                  onChange={(e) => setSearchQuery({ ...searchQuery, name: e.target.value })}
                  placeholder="Ej: Comercializadora del Norte SA"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  RFC (opcional)
                </label>
                <input
                  type="text"
                  value={searchQuery.rfc}
                  onChange={(e) => setSearchQuery({ ...searchQuery, rfc: e.target.value })}
                  placeholder="Ej: ABC123456XYZ"
                  className="input-field"
                />
              </div>

              <button
                type="submit"
                disabled={searchLoading || (!searchQuery.name && !searchQuery.rfc)}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {searchLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Buscar
                  </>
                )}
              </button>
            </form>

            {/* Search Results */}
            {searchResults && (
              <div className="mt-6 border-t pt-4">
                <h4 className="font-medium text-secondary-900 mb-3">Resultados</h4>
                {searchResults.matchFound ? (
                  <div className="space-y-3">
                    {searchResults.matches.map((match, idx) => (
                      <div
                        key={idx}
                        className="bg-red-50 border border-red-200 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              RISK_CONFIG[match.risk]?.color || 'bg-secondary-200'
                            }`}
                          >
                            {match.sourceLabel}
                          </span>
                          <span className="text-sm font-medium text-red-600">
                            {Math.round(match.score * 100)}% coincidencia
                          </span>
                        </div>
                        <p className="text-sm text-secondary-700">
                          <strong>Encontrado:</strong> {match.matchedName}
                        </p>
                        {match.matchedRfc && (
                          <p className="text-sm text-secondary-600">RFC: {match.matchedRfc}</p>
                        )}
                        {match.type && (
                          <p className="text-sm text-secondary-600">Tipo: {match.type}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-green-800 font-medium">Sin coincidencias</p>
                    <p className="text-green-600 text-sm">
                      No se encontraron registros en las listas negras
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchResults(null);
                  setSearchQuery({ name: '', rfc: '' });
                }}
                className="btn-secondary flex-1"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-secondary-900">
                Detalle de Screening
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-secondary-500">Cliente</p>
                  <p className="font-medium text-secondary-900">{selectedResult.clientName}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500">RFC</p>
                  <p className="font-mono text-secondary-900">
                    {selectedResult.clientRfc || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500">Fecha de búsqueda</p>
                  <p className="text-secondary-900">
                    {new Date(selectedResult.searchedAt).toLocaleString('es-MX')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500">Estado</p>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      STATUS_CONFIG[selectedResult.status]?.color
                    }`}
                  >
                    {STATUS_CONFIG[selectedResult.status]?.label}
                  </span>
                </div>
              </div>

              {selectedResult.matches?.length > 0 && (
                <div>
                  <h4 className="font-medium text-secondary-900 mb-3">Coincidencias encontradas</h4>
                  <div className="space-y-3">
                    {selectedResult.matches.map((match, idx) => (
                      <div
                        key={idx}
                        className="bg-secondary-50 border border-secondary-200 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              RISK_CONFIG[match.risk]?.color || 'bg-secondary-200'
                            }`}
                          >
                            {match.risk}
                          </span>
                          <span className="text-sm font-bold text-secondary-900">
                            {Math.round(match.score * 100)}% match
                          </span>
                        </div>
                        <p className="text-sm">
                          <strong>Fuente:</strong> {match.sourceLabel}
                        </p>
                        <p className="text-sm">
                          <strong>Nombre en lista:</strong> {match.matchedName}
                        </p>
                        {match.matchedRfc && (
                          <p className="text-sm">
                            <strong>RFC:</strong> {match.matchedRfc}
                          </p>
                        )}
                        {match.type && (
                          <p className="text-sm">
                            <strong>Tipo:</strong> {match.type}
                          </p>
                        )}
                        {match.position && (
                          <p className="text-sm">
                            <strong>Cargo:</strong> {match.position}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedResult.reviewedAt && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-secondary-900 mb-2">Revisión</h4>
                  <p className="text-sm text-secondary-600">
                    Revisado por: {selectedResult.reviewerEmail}
                  </p>
                  <p className="text-sm text-secondary-600">
                    Fecha: {new Date(selectedResult.reviewedAt).toLocaleString('es-MX')}
                  </p>
                  {selectedResult.reviewNotes && (
                    <p className="text-sm text-secondary-600">
                      Notas: {selectedResult.reviewNotes}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              {selectedResult.status === 'PENDING_REVIEW' && (
                <>
                  <button
                    onClick={() => handleReview(selectedResult.id, 'DISMISS')}
                    disabled={actionLoading}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Descartar Falso Positivo
                  </button>
                  <button
                    onClick={() => handleReview(selectedResult.id, 'CONFIRM_RISK')}
                    disabled={actionLoading}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    Confirmar Riesgo
                  </button>
                </>
              )}
              <button onClick={() => setSelectedResult(null)} className="btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScreeningView;
