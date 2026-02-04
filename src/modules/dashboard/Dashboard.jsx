import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../core/config/firebase';
import { useAuth } from '../../core/context/AuthContext';
import { ACTIVIDADES_VULNERABLES } from '../../core/validations/authSchemas';
import { Card } from '../../shared/components';
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  BarChart3,
  Calendar,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  RefreshCw,
  Briefcase,
  Eye,
  Shield,
  AlertOctagon,
} from 'lucide-react';

// Meses
const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function Dashboard() {
  const { user, tenantData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operations, setOperations] = useState([]);
  const [xmlHistory, setXmlHistory] = useState([]);

  const tenantId = user?.tenantId || user?.uid;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Fetch data
  const fetchData = async (isRefresh = false) => {
    if (!tenantId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Fetch operations
      const opsRef = collection(db, 'tenants', tenantId, 'operations');
      const opsSnap = await getDocs(opsRef);
      const opsData = opsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOperations(opsData);

      // Fetch XML generation history
      const xmlRef = collection(db, 'tenants', tenantId, 'xmlHistory');
      const xmlQuery = query(xmlRef, orderBy('generatedAt', 'desc'), limit(20));
      const xmlSnap = await getDocs(xmlQuery);
      const xmlData = xmlSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setXmlHistory(xmlData);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  // ========================================
  // KPIs CALCULATIONS
  // ========================================
  const kpis = useMemo(() => {
    const thisMonth = currentMonth;
    const thisYear = currentYear;

    // --- Operations by period ---
    const opsThisMonth = operations.filter(op =>
      op.periodYear === thisYear && op.periodMonth === thisMonth
    );
    const opsLastMonth = operations.filter(op => {
      const lm = thisMonth === 1 ? 12 : thisMonth - 1;
      const ly = thisMonth === 1 ? thisYear - 1 : thisYear;
      return op.periodYear === ly && op.periodMonth === lm;
    });

    // --- Total operations ---
    const totalOps = operations.length;
    const opsThisMonthCount = opsThisMonth.length;
    const opsLastMonthCount = opsLastMonth.length;
    const opsMonthChange = opsLastMonthCount > 0
      ? (((opsThisMonthCount - opsLastMonthCount) / opsLastMonthCount) * 100).toFixed(1)
      : opsThisMonthCount > 0 ? 100 : 0;

    // --- Total monto ---
    const totalMonto = operations.reduce((sum, op) => {
      const monto = parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);
      return sum + (isNaN(monto) ? 0 : monto);
    }, 0);

    const montoThisMonth = opsThisMonth.reduce((sum, op) => {
      const monto = parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);
      return sum + (isNaN(monto) ? 0 : monto);
    }, 0);

    const montoLastMonth = opsLastMonth.reduce((sum, op) => {
      const monto = parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);
      return sum + (isNaN(monto) ? 0 : monto);
    }, 0);

    const montoChange = montoLastMonth > 0
      ? (((montoThisMonth - montoLastMonth) / montoLastMonth) * 100).toFixed(1)
      : montoThisMonth > 0 ? 100 : 0;

    // --- Operations by activity ---
    const byActivity = {};
    operations.forEach(op => {
      const act = op.activityType || op.tipo_actividad || 'SIN_ACTIVIDAD';
      if (!byActivity[act]) byActivity[act] = { count: 0, monto: 0 };
      byActivity[act].count++;
      const m = parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);
      byActivity[act].monto += isNaN(m) ? 0 : m;
    });

    // --- EBR Risk Distribution ---
    const riskHigh = operations.filter(op => op.riskLevel === 'HIGH').length;
    const riskMedium = operations.filter(op => op.riskLevel === 'MEDIUM').length;
    const riskLow = operations.filter(op => !op.riskLevel || op.riskLevel === 'LOW').length;

    // --- Status Distribution ---
    const statusPendingReport = operations.filter(op => op.status === 'PENDING_REPORT').length;
    const statusPendingReview = operations.filter(op => op.status === 'PENDING_REVIEW').length;
    const statusReported = operations.filter(op => op.status === 'REPORTED' || op.reported === true || op.xmlReported === true).length;
    const statusPending = operations.filter(op => op.status === 'PENDING' || (!op.status && !op.reported && !op.xmlReported)).length;

    // --- Reported vs Unreported ---
    const reported = statusReported;
    const unreported = totalOps - reported;
    const reportingRate = totalOps > 0 ? ((reported / totalOps) * 100).toFixed(1) : 0;

    // --- XML generation stats ---
    const totalXmls = xmlHistory.length;
    const xmlsThisMonth = xmlHistory.filter(x => {
      const genDate = x.generatedAt?.toDate?.() || new Date(x.generatedAt);
      return genDate.getMonth() + 1 === thisMonth && genDate.getFullYear() === thisYear;
    }).length;

    // --- Validation stats from XML history ---
    const validXmls = xmlHistory.filter(x =>
      x.validationStatus === 'VALIDO' || x.status === 'VALIDO'
    ).length;
    const warningXmls = xmlHistory.filter(x =>
      x.validationStatus === 'VALIDO_CON_ADVERTENCIAS' || x.status === 'VALIDO_CON_ADVERTENCIAS'
    ).length;
    const errorXmls = xmlHistory.filter(x =>
      x.validationStatus === 'ERROR' || x.status === 'ERROR'
    ).length;

    // --- Unique clients ---
    const clientRFCs = new Set();
    operations.forEach(op => {
      const rfc = op.rfc_cliente || op.rfcCliente || op.rfc;
      if (rfc) clientRFCs.add(rfc);
    });

    // --- Operations by month for chart (last 6 months) ---
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      let m = thisMonth - i;
      let y = thisYear;
      if (m <= 0) { m += 12; y--; }
      const count = operations.filter(op => op.periodYear === y && op.periodMonth === m).length;
      const monto = operations.filter(op => op.periodYear === y && op.periodMonth === m)
        .reduce((sum, op) => {
          const v = parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);
          return sum + (isNaN(v) ? 0 : v);
        }, 0);
      monthlyData.push({ month: m, year: y, label: MONTH_NAMES[m]?.substring(0, 3), count, monto });
    }

    // --- Pending for current month ---
    const pendingThisMonth = opsThisMonth.filter(op => !op.reported && !op.xmlReported && op.status !== 'REPORTED').length;

    // --- Compliance status ---
    let complianceStatus = 'SIN_DATOS';
    if (totalOps > 0) {
      if (riskHigh > 0 && statusPendingReport > 0) complianceStatus = 'ALERTA_ALTA';
      else if (parseFloat(reportingRate) >= 100) complianceStatus = 'COMPLETO';
      else if (parseFloat(reportingRate) >= 80) complianceStatus = 'PARCIAL';
      else if (parseFloat(reportingRate) > 0) complianceStatus = 'PENDIENTE';
      else complianceStatus = 'SIN_REPORTAR';
    }

    return {
      totalOps,
      opsThisMonthCount,
      opsLastMonthCount,
      opsMonthChange: parseFloat(opsMonthChange),
      totalMonto,
      montoThisMonth,
      montoLastMonth,
      montoChange: parseFloat(montoChange),
      byActivity,
      reported,
      unreported,
      reportingRate: parseFloat(reportingRate),
      totalXmls,
      xmlsThisMonth,
      validXmls,
      warningXmls,
      errorXmls,
      uniqueClients: clientRFCs.size,
      monthlyData,
      pendingThisMonth,
      complianceStatus,
      // NEW: Risk & Status KPIs
      riskHigh,
      riskMedium,
      riskLow,
      statusPendingReport,
      statusPendingReview,
      statusReported,
      statusPending,
    };
  }, [operations, xmlHistory, currentMonth, currentYear]);

  // Format currency
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format compact number
  const formatCompact = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Get activity label
  const getActivityLabel = (id) => {
    const act = ACTIVIDADES_VULNERABLES.find(a => a.id === id);
    return act ? act.label : id;
  };

  // Get max value for bar chart
  const maxBarValue = Math.max(...kpis.monthlyData.map(d => d.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-500">Cargando dashboard...</p>
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
            <LayoutDashboard className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">
              Dashboard - Ciclo de Cumplimiento
            </h1>
            <p className="text-secondary-500">
              {tenantData?.razonSocial || 'PLD BDU'} — {MONTH_NAMES[currentMonth]} {currentYear}
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

      {/* ========================================
          ROW 1: Main KPI Cards
          ======================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Operaciones */}
        <Card className="p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              </div>
              {kpis.opsMonthChange !== 0 && (
                <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                  kpis.opsMonthChange > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {kpis.opsMonthChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(kpis.opsMonthChange)}%
                </span>
              )}
            </div>
            <p className="text-3xl font-bold text-secondary-900">{formatCompact(kpis.totalOps)}</p>
            <p className="text-sm text-secondary-500 mt-1">Operaciones Totales</p>
            <p className="text-xs text-secondary-400 mt-1">{kpis.opsThisMonthCount} este mes</p>
          </div>
        </Card>

        {/* Monto Total */}
        <Card className="p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              {kpis.montoChange !== 0 && (
                <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                  kpis.montoChange > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {kpis.montoChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(kpis.montoChange)}%
                </span>
              )}
            </div>
            <p className="text-3xl font-bold text-secondary-900">{formatMoney(kpis.totalMonto)}</p>
            <p className="text-sm text-secondary-500 mt-1">Monto Acumulado</p>
            <p className="text-xs text-secondary-400 mt-1">{formatMoney(kpis.montoThisMonth)} este mes</p>
          </div>
        </Card>

        {/* Riesgo Alto - Pendientes de Reporte */}
        <Card className={`p-5 relative overflow-hidden ${kpis.statusPendingReport > 0 ? 'ring-2 ring-red-300' : ''}`}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-red-600" />
              </div>
              {kpis.statusPendingReport > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700 animate-pulse">
                  <AlertOctagon className="w-3 h-3" />
                  Urgente
                </span>
              )}
            </div>
            <p className="text-3xl font-bold text-red-700">{kpis.statusPendingReport}</p>
            <p className="text-sm text-secondary-500 mt-1">Pendientes de Reporte</p>
            <p className="text-xs text-red-500 mt-1">Riesgo ALTO — Art. 17 LFPIORPI</p>
          </div>
        </Card>

        {/* Pendientes de Revisión */}
        <Card className={`p-5 relative overflow-hidden ${kpis.statusPendingReview > 0 ? 'ring-2 ring-amber-300' : ''}`}>
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-amber-700">{kpis.statusPendingReview}</p>
            <p className="text-sm text-secondary-500 mt-1">Pendientes de Revisión</p>
            <p className="text-xs text-amber-500 mt-1">Riesgo MEDIO — Requiere análisis</p>
          </div>
        </Card>
      </div>

      {/* ========================================
          ROW 2: EBR Semaphore + Compliance Status + Reporting Progress
          ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* EBR Risk Semaphore */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-600" />
            Semáforo de Riesgo (EBR)
          </h3>

          {kpis.totalOps === 0 ? (
            <div className="text-center py-8">
              <Shield className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
              <p className="text-sm text-secondary-500">Sin operaciones cargadas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* HIGH */}
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-red-700">Riesgo Alto</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-red-700">{kpis.riskHigh}</span>
                  <span className="text-xs text-red-500">
                    {kpis.totalOps > 0 ? ((kpis.riskHigh / kpis.totalOps) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>

              {/* MEDIUM */}
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium text-amber-700">Riesgo Medio</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-amber-700">{kpis.riskMedium}</span>
                  <span className="text-xs text-amber-500">
                    {kpis.totalOps > 0 ? ((kpis.riskMedium / kpis.totalOps) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>

              {/* LOW */}
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-700">Riesgo Bajo</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-700">{kpis.riskLow}</span>
                  <span className="text-xs text-green-500">
                    {kpis.totalOps > 0 ? ((kpis.riskLow / kpis.totalOps) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>

              {/* Visual bar */}
              {kpis.totalOps > 0 && (
                <div className="h-4 rounded-full overflow-hidden flex mt-2">
                  {kpis.riskHigh > 0 && (
                    <div className="bg-red-500 h-full" style={{ width: `${(kpis.riskHigh / kpis.totalOps) * 100}%` }} />
                  )}
                  {kpis.riskMedium > 0 && (
                    <div className="bg-amber-500 h-full" style={{ width: `${(kpis.riskMedium / kpis.totalOps) * 100}%` }} />
                  )}
                  {kpis.riskLow > 0 && (
                    <div className="bg-green-500 h-full" style={{ width: `${(kpis.riskLow / kpis.totalOps) * 100}%` }} />
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Compliance Status */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-600" />
            Estado de Cumplimiento
          </h3>

          <div className="text-center py-4">
            {kpis.complianceStatus === 'ALERTA_ALTA' && (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <AlertOctagon className="w-8 h-8 text-red-600" />
                </div>
                <p className="text-lg font-bold text-red-700">Alerta de Riesgo Alto</p>
                <p className="text-sm text-red-600 mt-1">{kpis.statusPendingReport} operaciones de alto riesgo sin reportar</p>
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">Generar XML y reportar al SAT antes del día 17</p>
                </div>
              </>
            )}
            {kpis.complianceStatus === 'COMPLETO' && (
              <>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-lg font-bold text-green-700">Cumplimiento Completo</p>
                <p className="text-sm text-green-600 mt-1">Todas las operaciones han sido reportadas</p>
              </>
            )}
            {kpis.complianceStatus === 'PARCIAL' && (
              <>
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-8 h-8 text-amber-600" />
                </div>
                <p className="text-lg font-bold text-amber-700">Cumplimiento Parcial</p>
                <p className="text-sm text-amber-600 mt-1">{kpis.unreported} operaciones pendientes de reportar</p>
              </>
            )}
            {kpis.complianceStatus === 'PENDIENTE' && (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-8 h-8 text-red-600" />
                </div>
                <p className="text-lg font-bold text-red-700">Requiere Atención</p>
                <p className="text-sm text-red-600 mt-1">{kpis.unreported} operaciones sin reportar</p>
              </>
            )}
            {kpis.complianceStatus === 'SIN_REPORTAR' && (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
                <p className="text-lg font-bold text-red-700">Sin Reportes</p>
                <p className="text-sm text-red-600 mt-1">Ninguna operación ha sido reportada</p>
              </>
            )}
            {kpis.complianceStatus === 'SIN_DATOS' && (
              <>
                <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Eye className="w-8 h-8 text-secondary-400" />
                </div>
                <p className="text-lg font-bold text-secondary-600">Sin Datos</p>
                <p className="text-sm text-secondary-500 mt-1">No hay operaciones cargadas aún</p>
              </>
            )}
          </div>
        </Card>

        {/* Reporting Progress */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-600" />
            Progreso de Reporte
          </h3>

          <div className="space-y-4">
            {/* Circular progress */}
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke={kpis.reportingRate >= 80 ? '#10B981' : kpis.reportingRate >= 50 ? '#F59E0B' : '#EF4444'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(kpis.reportingRate / 100) * 327} 327`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-secondary-900">{kpis.reportingRate}%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xl font-bold text-green-700">{kpis.reported}</p>
                <p className="text-xs text-green-600">Reportadas</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xl font-bold text-red-700">{kpis.unreported}</p>
                <p className="text-xs text-red-600">Pendientes</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ========================================
          ROW 3: Status Pipeline + Monthly Trend
          ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Pipeline */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-600" />
            Pipeline de Operaciones por Estatus
          </h3>

          {kpis.totalOps === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
              <p className="text-sm text-secondary-500">Sin operaciones</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-secondary-400" />
                  <span className="text-sm text-secondary-700">Pendiente (nueva)</span>
                </div>
                <span className="text-lg font-bold text-secondary-700">{kpis.statusPending}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-sm text-amber-700">En revisión (riesgo medio)</span>
                </div>
                <span className="text-lg font-bold text-amber-700">{kpis.statusPendingReview}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-sm text-red-700">Pendiente reporte (riesgo alto)</span>
                </div>
                <span className="text-lg font-bold text-red-700">{kpis.statusPendingReport}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm text-green-700">Reportadas al SAT</span>
                </div>
                <span className="text-lg font-bold text-green-700">{kpis.statusReported}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Monthly Trend - Bar Chart */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-600" />
            Tendencia Mensual de Operaciones
          </h3>

          {kpis.totalOps === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
              <p className="text-sm text-secondary-500">Sin datos para mostrar</p>
              <p className="text-xs text-secondary-400 mt-1">Carga operaciones para ver la tendencia</p>
            </div>
          ) : (
            <div className="space-y-3">
              {kpis.monthlyData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs text-secondary-500 w-12 text-right font-medium">
                    {item.label} {item.year !== currentYear ? `'${String(item.year).slice(2)}` : ''}
                  </span>
                  <div className="flex-1 h-8 bg-secondary-100 rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ${
                        item.month === currentMonth && item.year === currentYear
                          ? 'bg-primary-500'
                          : 'bg-primary-300'
                      }`}
                      style={{ width: `${Math.max((item.count / maxBarValue) * 100, item.count > 0 ? 8 : 0)}%` }}
                    />
                    {item.count > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-secondary-700">
                        {item.count} ops · {formatMoney(item.monto)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ========================================
          ROW 4: Activity Breakdown + XML Validation + Pending
          ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Breakdown */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary-600" />
            Operaciones por Actividad
          </h3>

          {Object.keys(kpis.byActivity).length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
              <p className="text-sm text-secondary-500">Sin actividades registradas</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {Object.entries(kpis.byActivity)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([actId, data]) => {
                  const pct = kpis.totalOps > 0 ? ((data.count / kpis.totalOps) * 100).toFixed(1) : 0;
                  return (
                    <div key={actId} className="p-3 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-secondary-900 truncate max-w-[60%]">
                          {getActivityLabel(actId)}
                        </span>
                        <span className="text-sm font-bold text-secondary-900">{data.count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-3">
                          <div className="h-2 bg-secondary-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-secondary-500 whitespace-nowrap">{formatMoney(data.monto)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        {/* XML Validation Summary */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary-600" />
            Validación XML (SAT)
          </h3>

          {kpis.totalXmls === 0 ? (
            <div className="text-center py-8">
              <FileCode className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
              <p className="text-sm text-secondary-500">No hay XMLs generados aún</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">Válidos</span>
                </div>
                <span className="text-lg font-bold text-green-700">{kpis.validXmls}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Con Advertencias</span>
                </div>
                <span className="text-lg font-bold text-amber-700">{kpis.warningXmls}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-medium text-red-700">Con Errores</span>
                </div>
                <span className="text-lg font-bold text-red-700">{kpis.errorXmls}</span>
              </div>
              <div className="pt-2 border-t border-secondary-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-secondary-500">Tasa de éxito</span>
                  <span className="text-sm font-bold text-secondary-900">
                    {kpis.totalXmls > 0 ? ((kpis.validXmls / kpis.totalXmls) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Pending This Month + Summary */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-secondary-700 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-600" />
            Pendientes del Mes
          </h3>

          <div className="text-center py-4">
            <p className="text-4xl font-bold text-secondary-900">{kpis.pendingThisMonth}</p>
            <p className="text-sm text-secondary-500 mt-2">
              Operaciones de {MONTH_NAMES[currentMonth]} sin reportar
            </p>
            {kpis.pendingThisMonth > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 flex items-center gap-1 justify-center">
                  <AlertTriangle className="w-3 h-3" />
                  Genera el XML antes del día 17 del siguiente mes
                </p>
              </div>
            )}
            {kpis.pendingThisMonth === 0 && kpis.opsThisMonthCount > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700 flex items-center gap-1 justify-center">
                  <CheckCircle className="w-3 h-3" />
                  Todo reportado para este mes
                </p>
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-secondary-200">
            <div className="text-center p-2 bg-violet-50 rounded-lg">
              <p className="text-lg font-bold text-violet-700">{kpis.uniqueClients}</p>
              <p className="text-xs text-violet-600">Clientes</p>
            </div>
            <div className="text-center p-2 bg-amber-50 rounded-lg">
              <p className="text-lg font-bold text-amber-700">{kpis.totalXmls}</p>
              <p className="text-xs text-amber-600">XMLs</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Footer note */}
      <div className="text-center py-2">
        <p className="text-xs text-secondary-400">
          Los KPIs se calculan en tiempo real sobre las operaciones cargadas. El semáforo EBR refleja la clasificación de riesgo según la LFPIORPI.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
