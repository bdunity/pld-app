/**
 * Billing Page
 * Página principal de facturación y suscripciones
 */

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../../core/context/AuthContext';
import {
  CreditCard,
  Receipt,
  Crown,
  Zap,
  Building2,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  History,
} from 'lucide-react';
import { Button, Alert, Card } from '../../shared/components';
import { PaymentModal } from './components/PaymentModal';
import { PaymentHistoryModal } from './components/PaymentHistoryModal';

// Configuración de planes
const PLAN_ICONS = {
  plan_free: Zap,
  plan_pro_mensual: Crown,
  plan_pro_anual: Crown,
  plan_enterprise: Building2,
};

const PLAN_COLORS = {
  plan_free: 'secondary',
  plan_pro_mensual: 'primary',
  plan_pro_anual: 'primary',
  plan_enterprise: 'warning',
};

const STATUS_CONFIG = {
  ACTIVE: {
    label: 'Activo',
    color: 'text-success',
    bg: 'bg-success/10',
    icon: Check,
  },
  PENDING_PAYMENT: {
    label: 'Pago Pendiente',
    color: 'text-warning',
    bg: 'bg-warning/10',
    icon: Clock,
  },
  PAST_DUE: {
    label: 'Pago Vencido',
    color: 'text-error',
    bg: 'bg-error/10',
    icon: AlertCircle,
  },
  CANCELLED: {
    label: 'Cancelado',
    color: 'text-secondary-500',
    bg: 'bg-secondary-100',
    icon: AlertCircle,
  },
};

export function BillingPage() {
  const { user } = useAuth();
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const functions = getFunctions();

  // Cargar datos de facturación y planes
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Cargar estado de facturación
        const getBillingStatus = httpsCallable(functions, 'getBillingStatus');
        const billingResult = await getBillingStatus();
        setBilling(billingResult.data.billing);

        // Cargar planes disponibles
        const getPlans = httpsCallable(functions, 'getPlans');
        const plansResult = await getPlans();
        setPlans(plansResult.data.plans);

        setLoading(false);
      } catch (err) {
        console.error('Error loading billing data:', err);
        setError('Error al cargar los datos de facturación');
        setLoading(false);
      }
    };

    if (user?.uid) {
      loadData();
    }
  }, [user?.uid, functions]);

  // Formatear precio
  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price);
  };

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // Calcular uso de operaciones
  const getUsagePercentage = () => {
    if (!billing || billing.operationsLimit === -1) return 0;
    return Math.min(100, Math.round((billing.operationsUsed / billing.operationsLimit) * 100));
  };

  // Manejar selección de plan
  const handleSelectPlan = (plan) => {
    if (plan.id === billing?.planId) return;
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  // Callback después de pago exitoso
  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    setSelectedPlan(null);

    // Recargar datos
    try {
      const getBillingStatus = httpsCallable(functions, 'getBillingStatus');
      const result = await getBillingStatus();
      setBilling(result.data.billing);
    } catch (err) {
      console.error('Error reloading billing:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[billing?.status] || STATUS_CONFIG.ACTIVE;
  const StatusIcon = statusConfig.icon;
  const CurrentPlanIcon = PLAN_ICONS[billing?.planId] || Zap;
  const usagePercentage = getUsagePercentage();

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-secondary-900 mb-2">
          Facturación y Suscripción
        </h1>
        <p className="text-secondary-600">
          Administra tu plan y métodos de pago
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Current Plan Card */}
      <Card className="mb-8 overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-primary-600 to-primary-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                <CurrentPlanIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-primary-100 text-sm mb-1">Tu plan actual</p>
                <h2 className="text-2xl font-bold text-white">
                  {billing?.planName || 'Plan Gratuito'}
                </h2>
                <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full ${statusConfig.bg}`}>
                  <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                  <span className={`text-sm font-medium ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-left md:text-right">
              <p className="text-primary-100 text-sm mb-1">Precio</p>
              <p className="text-3xl font-bold text-white">
                {formatPrice(billing?.price || 0)}
                <span className="text-lg text-primary-200">/mes</span>
              </p>
              {billing?.validUntil && (
                <p className="text-primary-200 text-sm mt-1">
                  Válido hasta: {formatDate(billing.validUntil)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="p-6 border-t border-secondary-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="font-semibold text-secondary-900">Uso del Plan</h3>
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              <History className="w-4 h-4" />
              Historial de Pagos
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Operations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-secondary-600">Operaciones</span>
                <span className="text-sm font-medium text-secondary-900">
                  {billing?.operationsUsed || 0} / {billing?.operationsLimit === -1 ? 'Ilimitadas' : billing?.operationsLimit}
                </span>
              </div>
              <div className="w-full bg-secondary-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usagePercentage > 80 ? 'bg-error' : usagePercentage > 50 ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: billing?.operationsLimit === -1 ? '5%' : `${usagePercentage}%` }}
                />
              </div>
              {billing?.operationsLimit !== -1 && usagePercentage > 80 && (
                <p className="text-xs text-error mt-1">
                  Te quedan pocas operaciones. Considera actualizar tu plan.
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3 justify-start md:justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-2"
              >
                <Receipt className="w-4 h-4" />
                Facturas
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Available Plans */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-secondary-900 mb-4">
          Planes Disponibles
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const PlanIcon = PLAN_ICONS[plan.id] || Zap;
            const isCurrentPlan = plan.id === billing?.planId;

            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition-all hover:shadow-lg ${
                  isCurrentPlan ? 'ring-2 ring-primary-500' : ''
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0 bg-primary-500 text-white text-xs px-3 py-1 rounded-bl-lg">
                    Plan Actual
                  </div>
                )}

                <div className="p-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                    plan.id === 'plan_free' ? 'bg-secondary-100' :
                    plan.id === 'plan_enterprise' ? 'bg-warning/10' : 'bg-primary-100'
                  }`}>
                    <PlanIcon className={`w-6 h-6 ${
                      plan.id === 'plan_free' ? 'text-secondary-600' :
                      plan.id === 'plan_enterprise' ? 'text-warning' : 'text-primary-600'
                    }`} />
                  </div>

                  <h3 className="text-lg font-bold text-secondary-900 mb-1">
                    {plan.name}
                  </h3>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-secondary-900">
                      {formatPrice(plan.price)}
                    </span>
                    <span className="text-secondary-500">
                      /{plan.interval === 'year' ? 'año' : 'mes'}
                    </span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-secondary-600">
                        <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={isCurrentPlan ? 'secondary' : 'primary'}
                    className="w-full"
                    disabled={isCurrentPlan}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {isCurrentPlan ? 'Plan Actual' : plan.price === 0 ? 'Seleccionar' : 'Actualizar'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment Methods Info */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-6 h-6 text-primary-600" />
          <h3 className="font-semibold text-secondary-900">Métodos de Pago Aceptados</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-secondary-50 rounded-lg">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <CreditCard className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-medium text-secondary-900">Tarjeta de Crédito/Débito</p>
              <p className="text-sm text-secondary-500">Visa, Mastercard, AMEX</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-secondary-50 rounded-lg">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
              <Building2 className="w-5 h-5 text-info" />
            </div>
            <div>
              <p className="font-medium text-secondary-900">Transferencia SPEI</p>
              <p className="text-sm text-secondary-500">Pago en 24-48 horas</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-secondary-500 mt-4">
          Pagos procesados de forma segura por Openpay (BBVA). Tus datos están protegidos con encriptación SSL.
        </p>
      </Card>

      {/* Payment Modal */}
      {showPaymentModal && selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedPlan(null);
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <PaymentHistoryModal onClose={() => setShowHistoryModal(false)} />
      )}
    </div>
  );
}

export default BillingPage;
