/**
 * Payment Modal
 * Modal de pago con tokenización Openpay.js
 */

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  X,
  CreditCard,
  Building2,
  Lock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { Button, Alert, Input } from '../../../shared/components';

// Configuración de Openpay
const OPENPAY_ID = import.meta.env.VITE_OPENPAY_ID || 'YOUR_MERCHANT_ID';
const OPENPAY_PUBLIC_KEY = import.meta.env.VITE_OPENPAY_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';
const OPENPAY_SANDBOX = import.meta.env.VITE_OPENPAY_SANDBOX !== 'false';

// Métodos de pago disponibles
const PAYMENT_METHODS = {
  CARD: {
    id: 'CARD',
    name: 'Tarjeta de Crédito/Débito',
    icon: CreditCard,
    description: 'Pago inmediato con Visa, Mastercard o AMEX',
  },
  SPEI: {
    id: 'SPEI',
    name: 'Transferencia SPEI',
    icon: Building2,
    description: 'Pago en 24-48 horas mediante transferencia bancaria',
  },
};

export function PaymentModal({ plan, onClose, onSuccess }) {
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [speiInstructions, setSpeiInstructions] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Estado del formulario de tarjeta
  const [cardForm, setCardForm] = useState({
    holderName: '',
    cardNumber: '',
    expirationMonth: '',
    expirationYear: '',
    cvv: '',
  });

  const [deviceSessionId, setDeviceSessionId] = useState(null);

  const functions = getFunctions();

  // Cargar Openpay.js
  useEffect(() => {
    const loadOpenpayScript = () => {
      // Verificar si ya está cargado
      if (window.OpenPay) {
        initializeOpenpay();
        return;
      }

      // Cargar script de Openpay
      const script = document.createElement('script');
      script.src = 'https://js.openpay.mx/openpay.v1.min.js';
      script.async = true;
      script.onload = () => {
        // Cargar script de device data
        const deviceScript = document.createElement('script');
        deviceScript.src = 'https://js.openpay.mx/openpay-data.v1.min.js';
        deviceScript.async = true;
        deviceScript.onload = initializeOpenpay;
        document.body.appendChild(deviceScript);
      };
      document.body.appendChild(script);
    };

    const initializeOpenpay = () => {
      if (window.OpenPay) {
        window.OpenPay.setId(OPENPAY_ID);
        window.OpenPay.setApiKey(OPENPAY_PUBLIC_KEY);
        window.OpenPay.setSandboxMode(OPENPAY_SANDBOX);

        // Generar device session ID
        const sessionId = window.OpenPay.deviceData.setup('payment-form', 'deviceSessionId');
        setDeviceSessionId(sessionId);
      }
    };

    loadOpenpayScript();
  }, []);

  // Formatear precio
  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price);
  };

  // Formatear número de tarjeta
  const formatCardNumber = (value) => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').substring(0, 19) : '';
  };

  // Manejar cambio en formulario de tarjeta
  const handleCardChange = (field, value) => {
    let formattedValue = value;

    if (field === 'cardNumber') {
      formattedValue = formatCardNumber(value);
    } else if (field === 'expirationMonth' || field === 'expirationYear') {
      formattedValue = value.replace(/\D/g, '').substring(0, 2);
    } else if (field === 'cvv') {
      formattedValue = value.replace(/\D/g, '').substring(0, 4);
    }

    setCardForm((prev) => ({ ...prev, [field]: formattedValue }));
  };

  // Validar formulario de tarjeta
  const validateCardForm = () => {
    const { holderName, cardNumber, expirationMonth, expirationYear, cvv } = cardForm;

    if (!holderName.trim()) return 'Ingresa el nombre del titular';
    if (cardNumber.replace(/\s/g, '').length < 15) return 'Número de tarjeta inválido';
    if (!expirationMonth || parseInt(expirationMonth) < 1 || parseInt(expirationMonth) > 12) {
      return 'Mes de expiración inválido';
    }
    if (!expirationYear || parseInt(expirationYear) < parseInt(new Date().getFullYear().toString().slice(-2))) {
      return 'Año de expiración inválido';
    }
    if (cvv.length < 3) return 'CVV inválido';

    return null;
  };

  // Crear token de tarjeta
  const createCardToken = () => {
    return new Promise((resolve, reject) => {
      const cardData = {
        holder_name: cardForm.holderName,
        card_number: cardForm.cardNumber.replace(/\s/g, ''),
        expiration_month: cardForm.expirationMonth.padStart(2, '0'),
        expiration_year: cardForm.expirationYear,
        cvv2: cardForm.cvv,
      };

      window.OpenPay.token.create(
        cardData,
        (response) => {
          resolve(response.data.id);
        },
        (error) => {
          reject(new Error(error.data?.description || 'Error al procesar la tarjeta'));
        }
      );
    });
  };

  // Procesar pago con tarjeta
  const handleCardPayment = async () => {
    const validationError = validateCardForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Crear token
      const tokenId = await createCardToken();

      // Llamar a la función de suscripción
      const subscribeTenant = httpsCallable(functions, 'subscribeTenant');
      const result = await subscribeTenant({
        planId: plan.id,
        paymentMethod: 'CARD',
        tokenId: tokenId,
        deviceSessionId: deviceSessionId,
      });

      if (result.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message || 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  // Procesar pago con SPEI
  const handleSpeiPayment = async () => {
    setLoading(true);
    setError('');

    try {
      const subscribeTenant = httpsCallable(functions, 'subscribeTenant');
      const result = await subscribeTenant({
        planId: plan.id,
        paymentMethod: 'SPEI',
      });

      if (result.data.success && result.data.paymentInstructions) {
        setSpeiInstructions(result.data.paymentInstructions);
      }
    } catch (err) {
      console.error('SPEI payment error:', err);
      setError(err.message || 'Error al generar instrucciones de pago');
    } finally {
      setLoading(false);
    }
  };

  // Copiar al portapapeles
  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Error copying:', err);
    }
  };

  // Manejar envío del formulario
  const handleSubmit = (e) => {
    e.preventDefault();

    if (plan.price === 0) {
      // Plan gratuito - activar directamente
      handleFreeSubscription();
    } else if (paymentMethod === 'CARD') {
      handleCardPayment();
    } else {
      handleSpeiPayment();
    }
  };

  // Suscripción gratuita
  const handleFreeSubscription = async () => {
    setLoading(true);
    setError('');

    try {
      const subscribeTenant = httpsCallable(functions, 'subscribeTenant');
      const result = await subscribeTenant({
        planId: plan.id,
      });

      if (result.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.message || 'Error al activar el plan');
    } finally {
      setLoading(false);
    }
  };

  // Si ya tenemos instrucciones SPEI, mostrar esa vista
  if (speiInstructions) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="relative w-full max-w-md bg-white rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-info" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-secondary-900">
                    Instrucciones de Pago SPEI
                  </h3>
                  <p className="text-sm text-secondary-500">{plan.name}</p>
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
            <div className="px-6 py-4">
              <div className="bg-info/5 border border-info/20 rounded-lg p-4 mb-4">
                <p className="text-sm text-info font-medium mb-2">
                  Realiza tu transferencia SPEI con los siguientes datos:
                </p>
                <p className="text-xs text-secondary-600">
                  Una vez recibido el pago, tu plan se activará automáticamente.
                </p>
              </div>

              <div className="space-y-4">
                {/* CLABE */}
                <div className="bg-secondary-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-secondary-500 mb-1">CLABE Interbancaria</p>
                      <p className="font-mono font-semibold text-secondary-900">
                        {speiInstructions.clabe}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(speiInstructions.clabe, 'clabe')}
                      className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-white rounded-lg transition-colors"
                    >
                      {copiedField === 'clabe' ? (
                        <Check className="w-5 h-5 text-success" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Banco */}
                <div className="bg-secondary-50 rounded-lg p-4">
                  <p className="text-xs text-secondary-500 mb-1">Banco</p>
                  <p className="font-medium text-secondary-900">{speiInstructions.bankName}</p>
                </div>

                {/* Monto */}
                <div className="bg-secondary-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-secondary-500 mb-1">Monto Exacto</p>
                      <p className="font-semibold text-xl text-secondary-900">
                        {formatPrice(speiInstructions.amount)}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(speiInstructions.amount.toString(), 'amount')}
                      className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-white rounded-lg transition-colors"
                    >
                      {copiedField === 'amount' ? (
                        <Check className="w-5 h-5 text-success" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Referencia */}
                {speiInstructions.reference && (
                  <div className="bg-secondary-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-secondary-500 mb-1">Referencia</p>
                        <p className="font-mono font-medium text-secondary-900">
                          {speiInstructions.reference}
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(speiInstructions.reference, 'reference')}
                        className="p-2 text-secondary-400 hover:text-primary-600 hover:bg-white rounded-lg transition-colors"
                      >
                        {copiedField === 'reference' ? (
                          <Check className="w-5 h-5 text-success" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Concepto */}
                <div className="bg-secondary-50 rounded-lg p-4">
                  <p className="text-xs text-secondary-500 mb-1">Concepto</p>
                  <p className="text-sm text-secondary-900">{speiInstructions.concept}</p>
                </div>

                {/* Fecha límite */}
                {speiInstructions.dueDate && (
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                    <p className="text-xs text-warning font-medium mb-1">Fecha Límite de Pago</p>
                    <p className="font-medium text-secondary-900">
                      {new Date(speiInstructions.dueDate).toLocaleDateString('es-MX', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-secondary-200 bg-secondary-50 rounded-b-xl">
              <Button variant="primary" className="w-full" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si el pago fue exitoso
  if (success) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-bold text-secondary-900 mb-2">
              ¡Pago Exitoso!
            </h3>
            <p className="text-secondary-600 mb-4">
              Tu suscripción al {plan.name} ha sido activada correctamente.
            </p>
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-lg bg-white rounded-xl shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">
                Suscribirse a {plan.name}
              </h3>
              <p className="text-sm text-secondary-500">
                {formatPrice(plan.price)}/{plan.interval === 'year' ? 'año' : 'mes'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form id="payment-form" onSubmit={handleSubmit} className="px-6 py-4">
            {error && (
              <Alert variant="error" className="mb-4" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* Plan gratuito - no necesita método de pago */}
            {plan.price === 0 ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <h4 className="text-lg font-semibold text-secondary-900 mb-2">
                  Plan Gratuito
                </h4>
                <p className="text-secondary-600">
                  Este plan no requiere pago. Haz clic en el botón para activarlo.
                </p>
              </div>
            ) : (
              <>
                {/* Selección de método de pago */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-secondary-700 mb-3">
                    Método de Pago
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(PAYMENT_METHODS).map((method) => {
                      const Icon = method.icon;
                      const isSelected = paymentMethod === method.id;

                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPaymentMethod(method.id)}
                          className={`
                            p-4 rounded-lg border-2 text-left transition-all
                            ${isSelected
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-secondary-200 hover:border-secondary-300'
                            }
                          `}
                        >
                          <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-primary-600' : 'text-secondary-400'}`} />
                          <p className={`font-medium ${isSelected ? 'text-primary-700' : 'text-secondary-900'}`}>
                            {method.name}
                          </p>
                          <p className="text-xs text-secondary-500 mt-1">
                            {method.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Formulario de tarjeta */}
                {paymentMethod === 'CARD' && (
                  <div className="space-y-4">
                    <Input
                      label="Nombre del Titular"
                      placeholder="Como aparece en la tarjeta"
                      value={cardForm.holderName}
                      onChange={(e) => handleCardChange('holderName', e.target.value.toUpperCase())}
                    />

                    <Input
                      label="Número de Tarjeta"
                      placeholder="0000 0000 0000 0000"
                      value={cardForm.cardNumber}
                      onChange={(e) => handleCardChange('cardNumber', e.target.value)}
                      maxLength={19}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <Input
                        label="Mes"
                        placeholder="MM"
                        value={cardForm.expirationMonth}
                        onChange={(e) => handleCardChange('expirationMonth', e.target.value)}
                        maxLength={2}
                      />
                      <Input
                        label="Año"
                        placeholder="AA"
                        value={cardForm.expirationYear}
                        onChange={(e) => handleCardChange('expirationYear', e.target.value)}
                        maxLength={2}
                      />
                      <Input
                        label="CVV"
                        placeholder="***"
                        type="password"
                        value={cardForm.cvv}
                        onChange={(e) => handleCardChange('cvv', e.target.value)}
                        maxLength={4}
                      />
                    </div>

                    {/* Input oculto para device session id */}
                    <input type="hidden" id="deviceSessionId" name="deviceSessionId" />
                  </div>
                )}

                {/* Info SPEI */}
                {paymentMethod === 'SPEI' && (
                  <div className="bg-info/5 border border-info/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-secondary-900 mb-1">
                          Pago por Transferencia SPEI
                        </p>
                        <p className="text-sm text-secondary-600">
                          Al continuar, generaremos los datos de pago (CLABE, monto, referencia)
                          para que realices la transferencia desde tu banco. Tu plan se activará
                          automáticamente cuando recibamos el pago.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-200 bg-secondary-50 rounded-b-xl">
            <div className="flex items-center gap-2 text-secondary-500 text-xs">
              <Lock className="w-4 h-4" />
              <span>Pago seguro con Openpay</span>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : plan.price === 0 ? (
                  'Activar Plan'
                ) : paymentMethod === 'CARD' ? (
                  `Pagar ${formatPrice(plan.price)}`
                ) : (
                  'Generar Datos de Pago'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentModal;
