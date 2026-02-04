import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../core/config/firebase';
import { useAuth } from '../../core/context/AuthContext';
import { ACTIVIDADES_VULNERABLES } from '../../core/validations/authSchemas';
import { Card, Button, Alert } from '../../shared/components';
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Eye,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  DollarSign,
  User,
  Calendar,
  FileText,
  ArrowRight,
  X,
} from 'lucide-react';

// Risk level config
const RISK_LEVELS = {
  HIGH: { label: 'ALTO', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' },
  MEDIUM: { label: 'MEDIO', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  LOW: { label: 'BAJO', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', border: 'border-green-200' },
};

// Status config
const STATUS_CONFIG = {
  PENDING: { label: 'Pendiente', bg: 'bg-secondary-100', text: 'text-secondary-700' },
  PENDING_REVIEW: { label: 'En revisión', bg: 'bg-amber-100', text: 'text-amber-700' },
  PENDING_REPORT: { label: 'Pend. reporte', bg: 'bg-red-100', text: 'text-red-700' },
  REPORTED: { label: 'Reportada', bg: 'bg-green-100', text: 'text-green-700' },
};

const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function RiskEnginePage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || user?.uid;

  const [loading, setLoading] = useState(true);
  const [operations, setOperations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Filters
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('riskScore');
  const [sortDir, setSortDir] = useState('desc');

  // Detail panel
  const [selectedOp, setSelectedOp] = useState(null);

  // Fetch operations
  const fetchData = async (isRefresh = false) => {
    if (!tenantId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const opsRef = collection(db, 'tenants', tenantId, 'operations');
      const opsSnap = await getDocs(opsRef);
      const opsData = opsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOperations(opsData);
    } catch (err) {
      console.error('Error fetching operations:', err);
      setErrorMsg('Error al cargar operaciones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  // Format currency
  const formatMoney = (amount) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '$0';
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Get activity label
  const getActivityLabel = (id) => {
    const act = ACTIVIDADES_VULNERABLES.find(a => a.id === id);
    return act ? act.label : id || 'N/A';
  };

  // Filtered + sorted operations
  const filteredOps = useMemo(() => {
    let result = [...operations];

    // Filter by risk level
    if (filterRisk !== 'ALL') {
      result = result.filter(op => (op.riskLevel || 'LOW') === filterRisk);
    }

    // Filter by status
    if (filterStatus !== 'ALL') {
      result = result.filter(op => {
        const status = op.status || 'PENDING';
        return status === filterStatus;
      });
    }

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(op => {
        const rfc = (op.rfc_cliente || op.rfcCliente || op.rfc || '').toLowerCase();
        const nombre = (op.nombre_cliente || op.nombreCliente || op.nombre || '').toLowerCase();
        const folio = (op.id || '').toLowerCase();
        return rfc.includes(term) || nombre.includes(term) || folio.includes(term);
      });
    }

    // Sort
    result.sort((a, b) => {
      let valA, valB;
      if (sortField === 'riskScore') {
        valA = parseFloat(a.riskScore || 0);
        valB = parseFloat(b.riskScore || 0);
      } else if (sortField === 'monto') {
        valA = parseFloat(a.monto_operacion || a.montoOperacion || a.monto || 0);
        valB = parseFloat(b.monto_operacion || b.montoOperacion || b.monto || 0);
      } else if (sortField === 'fecha') {
        valA = a.fecha_operacion || a.fechaOperacion || a.createdAt || '';
        valB = b.fecha_operacion || b.fechaOperacion || b.createdAt || '';
      } else if (sortField === 'rfc') {
        valA = (a.rfc_cliente || a.rfcCliente || a.rfc || '').toLowerCase();
        valB = (b.rfc_cliente || b.rfcCliente || b.rfc || '').toLowerCase();
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [operations, filterRisk, filterStatus, searchTerm, sortField, sortDir]);

  // KPIs
  const kpis = useMemo(() => ({
    total: operations.length,
    high: operations.filter(op => op.riskLevel === 'HIGH').length,
    medium: operations.filter(op => op.riskLevel === 'MEDIUM').length,
    low: operations.filter(op => !op.riskLevel || op.riskLevel === 'LOW').length,
    pendingReport: operations.filter(op => op.status === 'PENDING_REPORT').length,
    pendingReview: operations.filter(op => op.status === 'PENDING_REVIEW').length,
  }), [operations]);

  // Handle sort toggle
  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Action: Mark as reviewed (PENDING_REVIEW → PENDING)
  const handleMarkReviewed = async (opId) => {
    setActionLoading(opId);
    try {
      const opRef = doc(db, 'tenants', tenantId, 'operations', opId);
      await updateDoc(opRef, { status: 'PENDING', reviewedAt: new Date().toISOString(), reviewedBy: user.uid });
      setOperations(prev => prev.map(op => op.id === opId ? { ...op, status: 'PENDING', reviewedAt: new Date().toISOString() } : op));
      setSuccessMsg('Operación marcada como revisada');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error updating operation:', err);
      setErrorMsg('Error al actualizar la operación');
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Escalate to PENDING_REPORT
  const handleEscalate = async (opId) => {
    setActionLoading(opId);
    try {
      const opRef = doc(db, 'tenants', tenantId, 'operations', opId);
      await updateDoc(opRef, { status: 'PENDING_REPORT', riskLevel: 'HIGH', escalatedAt: new Date().toISOString(), escalatedBy: user.uid });
      setOperations(prev => prev.map(op => op.id === opId ? { ...op, status: 'PENDING_REPORT', riskLevel: 'HIGH', escalatedAt: new Date().toISOString() } : op));
      setSuccessMsg('Operación escalada a reporte obligatorio');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Error escalating operation:', err);
      setErrorMsg('Error al escalar la operación');
    } finally {
      setActionLoading(null);
    }
  };

  // Get operation value helpers
  const getOpMonto = (op) => parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);
  const getOpRfc = (op) => op.rfc_cliente || op.rfcCliente || op.rfc || 'N/A';
  const getOpNombre = (op) => op.nombre_cliente || op.nombreCliente || op.nombre || 'N/A';
  const getOpFecha = (op) => op.fecha_operacion || op.fechaOperacion || '';
  const getOpStatus = (op) => op.status || 'PENDING';
  const getOpRisk = (op) => op.riskLevel || 'LOW';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-500">Cargando motor de riesgo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">
              Motor de Riesgo (EBR)
            </h1>
            <p className="text-secondary-500">
              Enfoque Basado en Riesgo — LFPIORPI Art. 17
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Alerts */}
      {successMsg && (
        <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
      )}
      {errorMsg && (
        <Alert variant="error" onClose={() => setErrorMsg('')}>{errorMsg}</Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card
          className={`p-4 text-center cursor-pointer transition-all ${filterRisk === 'ALL' && filterStatus === 'ALL' ? 'ring-2 ring-primary-400' : 'hover:shadow-md'}`}
          onClick={() => { setFilterRisk('ALL'); setFilterStatus('ALL'); }}
        >
          <p className="text-2xl font-bold text-secondary-900">{kpis.total}</p>
          <p className="text-xs text-secondary-500">Total</p>
        </Card>
        <Card
          className={`p-4 text-center cursor-pointer transition-all ${filterRisk === 'HIGH' ? 'ring-2 ring-red-400' : 'hover:shadow-md'}`}
          onClick={() => { setFilterRisk('HIGH'); setFilterStatus('ALL'); }}
        >
          <p className="text-2xl font-bold text-red-700">{kpis.high}</p>
          <p className="text-xs text-red-600">Riesgo Alto</p>
        </Card>
        <Card
          className={`p-4 text-center cursor-pointer transition-all ${filterRisk === 'MEDIUM' ? 'ring-2 ring-amber-400' : 'hover:shadow-md'}`}
          onClick={() => { setFilterRisk('MEDIUM'); setFilterStatus('ALL'); }}
        >
          <p className="text-2xl font-bold text-amber-700">{kpis.medium}</p>
          <p className="text-xs text-amber-600">Riesgo Medio</p>
        </Card>
        <Card
          className={`p-4 text-center cursor-pointer transition-all ${filterRisk === 'LOW' ? 'ring-2 ring-green-400' : 'hover:shadow-md'}`}
          onClick={() => { setFilterRisk('LOW'); setFilterStatus('ALL'); }}
        >
          <p className="text-2xl font-bold text-green-700">{kpis.low}</p>
          <p className="text-xs text-green-600">Riesgo Bajo</p>
        </Card>
        <Card
          className={`p-4 text-center cursor-pointer transition-all ${filterStatus === 'PENDING_REPORT' ? 'ring-2 ring-red-400' : 'hover:shadow-md'}`}
          onClick={() => { setFilterStatus('PENDING_REPORT'); setFilterRisk('ALL'); }}
        >
          <p className="text-2xl font-bold text-red-700">{kpis.pendingReport}</p>
          <p className="text-xs text-red-600">Pend. Reporte</p>
        </Card>
        <Card
          className={`p-4 text-center cursor-pointer transition-all ${filterStatus === 'PENDING_REVIEW' ? 'ring-2 ring-amber-400' : 'hover:shadow-md'}`}
          onClick={() => { setFilterStatus('PENDING_REVIEW'); setFilterRisk('ALL'); }}
        >
          <p className="text-2xl font-bold text-amber-700">{kpis.pendingReview}</p>
          <p className="text-xs text-amber-600">En Revisión</p>
        </Card>
      </div>

      {/* Search + Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Buscar por RFC, nombre o folio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
          </div>

          {/* Risk filter */}
          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white text-sm"
          >
            <option value="ALL">Todos los riesgos</option>
            <option value="HIGH">Riesgo Alto</option>
            <option value="MEDIUM">Riesgo Medio</option>
            <option value="LOW">Riesgo Bajo</option>
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white text-sm"
          >
            <option value="ALL">Todos los estatus</option>
            <option value="PENDING">Pendiente</option>
            <option value="PENDING_REVIEW">En revisión</option>
            <option value="PENDING_REPORT">Pend. reporte</option>
            <option value="REPORTED">Reportada</option>
          </select>
        </div>
      </Card>

      {/* Operations Table */}
      <Card className="overflow-hidden">
        {filteredOps.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
            <p className="text-secondary-500">No se encontraron operaciones con los filtros aplicados</p>
            <p className="text-sm text-secondary-400 mt-1">Ajusta los filtros o carga nuevas operaciones</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary-50 border-b border-secondary-200">
                <tr>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Riesgo</th>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Estatus</th>
                  <th
                    className="px-4 py-3 text-left text-secondary-700 font-medium cursor-pointer hover:text-primary-600"
                    onClick={() => toggleSort('rfc')}
                  >
                    <span className="flex items-center gap-1">
                      RFC
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Nombre</th>
                  <th
                    className="px-4 py-3 text-right text-secondary-700 font-medium cursor-pointer hover:text-primary-600"
                    onClick={() => toggleSort('monto')}
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Monto
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-secondary-700 font-medium cursor-pointer hover:text-primary-600"
                    onClick={() => toggleSort('riskScore')}
                  >
                    <span className="flex items-center gap-1">
                      Score
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Periodo</th>
                  <th className="px-4 py-3 text-center text-secondary-700 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100">
                {filteredOps.map((op) => {
                  const risk = getOpRisk(op);
                  const status = getOpStatus(op);
                  const riskCfg = RISK_LEVELS[risk] || RISK_LEVELS.LOW;
                  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;

                  return (
                    <tr
                      key={op.id}
                      className={`hover:bg-secondary-50 transition-colors cursor-pointer ${
                        selectedOp?.id === op.id ? 'bg-primary-50' : ''
                      }`}
                      onClick={() => setSelectedOp(selectedOp?.id === op.id ? null : op)}
                    >
                      {/* Risk badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${riskCfg.bg} ${riskCfg.text}`}>
                          <span className={`w-2 h-2 rounded-full ${riskCfg.dot}`} />
                          {riskCfg.label}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* RFC */}
                      <td className="px-4 py-3 font-mono text-secondary-900">{getOpRfc(op)}</td>

                      {/* Nombre */}
                      <td className="px-4 py-3 text-secondary-700 max-w-[200px] truncate">{getOpNombre(op)}</td>

                      {/* Monto */}
                      <td className="px-4 py-3 text-right font-medium text-secondary-900">
                        {formatMoney(getOpMonto(op))}
                      </td>

                      {/* Risk Score */}
                      <td className="px-4 py-3">
                        <span className={`font-bold ${risk === 'HIGH' ? 'text-red-600' : risk === 'MEDIUM' ? 'text-amber-600' : 'text-green-600'}`}>
                          {op.riskScore || 0}
                        </span>
                      </td>

                      {/* Periodo */}
                      <td className="px-4 py-3 text-secondary-600">
                        {MONTH_NAMES[op.periodMonth] || ''} {op.periodYear || ''}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {status === 'PENDING_REVIEW' && (
                            <>
                              <button
                                onClick={() => handleMarkReviewed(op.id)}
                                disabled={actionLoading === op.id}
                                className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                                title="Marcar como revisada"
                              >
                                {actionLoading === op.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleEscalate(op.id)}
                                disabled={actionLoading === op.id}
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                title="Escalar a reporte obligatorio"
                              >
                                <ShieldAlert className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {status === 'PENDING' && (
                            <button
                              onClick={() => handleEscalate(op.id)}
                              disabled={actionLoading === op.id}
                              className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
                              title="Escalar a reporte"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOp(selectedOp?.id === op.id ? null : op)}
                            className="p-1.5 text-secondary-500 hover:bg-secondary-100 rounded-lg transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Row count */}
            <div className="px-4 py-3 bg-secondary-50 border-t border-secondary-200 text-xs text-secondary-500">
              Mostrando {filteredOps.length} de {operations.length} operaciones
            </div>
          </div>
        )}
      </Card>

      {/* Detail Panel */}
      {selectedOp && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-secondary-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              Detalle de Operación
            </h3>
            <button
              onClick={() => setSelectedOp(null)}
              className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-secondary-500" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Risk Info */}
            <div className={`p-4 rounded-lg border ${RISK_LEVELS[getOpRisk(selectedOp)]?.border || 'border-secondary-200'} ${RISK_LEVELS[getOpRisk(selectedOp)]?.bg || 'bg-secondary-50'}`}>
              <p className="text-xs text-secondary-500 mb-1">Nivel de Riesgo</p>
              <p className={`text-lg font-bold ${RISK_LEVELS[getOpRisk(selectedOp)]?.text || 'text-secondary-700'}`}>
                {RISK_LEVELS[getOpRisk(selectedOp)]?.label || 'N/A'} — Score: {selectedOp.riskScore || 0}
              </p>
              {selectedOp.riskReason && (
                <p className="text-sm text-secondary-600 mt-1">{selectedOp.riskReason}</p>
              )}
            </div>

            {/* Client Info */}
            <div className="p-4 bg-secondary-50 rounded-lg border border-secondary-200">
              <p className="text-xs text-secondary-500 mb-1">Cliente</p>
              <p className="font-medium text-secondary-900">{getOpNombre(selectedOp)}</p>
              <p className="text-sm text-secondary-600 font-mono">{getOpRfc(selectedOp)}</p>
              {selectedOp.tipo_persona && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                  {selectedOp.tipo_persona === 'PF' ? 'Persona Física' : 'Persona Moral'}
                </span>
              )}
            </div>

            {/* Operation Info */}
            <div className="p-4 bg-secondary-50 rounded-lg border border-secondary-200">
              <p className="text-xs text-secondary-500 mb-1">Operación</p>
              <p className="text-lg font-bold text-secondary-900">{formatMoney(getOpMonto(selectedOp))}</p>
              <p className="text-sm text-secondary-600">
                {selectedOp.tipo_operacion || selectedOp.tipoOperacion || 'N/A'}
              </p>
              <p className="text-xs text-secondary-500 mt-1">
                {getOpFecha(selectedOp)} — {getActivityLabel(selectedOp.activityType)}
              </p>
            </div>

            {/* Forma de pago */}
            {(selectedOp.forma_pago || selectedOp.instrumento_monetario) && (
              <div className="p-4 bg-secondary-50 rounded-lg border border-secondary-200">
                <p className="text-xs text-secondary-500 mb-1">Forma de Pago</p>
                <p className="font-medium text-secondary-900">{selectedOp.forma_pago || selectedOp.instrumento_monetario || 'N/A'}</p>
                {selectedOp.moneda && (
                  <p className="text-sm text-secondary-600">{selectedOp.moneda}</p>
                )}
              </div>
            )}

            {/* Acumulado mensual */}
            {selectedOp.monthlyAccumulated && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-600 mb-1">Acumulado Mensual (RFC)</p>
                <p className="text-lg font-bold text-blue-800">{formatMoney(selectedOp.monthlyAccumulated)}</p>
                <p className="text-xs text-blue-600">Incluye esta operación</p>
              </div>
            )}

            {/* Warnings */}
            {selectedOp.warnings && selectedOp.warnings.length > 0 && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 md:col-span-2 lg:col-span-3">
                <p className="text-xs text-amber-600 mb-2 font-semibold">Advertencias</p>
                <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                  {selectedOp.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-secondary-200">
            {getOpStatus(selectedOp) === 'PENDING_REVIEW' && (
              <>
                <Button
                  onClick={() => handleMarkReviewed(selectedOp.id)}
                  disabled={actionLoading === selectedOp.id}
                  className="flex items-center gap-2"
                >
                  {actionLoading === selectedOp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Marcar como Revisada
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleEscalate(selectedOp.id)}
                  disabled={actionLoading === selectedOp.id}
                  className="flex items-center gap-2 !text-red-700 !border-red-300 hover:!bg-red-50"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Escalar a Reporte Obligatorio
                </Button>
              </>
            )}
            {getOpStatus(selectedOp) === 'PENDING' && (
              <Button
                variant="secondary"
                onClick={() => handleEscalate(selectedOp.id)}
                disabled={actionLoading === selectedOp.id}
                className="flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Escalar a Reporte
              </Button>
            )}
            {getOpStatus(selectedOp) === 'PENDING_REPORT' && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <ShieldAlert className="w-4 h-4" />
                Esta operación requiere reporte al SAT. Genera el XML desde el módulo Generador XML.
              </div>
            )}
            {getOpStatus(selectedOp) === 'REPORTED' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                Esta operación ya fue reportada al SAT.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default RiskEnginePage;
