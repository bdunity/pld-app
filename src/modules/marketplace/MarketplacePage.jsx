import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../core/config/firebase';
import { ServiceCard } from './components/ServiceCard';
import {
  ShoppingBag,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export function MarketplacePage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const getAvailableServices = httpsCallable(functions, 'getAvailableServices');
      const result = await getAvailableServices();
      setServices(result.data.services || []);
    } catch (err) {
      console.error('Error loading services:', err);
      setError('Error al cargar los servicios. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const handleRequestService = async (serviceType, notes) => {
    try {
      const requestService = httpsCallable(functions, 'requestService');
      const result = await requestService({ serviceType, notes });

      if (result.data.success) {
        setSuccessMessage(result.data.message);
        // Recargar servicios para actualizar estado
        await loadServices();

        // Limpiar mensaje después de 5 segundos
        setTimeout(() => setSuccessMessage(''), 5000);
      }
    } catch (err) {
      console.error('Error requesting service:', err);
      throw err;
    }
  };

  // Calcular estadísticas
  const stats = {
    available: services.filter((s) => s.status === 'NOT_PURCHASED').length,
    requested: services.filter((s) => s.status === 'REQUESTED').length,
    completed: services.filter((s) => s.status === 'COMPLETED').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-primary-600" />
            Marketplace de Servicios
          </h1>
          <p className="text-secondary-600 mt-1">
            Servicios profesionales para fortalecer tu cumplimiento PLD
          </p>
        </div>
        <button
          onClick={loadServices}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.available}</p>
              <p className="text-sm text-secondary-500">Disponibles</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.requested}</p>
              <p className="text-sm text-secondary-500">Solicitados</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-secondary-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{stats.completed}</p>
              <p className="text-sm text-secondary-500">Completados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-6 border border-primary-200">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">
          Servicios Profesionales de Cumplimiento
        </h3>
        <p className="text-primary-700 text-sm">
          Nuestro equipo de expertos en LFPIORPI te ayuda a mantener tu negocio en cumplimiento.
          Solicita información sobre cualquier servicio y te contactaremos en menos de 24 horas.
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            onRequest={handleRequestService}
          />
        ))}
      </div>

      {/* Empty State */}
      {services.length === 0 && !loading && (
        <div className="text-center py-12">
          <ShoppingBag className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            No hay servicios disponibles
          </h3>
          <p className="text-secondary-600">
            Los servicios se cargarán pronto. Intenta actualizar la página.
          </p>
        </div>
      )}

      {/* FAQ Section */}
      <div className="bg-white rounded-xl border border-secondary-200 p-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">
          Preguntas Frecuentes
        </h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-secondary-900">
              ¿Cómo funciona el proceso de solicitud?
            </h4>
            <p className="text-sm text-secondary-600 mt-1">
              Al solicitar un servicio, nuestro equipo recibe tu información y te contacta
              en menos de 24 horas para discutir tus necesidades específicas y enviarte una
              cotización personalizada.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-secondary-900">
              ¿Qué incluye el Manual de PLD Personalizado?
            </h4>
            <p className="text-sm text-secondary-600 mt-1">
              Un documento completo adaptado a tu giro de negocio, con políticas,
              procedimientos, formatos y guías de cumplimiento según la LFPIORPI.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-secondary-900">
              ¿La capacitación incluye certificación?
            </h4>
            <p className="text-sm text-secondary-600 mt-1">
              Sí, todos los participantes reciben un certificado de cumplimiento que
              puedes usar como evidencia ante auditorías.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketplacePage;
