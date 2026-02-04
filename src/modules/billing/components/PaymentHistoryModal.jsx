/**
 * Payment History Modal
 * Modal para mostrar historial de pagos
 */

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  X,
  History,
  CreditCard,
  Building2,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Download,
  Loader2,
  Receipt,
} from 'lucide-react';
import { Button, Alert } from '../../../shared/components';

// Configuración de estados
const STATUS_CONFIG = {
  completed: {
    label: 'Completado',
    color: 'text-success',
    bg: 'bg-success/10',
    icon: CheckCircle,
  },
  PENDING: {
    label: 'Pendiente',
    color: 'text-warning',
    bg: 'bg-warning/10',
    icon: Clock,
  },
  pending: {
    label: 'Pendiente',
    color: 'text-warning',
    bg: 'bg-warning/10',
    icon: Clock,
  },
  failed: {
    label: 'Fallido',
    color: 'text-error',
    bg: 'bg-error/10',
    icon: XCircle,
  },
  refunded: {
    label: 'Reembolsado',
    color: 'text-info',
    bg: 'bg-info/10',
    icon: AlertCircle,
  },
};

// Iconos por método de pago
const METHOD_ICONS = {
  CARD: CreditCard,
  SPEI: Building2,
};

export function PaymentHistoryModal({ onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const functions = getFunctions();

  // Cargar historial de pagos
  useEffect(() => {
    const loadPayments = async () => {
      try {
        setLoading(true);
        const getPaymentHistory = httpsCallable(functions, 'getPaymentHistory');
        const result = await getPaymentHistory();
        setPayments(result.data.payments || []);
      } catch (err) {
        console.error('Error loading payments:', err);
        setError('Error al cargar el historial de pagos');
      } finally {
        setLoading(false);
      }
    };

    loadPayments();
  }, [functions]);

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
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <History className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">
                  Historial de Pagos
                </h3>
                <p className="text-sm text-secondary-500">
                  Últimos 20 pagos realizados
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[500px] overflow-y-auto">
            {error && (
              <Alert variant="error" className="mb-4" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
                <h4 className="text-lg font-medium text-secondary-900 mb-1">
                  Sin pagos registrados
                </h4>
                <p className="text-secondary-500">
                  Aún no has realizado ningún pago
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => {
                  const statusConfig = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConfig.icon;
                  const MethodIcon = METHOD_ICONS[payment.method] || CreditCard;

                  return (
                    <div
                      key={payment.id}
                      className="flex items-center gap-4 p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors"
                    >
                      {/* Method Icon */}
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <MethodIcon className="w-5 h-5 text-secondary-600" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-secondary-900 truncate">
                            {payment.planName || 'Pago'}
                          </h4>
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${statusConfig.bg}`}>
                            <StatusIcon className={`w-3 h-3 ${statusConfig.color}`} />
                            <span className={`text-xs font-medium ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-secondary-500">
                          <span>{formatDate(payment.createdAt)}</span>
                          {payment.method === 'CARD' && payment.cardLast4 && (
                            <span className="font-mono">
                              **** {payment.cardLast4}
                            </span>
                          )}
                          {payment.method === 'SPEI' && (
                            <span>Transferencia SPEI</span>
                          )}
                        </div>

                        {/* SPEI pending info */}
                        {payment.method === 'SPEI' && payment.status === 'PENDING' && payment.clabe && (
                          <div className="mt-2 p-2 bg-warning/10 rounded text-xs">
                            <p className="text-warning font-medium">Pendiente de pago</p>
                            <p className="text-secondary-600 font-mono mt-1">
                              CLABE: {payment.clabe}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="text-right">
                        <p className="font-semibold text-secondary-900">
                          {formatPrice(payment.amount)}
                        </p>
                        <p className="text-xs text-secondary-500">MXN</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-secondary-200 bg-secondary-50 rounded-b-xl">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentHistoryModal;
