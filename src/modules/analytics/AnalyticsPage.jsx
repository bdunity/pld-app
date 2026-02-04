/**
 * Analytics Page
 * Dashboard de Business Intelligence
 */

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  BarChart3,
  TrendingUp,
  Users,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Loader2,
  MapPin,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { Card, Alert, Button } from '../../shared/components';

// Colores para gráficas
const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

const AGE_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316'];

const STATES_ABBREV = {
  AGS: 'Aguascalientes',
  BC: 'Baja California',
  BCS: 'Baja California Sur',
  CAM: 'Campeche',
  CHIS: 'Chiapas',
  CHIH: 'Chihuahua',
  CDMX: 'Ciudad de México',
  COAH: 'Coahuila',
  COL: 'Colima',
  DGO: 'Durango',
  MEX: 'Estado de México',
  GTO: 'Guanajuato',
  GRO: 'Guerrero',
  HGO: 'Hidalgo',
  JAL: 'Jalisco',
  MICH: 'Michoacán',
  MOR: 'Morelos',
  NAY: 'Nayarit',
  NL: 'Nuevo León',
  OAX: 'Oaxaca',
  PUE: 'Puebla',
  QRO: 'Querétaro',
  QROO: 'Quintana Roo',
  SLP: 'San Luis Potosí',
  SIN: 'Sinaloa',
  SON: 'Sonora',
  TAB: 'Tabasco',
  TAM: 'Tamaulipas',
  TLAX: 'Tlaxcala',
  VER: 'Veracruz',
  YUC: 'Yucatán',
  ZAC: 'Zacatecas',
};

export function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const functions = getFunctions();

  // Cargar estadísticas
  const loadStats = async () => {
    try {
      setLoading(true);
      const getDashboardStats = httpsCallable(functions, 'getDashboardStats');
      const result = await getDashboardStats();
      setStats(result.data.stats);
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Error al cargar las estadísticas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // Formatear moneda
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  // Preparar datos para gráfica de riesgo
  const getRiskData = () => {
    if (!stats?.riskLevels) return [];
    return [
      { name: 'Alto', value: stats.riskLevels.high || 0, color: RISK_COLORS.high },
      { name: 'Medio', value: stats.riskLevels.medium || 0, color: RISK_COLORS.medium },
      { name: 'Bajo', value: stats.riskLevels.low || 0, color: RISK_COLORS.low },
    ].filter(d => d.value > 0);
  };

  // Preparar datos para gráfica de operaciones por mes
  const getMonthlyData = () => {
    if (!stats?.operationsByMonth) return [];

    const months = Object.entries(stats.operationsByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12); // Últimos 12 meses

    return months.map(([key, value]) => {
      const [year, month] = key.split('-');
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return {
        name: `${monthNames[parseInt(month) - 1]} ${year.slice(-2)}`,
        operaciones: value,
      };
    });
  };

  // Preparar datos para gráfica de estados
  const getStateData = () => {
    if (!stats?.operationsByState) return [];

    return Object.entries(stats.operationsByState)
      .map(([state, count]) => ({
        name: STATES_ABBREV[state] || state,
        abbrev: state,
        operaciones: count,
      }))
      .sort((a, b) => b.operaciones - a.operaciones)
      .slice(0, 10); // Top 10 estados
  };

  // Preparar datos para pirámide de edad/género
  const getDemographicsData = () => {
    if (!stats?.demographics) return { ages: [], gender: [] };

    const ageRanges = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
    const ages = ageRanges.map((range, idx) => ({
      name: range,
      value: stats.demographics.ages?.[range] || 0,
      fill: AGE_COLORS[idx],
    }));

    const gender = [
      { name: 'Masculino', value: stats.demographics.gender?.M || 0, color: '#3b82f6' },
      { name: 'Femenino', value: stats.demographics.gender?.F || 0, color: '#ec4899' },
    ].filter(d => d.value > 0);

    return { ages, gender };
  };

  // Calcular totales de riesgo
  const getTotalRisk = () => {
    if (!stats?.riskLevels) return { high: 0, medium: 0, low: 0, total: 0 };
    const { high = 0, medium = 0, low = 0 } = stats.riskLevels;
    return { high, medium, low, total: high + medium + low };
  };

  const riskTotals = getTotalRisk();
  const riskData = getRiskData();
  const monthlyData = getMonthlyData();
  const stateData = getStateData();
  const demographicsData = getDemographicsData();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">
              Business Intelligence
            </h1>
            <p className="text-secondary-600">
              Análisis de operaciones y riesgos
            </p>
          </div>
        </div>

        <Button variant="secondary" onClick={loadStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-secondary-500">Total Operaciones</p>
              <p className="text-2xl font-bold text-secondary-900">
                {stats?.totalOperations?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-secondary-500">Monto Total</p>
              <p className="text-2xl font-bold text-secondary-900">
                {formatCurrency(stats?.totalAmount)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-error/10 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-error" />
            </div>
            <div>
              <p className="text-sm text-secondary-500">Alto Riesgo</p>
              <p className="text-2xl font-bold text-error">
                {riskTotals.high}
                <span className="text-sm font-normal text-secondary-400 ml-1">
                  ({riskTotals.total > 0 ? Math.round((riskTotals.high / riskTotals.total) * 100) : 0}%)
                </span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-info/10 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-info" />
            </div>
            <div>
              <p className="text-sm text-secondary-500">Clientes Únicos</p>
              <p className="text-2xl font-bold text-secondary-900">
                {(demographicsData.gender.reduce((sum, g) => sum + g.value, 0) ||
                  stats?.totalOperations || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Risk Distribution Pie */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Distribución de Riesgo (Semáforo)
          </h3>

          {riskData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {riskData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [value, 'Operaciones']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-secondary-400">
              Sin datos de riesgo disponibles
            </div>
          )}
        </Card>

        {/* Monthly Operations Bar */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Operaciones por Mes
          </h3>

          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="operaciones" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-secondary-400">
              Sin datos mensuales disponibles
            </div>
          )}
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* States Bar */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-secondary-500" />
            <h3 className="text-lg font-semibold text-secondary-900">
              Clientes por Estado (Top 10)
            </h3>
          </div>

          {stateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stateData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="abbrev"
                  tick={{ fontSize: 11 }}
                  width={50}
                />
                <Tooltip
                  formatter={(value) => [value, 'Operaciones']}
                  labelFormatter={(label) => STATES_ABBREV[label] || label}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="operaciones" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-secondary-400">
              Sin datos geográficos disponibles
            </div>
          )}
        </Card>

        {/* Demographics */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Demografía (Edad y Género)
          </h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Age Distribution */}
            <div>
              <p className="text-sm text-secondary-500 mb-2 text-center">Por Edad</p>
              {demographicsData.ages.some(a => a.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={demographicsData.ages}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Clientes">
                      {demographicsData.ages.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-secondary-400 text-sm">
                  Sin datos
                </div>
              )}
            </div>

            {/* Gender Distribution */}
            <div>
              <p className="text-sm text-secondary-500 mb-2 text-center">Por Género</p>
              {demographicsData.gender.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={demographicsData.gender}
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      dataKey="value"
                      label={({ name, percent }) => `${name.charAt(0)} ${(percent * 100).toFixed(0)}%`}
                    >
                      {demographicsData.gender.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-secondary-400 text-sm">
                  Sin datos
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-secondary-50 rounded-lg">
        <p className="text-xs text-secondary-500 text-center">
          Los datos se actualizan automáticamente con cada operación registrada.
          Última actualización: {stats?.updatedAt ? new Date(stats.updatedAt).toLocaleString('es-MX') : 'N/A'}
        </p>
      </div>
    </div>
  );
}

export default AnalyticsPage;
