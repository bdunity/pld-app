import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../core/config/firebase';
import { useAuth } from '../../core/context/AuthContext';
import { ACTIVIDADES_VULNERABLES } from '../../core/validations/authSchemas';
import { Card, Button } from '../../shared/components';
import {
  Eye,
  Search,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  TrendingUp,
  Filter,
  ChevronDown,
  ChevronUp,
  Shield,
  Calendar,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  Info,
} from 'lucide-react';

// ========================================
// UMBRALES SAT POR ACTIVIDAD (en UMA)
// Ref: LFPIORPI Art. 17, Reglamento Art. 7
// Valor UMA 2025: $113.14 MXN diario
// ========================================
const UMA_DIARIO = 113.14;
const UMA_MENSUAL = UMA_DIARIO * 30.4; // Aprox

// Umbrales de identificación y aviso por actividad
// umbralIdentificacion: UMA a partir de la cual se debe identificar al cliente
// umbralAviso: UMA a partir de la cual se debe presentar aviso ante SAT
// periodoMeses: periodo de acumulación (normalmente 6 meses)
const UMBRALES_SAT = {
  JUEGOS_APUESTAS: {
    umbralIdentificacion: 325,
    umbralAviso: 645,
    periodoMeses: 6,
    fraccion: 'I',
    descripcion: 'Juegos con apuestas, concursos o sorteos',
  },
  TARJETAS_PREPAGO: {
    umbralIdentificacion: 805,
    umbralAviso: 1285,
    periodoMeses: 6,
    fraccion: 'II',
    descripcion: 'Tarjetas de servicios, crédito o prepago',
  },
  CHEQUES_VIAJERO: {
    umbralIdentificacion: 645,
    umbralAviso: 645,
    periodoMeses: 6,
    fraccion: 'III',
    descripcion: 'Cheques de viajero',
  },
  OPERACIONES_MUTUO: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 1605,
    periodoMeses: 6,
    fraccion: 'IV',
    descripcion: 'Mutuo, préstamos o créditos',
  },
  INMUEBLES: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 8025,
    periodoMeses: 6,
    fraccion: 'V',
    descripcion: 'Compraventa de inmuebles',
  },
  METALES_PIEDRAS: {
    umbralIdentificacion: 325,
    umbralAviso: 645,
    periodoMeses: 6,
    fraccion: 'VI',
    descripcion: 'Metales preciosos, piedras, joyería',
  },
  OBRAS_ARTE: {
    umbralIdentificacion: 2410,
    umbralAviso: 4815,
    periodoMeses: 6,
    fraccion: 'VII',
    descripcion: 'Obras de arte',
  },
  VEHICULOS: {
    umbralIdentificacion: 3210,
    umbralAviso: 6420,
    periodoMeses: 6,
    fraccion: 'VIII',
    descripcion: 'Vehículos aéreos, marítimos y terrestres',
  },
  BLINDAJE: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 2410,
    periodoMeses: 6,
    fraccion: 'IX',
    descripcion: 'Servicios de blindaje',
  },
  TRASLADO_VALORES: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 3210,
    periodoMeses: 6,
    fraccion: 'X',
    descripcion: 'Traslado o custodia de valores',
  },
  SERVICIOS_FE_PUBLICA: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 0, // Siempre se presenta aviso
    periodoMeses: 6,
    fraccion: 'XII',
    descripcion: 'Fe pública (notarios, corredores)',
  },
  SERVICIOS_PROFESIONALES: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 3210,
    periodoMeses: 6,
    fraccion: 'XI',
    descripcion: 'Servicios profesionales independientes',
  },
  ARRENDAMIENTO: {
    umbralIdentificacion: 1605,
    umbralAviso: 3210,
    periodoMeses: 6,
    fraccion: 'XV',
    descripcion: 'Arrendamiento de inmuebles',
  },
  ACTIVOS_VIRTUALES: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 210,
    periodoMeses: 6,
    fraccion: 'XVI',
    descripcion: 'Operaciones con activos virtuales',
  },
  CONSTITUCION_PERSONAS: {
    umbralIdentificacion: 0, // Siempre se identifica
    umbralAviso: 0, // Siempre se presenta aviso
    periodoMeses: 6,
    fraccion: 'XIII-XIV',
    descripcion: 'Constitución de personas morales',
  },
};

// Status colors and labels
const STATUS_CONFIG = {
  CRITICO: { color: 'red', label: 'Crítico', icon: XCircle, bgClass: 'bg-red-100', textClass: 'text-red-700', borderClass: 'border-red-200', barClass: 'bg-red-500' },
  ALERTA: { color: 'amber', label: 'Alerta', icon: AlertTriangle, bgClass: 'bg-amber-100', textClass: 'text-amber-700', borderClass: 'border-amber-200', barClass: 'bg-amber-500' },
  EN_PROGRESO: { color: 'blue', label: 'En Progreso', icon: TrendingUp, bgClass: 'bg-blue-100', textClass: 'text-blue-700', borderClass: 'border-blue-200', barClass: 'bg-blue-500' },
  NORMAL: { color: 'green', label: 'Normal', icon: CheckCircle, bgClass: 'bg-green-100', textClass: 'text-green-700', borderClass: 'border-green-200', barClass: 'bg-green-500' },
};

export function MonitoringPage() {
  const { user, tenantData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operations, setOperations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('TODOS');
  const [filterActivity, setFilterActivity] = useState('');
  const [expandedClient, setExpandedClient] = useState(null);
  const [sortBy, setSortBy] = useState('porcentaje_desc');

  const tenantId = user?.tenantId || user?.uid;

  // Fetch operations
  const fetchOperations = async (isRefresh = false) => {
    if (!tenantId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const opsRef = collection(db, 'tenants', tenantId, 'operations');
      const snap = await getDocs(opsRef);
      setOperations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching operations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, [tenantId]);

  // ========================================
  // COMPUTE MONITORING DATA PER CLIENT
  // ========================================
  const clientMonitoringData = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Group operations by client RFC + activity
    const clientMap = {};

    operations.forEach(op => {
      const rfc = op.rfc_cliente || op.rfcCliente || op.rfc || '';
      const nombre = op.nombre_cliente || op.nombreCliente || op.nombre || op.razon_social || op.razonSocial || '';
      const activity = op.activityType || op.tipo_actividad || '';
      const monto = parseFloat(op.monto_operacion || op.montoOperacion || op.monto || 0);

      // Parse operation date
      let opDate = null;
      const fechaRaw = op.fecha_operacion || op.fechaOperacion || op.fecha || op.createdAt;
      if (fechaRaw) {
        if (fechaRaw.toDate) opDate = fechaRaw.toDate();
        else if (typeof fechaRaw === 'string') {
          // Handle YYYYMMDD or YYYY-MM-DD
          if (/^\d{8}$/.test(fechaRaw)) {
            opDate = new Date(`${fechaRaw.slice(0,4)}-${fechaRaw.slice(4,6)}-${fechaRaw.slice(6,8)}`);
          } else {
            opDate = new Date(fechaRaw);
          }
        }
      }
      if (!opDate || isNaN(opDate.getTime())) {
        opDate = new Date(); // fallback
      }

      if (!rfc || !activity) return;

      const key = `${rfc}__${activity}`;
      if (!clientMap[key]) {
        clientMap[key] = {
          rfc,
          nombre: nombre || rfc,
          activity,
          operations: [],
          totalMonto: 0,
          montoLast6Months: 0,
          firstOpDate: opDate,
          lastOpDate: opDate,
        };
      }

      const client = clientMap[key];
      client.operations.push({ ...op, parsedDate: opDate, parsedMonto: isNaN(monto) ? 0 : monto });
      client.totalMonto += isNaN(monto) ? 0 : monto;

      // Accumulate last 6 months
      if (opDate >= sixMonthsAgo) {
        client.montoLast6Months += isNaN(monto) ? 0 : monto;
      }

      if (opDate < client.firstOpDate) client.firstOpDate = opDate;
      if (opDate > client.lastOpDate) client.lastOpDate = opDate;
    });

    // Calculate monitoring status for each client
    return Object.values(clientMap).map(client => {
      const umbral = UMBRALES_SAT[client.activity];
      if (!umbral) return null;

      const umbralAvisoMXN = umbral.umbralAviso * UMA_DIARIO;
      const umbralIdMXN = umbral.umbralIdentificacion * UMA_DIARIO;

      // Percentage of threshold reached (6 month accumulation)
      const porcentajeUmbral = umbralAvisoMXN > 0
        ? Math.min((client.montoLast6Months / umbralAvisoMXN) * 100, 100)
        : (client.montoLast6Months > 0 ? 100 : 0);

      // Calculate days elapsed since first operation
      const daysSinceFirst = Math.floor((new Date() - client.firstOpDate) / (1000 * 60 * 60 * 24));
      const daysInMonitoring = Math.min(daysSinceFirst, 180); // Max 6 months = 180 days
      const monitoringProgress = Math.min((daysInMonitoring / 180) * 100, 100);

      // Determine status
      let status = 'NORMAL';
      if (porcentajeUmbral >= 100) {
        status = 'CRITICO'; // Already at or above threshold
      } else if (porcentajeUmbral >= 75) {
        status = 'ALERTA'; // Getting close
      } else if (porcentajeUmbral >= 25) {
        status = 'EN_PROGRESO'; // In progress
      }

      // Monitoring end date (6 months from first op)
      const monitoringEndDate = new Date(client.firstOpDate);
      monitoringEndDate.setMonth(monitoringEndDate.getMonth() + 6);

      return {
        ...client,
        umbralAvisoMXN,
        umbralIdMXN,
        umbralAvisoUMA: umbral.umbralAviso,
        porcentajeUmbral: Math.round(porcentajeUmbral * 10) / 10,
        status,
        daysInMonitoring,
        monitoringProgress: Math.round(monitoringProgress * 10) / 10,
        monitoringEndDate,
        fraccion: umbral.fraccion,
        periodoMeses: umbral.periodoMeses,
        opCount: client.operations.length,
      };
    }).filter(Boolean);
  }, [operations]);

  // ========================================
  // FILTERS AND SORTING
  // ========================================
  const filteredClients = useMemo(() => {
    let result = [...clientMonitoringData];

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.rfc.toLowerCase().includes(term) ||
        c.nombre.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (filterStatus !== 'TODOS') {
      result = result.filter(c => c.status === filterStatus);
    }

    // Activity filter
    if (filterActivity) {
      result = result.filter(c => c.activity === filterActivity);
    }

    // Sort
    switch (sortBy) {
      case 'porcentaje_desc':
        result.sort((a, b) => b.porcentajeUmbral - a.porcentajeUmbral);
        break;
      case 'porcentaje_asc':
        result.sort((a, b) => a.porcentajeUmbral - b.porcentajeUmbral);
        break;
      case 'monto_desc':
        result.sort((a, b) => b.montoLast6Months - a.montoLast6Months);
        break;
      case 'nombre_asc':
        result.sort((a, b) => a.nombre.localeCompare(b.nombre));
        break;
      default:
        result.sort((a, b) => b.porcentajeUmbral - a.porcentajeUmbral);
    }

    return result;
  }, [clientMonitoringData, searchTerm, filterStatus, filterActivity, sortBy]);

  // ========================================
  // SUMMARY KPIs
  // ========================================
  const summaryKPIs = useMemo(() => {
    const total = clientMonitoringData.length;
    const criticos = clientMonitoringData.filter(c => c.status === 'CRITICO').length;
    const alertas = clientMonitoringData.filter(c => c.status === 'ALERTA').length;
    const enProgreso = clientMonitoringData.filter(c => c.status === 'EN_PROGRESO').length;
    const normales = clientMonitoringData.filter(c => c.status === 'NORMAL').length;
    const activitiesSet = new Set(clientMonitoringData.map(c => c.activity));
    return { total, criticos, alertas, enProgreso, normales, activitiesCount: activitiesSet.size };
  }, [clientMonitoringData]);

  // Format money
  const formatMoney = (amount) => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);

  // Get activity label
  const getActivityLabel = (id) => {
    const act = ACTIVIDADES_VULNERABLES.find(a => a.id === id);
    return act ? act.label : id;
  };

  // Get short activity label
  const getShortActivityLabel = (id) => {
    const labels = {
      JUEGOS_APUESTAS: 'Juegos/Apuestas',
      TARJETAS_PREPAGO: 'Tarjetas Prepago',
      CHEQUES_VIAJERO: 'Cheques Viajero',
      OPERACIONES_MUTUO: 'Mutuo/Crédito',
      INMUEBLES: 'Inmuebles',
      METALES_PIEDRAS: 'Metales/Piedras',
      OBRAS_ARTE: 'Obras de Arte',
      VEHICULOS: 'Vehículos',
      BLINDAJE: 'Blindaje',
      TRASLADO_VALORES: 'Traslado Valores',
      SERVICIOS_FE_PUBLICA: 'Fe Pública',
      SERVICIOS_PROFESIONALES: 'Serv. Profesionales',
      ARRENDAMIENTO: 'Arrendamiento',
      ACTIVOS_VIRTUALES: 'Activos Virtuales',
      CONSTITUCION_PERSONAS: 'Constitución PM',
    };
    return labels[id] || id;
  };

  // Get progress bar color based on percentage
  const getBarColor = (pct) => {
    if (pct >= 100) return 'bg-red-500';
    if (pct >= 75) return 'bg-amber-500';
    if (pct >= 50) return 'bg-yellow-400';
    if (pct >= 25) return 'bg-blue-500';
    return 'bg-green-500';
  };

  // Get progress bar bg
  const getBarBg = (pct) => {
    if (pct >= 100) return 'bg-red-100';
    if (pct >= 75) return 'bg-amber-100';
    if (pct >= 50) return 'bg-yellow-100';
    if (pct >= 25) return 'bg-blue-100';
    return 'bg-green-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-500">Cargando monitoreo...</p>
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
            <Eye className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">
              Monitoreo de Clientes
            </h1>
            <p className="text-secondary-500">
              Acumulación de operaciones en periodo de 6 meses — LFPIORPI Art. 17
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchOperations(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Monitoreo de acumulación SAT</p>
            <p className="text-sm text-blue-700 mt-1">
              Conforme al Art. 7 del Reglamento de la LFPIORPI, las operaciones se acumulan por cliente y actividad
              en periodos de 6 meses. Cuando el monto acumulado alcanza el <strong>umbral de aviso</strong>, se debe
              presentar el aviso ante el SAT a más tardar el día 17 del mes siguiente. El semáforo indica qué tan
              cerca está cada cliente de alcanzar dicho umbral.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================
          SUMMARY KPI CARDS
          ======================================== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-4 text-center cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus('TODOS')}>
          <Users className="w-6 h-6 text-primary-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-secondary-900">{summaryKPIs.total}</p>
          <p className="text-xs text-secondary-500">Total Clientes</p>
        </Card>
        <Card className={`p-4 text-center cursor-pointer hover:shadow-lg transition-shadow ${filterStatus === 'CRITICO' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'CRITICO' ? 'TODOS' : 'CRITICO')}>
          <XCircle className="w-6 h-6 text-red-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-700">{summaryKPIs.criticos}</p>
          <p className="text-xs text-red-600">Críticos (≥100%)</p>
        </Card>
        <Card className={`p-4 text-center cursor-pointer hover:shadow-lg transition-shadow ${filterStatus === 'ALERTA' ? 'ring-2 ring-amber-500' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'ALERTA' ? 'TODOS' : 'ALERTA')}>
          <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-700">{summaryKPIs.alertas}</p>
          <p className="text-xs text-amber-600">Alerta (≥75%)</p>
        </Card>
        <Card className={`p-4 text-center cursor-pointer hover:shadow-lg transition-shadow ${filterStatus === 'EN_PROGRESO' ? 'ring-2 ring-blue-500' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'EN_PROGRESO' ? 'TODOS' : 'EN_PROGRESO')}>
          <TrendingUp className="w-6 h-6 text-blue-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-700">{summaryKPIs.enProgreso}</p>
          <p className="text-xs text-blue-600">En Progreso (25-74%)</p>
        </Card>
        <Card className={`p-4 text-center cursor-pointer hover:shadow-lg transition-shadow ${filterStatus === 'NORMAL' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setFilterStatus(filterStatus === 'NORMAL' ? 'TODOS' : 'NORMAL')}>
          <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-700">{summaryKPIs.normales}</p>
          <p className="text-xs text-green-600">Normal (&lt;25%)</p>
        </Card>
        <Card className="p-4 text-center">
          <BarChart3 className="w-6 h-6 text-violet-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-violet-700">{summaryKPIs.activitiesCount}</p>
          <p className="text-xs text-violet-600">Actividades</p>
        </Card>
      </div>

      {/* ========================================
          FILTERS AND SEARCH
          ======================================== */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o RFC del cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
            />
          </div>

          {/* Activity Filter */}
          <select
            value={filterActivity}
            onChange={(e) => setFilterActivity(e.target.value)}
            className="px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
          >
            <option value="">Todas las actividades</option>
            {ACTIVIDADES_VULNERABLES.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
          >
            <option value="porcentaje_desc">Mayor % umbral</option>
            <option value="porcentaje_asc">Menor % umbral</option>
            <option value="monto_desc">Mayor monto</option>
            <option value="nombre_asc">Nombre A-Z</option>
          </select>
        </div>

        {filterStatus !== 'TODOS' && (
          <div className="mt-3 flex items-center gap-2">
            <Filter className="w-4 h-4 text-secondary-400" />
            <span className="text-sm text-secondary-600">
              Filtrando por: <strong>{STATUS_CONFIG[filterStatus]?.label}</strong>
            </span>
            <button
              onClick={() => setFilterStatus('TODOS')}
              className="text-xs text-primary-600 hover:underline ml-2"
            >
              Limpiar filtro
            </button>
          </div>
        )}
      </Card>

      {/* ========================================
          CLIENT MONITORING LIST
          ======================================== */}
      {filteredClients.length === 0 ? (
        <Card className="p-12 text-center">
          <Eye className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-secondary-700">Sin clientes para monitorear</h3>
          <p className="text-secondary-500 mt-1">
            {operations.length === 0
              ? 'No hay operaciones cargadas. Ve a "Carga de Datos" para importar operaciones.'
              : 'No se encontraron clientes con los filtros aplicados.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-secondary-500">
            Mostrando {filteredClients.length} de {clientMonitoringData.length} clientes monitoreados
          </p>

          {filteredClients.map((client, idx) => {
            const statusCfg = STATUS_CONFIG[client.status];
            const StatusIcon = statusCfg.icon;
            const isExpanded = expandedClient === `${client.rfc}__${client.activity}`;

            return (
              <Card key={`${client.rfc}__${client.activity}__${idx}`} className="p-0 overflow-hidden">
                {/* Main Row */}
                <div
                  className="p-4 cursor-pointer hover:bg-secondary-50 transition-colors"
                  onClick={() => setExpandedClient(isExpanded ? null : `${client.rfc}__${client.activity}`)}
                >
                  <div className="flex items-start gap-4">
                    {/* Status Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${statusCfg.bgClass}`}>
                      <StatusIcon className={`w-5 h-5 ${statusCfg.textClass}`} />
                    </div>

                    {/* Client Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-secondary-900 truncate">{client.nombre}</h4>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bgClass} ${statusCfg.textClass}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary-500">
                        <span className="font-mono">{client.rfc}</span>
                        <span>Fracc. {client.fraccion} — {getShortActivityLabel(client.activity)}</span>
                        <span>{client.opCount} operaciones</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-secondary-600">
                            Acumulado 6 meses: <strong>{formatMoney(client.montoLast6Months)}</strong>
                          </span>
                          <span className="text-xs font-bold" style={{
                            color: client.porcentajeUmbral >= 100 ? '#DC2626' :
                              client.porcentajeUmbral >= 75 ? '#D97706' :
                              client.porcentajeUmbral >= 50 ? '#CA8A04' :
                              client.porcentajeUmbral >= 25 ? '#2563EB' : '#16A34A'
                          }}>
                            {client.porcentajeUmbral}%
                          </span>
                        </div>
                        <div className={`w-full h-3 rounded-full overflow-hidden ${getBarBg(client.porcentajeUmbral)}`}>
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${getBarColor(client.porcentajeUmbral)}`}
                            style={{ width: `${Math.min(client.porcentajeUmbral, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-secondary-400">$0</span>
                          <span className="text-xs text-secondary-400">
                            Umbral: {formatMoney(client.umbralAvisoMXN)} ({client.umbralAvisoUMA} UMA)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expand Arrow */}
                    <div className="shrink-0 mt-2">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-secondary-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-secondary-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-secondary-200 bg-secondary-50 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-white rounded-lg p-3 border border-secondary-200">
                        <p className="text-xs text-secondary-500 mb-1 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> Monto Acumulado (6 meses)
                        </p>
                        <p className="text-xl font-bold text-secondary-900">{formatMoney(client.montoLast6Months)}</p>
                        <p className="text-xs text-secondary-400 mt-1">de {formatMoney(client.umbralAvisoMXN)} umbral de aviso</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-secondary-200">
                        <p className="text-xs text-secondary-500 mb-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Periodo de Monitoreo
                        </p>
                        <p className="text-xl font-bold text-secondary-900">{client.daysInMonitoring} días</p>
                        <p className="text-xs text-secondary-400 mt-1">
                          {client.firstOpDate.toLocaleDateString('es-MX')} — {client.monitoringEndDate.toLocaleDateString('es-MX')}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-secondary-200">
                        <p className="text-xs text-secondary-500 mb-1 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> Actividad Vulnerable
                        </p>
                        <p className="text-sm font-bold text-secondary-900">{getActivityLabel(client.activity)}</p>
                        <p className="text-xs text-secondary-400 mt-1">
                          Fracción {client.fraccion} — Identificación: {client.umbralIdMXN > 0 ? formatMoney(client.umbralIdMXN) : 'Siempre'}
                        </p>
                      </div>
                    </div>

                    {/* Operations Table */}
                    <div>
                      <h5 className="text-sm font-semibold text-secondary-700 mb-2">
                        Historial de Operaciones ({client.opCount})
                      </h5>
                      <div className="max-h-48 overflow-y-auto border border-secondary-200 rounded-lg bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary-100 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-secondary-600">Fecha</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-secondary-600">Tipo</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-secondary-600">Monto</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-secondary-600">Acumulado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-secondary-100">
                            {client.operations
                              .sort((a, b) => a.parsedDate - b.parsedDate)
                              .reduce((acc, op) => {
                                const prev = acc.length > 0 ? acc[acc.length - 1].runningTotal : 0;
                                acc.push({ ...op, runningTotal: prev + op.parsedMonto });
                                return acc;
                              }, [])
                              .map((op, i) => (
                                <tr key={i} className="hover:bg-secondary-50">
                                  <td className="px-3 py-2 text-secondary-700">
                                    {op.parsedDate.toLocaleDateString('es-MX')}
                                  </td>
                                  <td className="px-3 py-2 text-secondary-600">
                                    {op.tipo_operacion || op.tipoOperacion || op.tipo || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-secondary-900">
                                    {formatMoney(op.parsedMonto)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span className={`font-medium ${
                                      op.runningTotal >= client.umbralAvisoMXN ? 'text-red-600' :
                                      op.runningTotal >= client.umbralAvisoMXN * 0.75 ? 'text-amber-600' :
                                      'text-secondary-600'
                                    }`}>
                                      {formatMoney(op.runningTotal)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Warning if critical */}
                    {client.status === 'CRITICO' && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-800">Umbral de aviso alcanzado</p>
                          <p className="text-xs text-red-700 mt-1">
                            Este cliente ha alcanzado el umbral de aviso ({client.umbralAvisoUMA} UMA = {formatMoney(client.umbralAvisoMXN)}).
                            Se debe presentar aviso ante el SAT a más tardar el día 17 del mes siguiente a la última operación.
                          </p>
                        </div>
                      </div>
                    )}
                    {client.status === 'ALERTA' && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">Próximo a alcanzar umbral</p>
                          <p className="text-xs text-amber-700 mt-1">
                            Este cliente ha acumulado el {client.porcentajeUmbral}% del umbral de aviso.
                            Faltan {formatMoney(client.umbralAvisoMXN - client.montoLast6Months)} para alcanzar el umbral.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-2">
        <p className="text-xs text-secondary-400">
          Umbrales basados en UMA 2025: ${UMA_DIARIO} MXN diario. Los monitoreos se calculan en tiempo real
          con base en las operaciones cargadas. En el futuro estos KPIs serán personalizables.
        </p>
      </div>
    </div>
  );
}

export default MonitoringPage;
