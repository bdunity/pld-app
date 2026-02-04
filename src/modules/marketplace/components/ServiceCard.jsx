import { useState } from 'react';
import {
  FileText,
  GraduationCap,
  ClipboardCheck,
  Scale,
  Clock,
  CheckCircle,
  Loader2,
  Download,
  ExternalLink,
} from 'lucide-react';

const SERVICE_ICONS = {
  MANUAL_PLD: FileText,
  CAPACITACION_ANUAL: GraduationCap,
  AUDITORIA_EXTERNA: ClipboardCheck,
  ASESORIA_LEGAL: Scale,
};

const STATUS_CONFIG = {
  NOT_PURCHASED: {
    label: 'Disponible',
    color: 'bg-secondary-100 text-secondary-700',
    canRequest: true,
  },
  REQUESTED: {
    label: 'Solicitado',
    color: 'bg-amber-100 text-amber-700',
    canRequest: false,
  },
  IN_PROGRESS: {
    label: 'En proceso',
    color: 'bg-blue-100 text-blue-700',
    canRequest: false,
  },
  COMPLETED: {
    label: 'Entregado',
    color: 'bg-green-100 text-green-700',
    canRequest: false,
  },
};

export function ServiceCard({ service, onRequest }) {
  const [showModal, setShowModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const Icon = SERVICE_ICONS[service.id] || FileText;
  const statusConfig = STATUS_CONFIG[service.status] || STATUS_CONFIG.NOT_PURCHASED;

  const handleRequest = async () => {
    setLoading(true);
    try {
      await onRequest(service.id, notes);
      setShowModal(false);
      setNotes('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-secondary-200 p-6 hover:shadow-lg transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
            <Icon className="w-6 h-6 text-primary-600" />
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-secondary-900 mb-2">{service.name}</h3>
        <p className="text-sm text-secondary-600 mb-4">{service.description}</p>

        {/* Details */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-secondary-600">
            <Clock className="w-4 h-4" />
            <span>Entrega: {service.deliveryTime}</span>
          </div>
        </div>

        {/* Price */}
        <div className="mb-4">
          <span className="text-2xl font-bold text-primary-600">
            ${service.price?.toLocaleString()}
          </span>
          <span className="text-sm text-secondary-500 ml-1">MXN</span>
        </div>

        {/* Action */}
        {service.status === 'COMPLETED' && service.fileUrl ? (
          <a
            href={service.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar
          </a>
        ) : statusConfig.canRequest ? (
          <button onClick={() => setShowModal(true)} className="btn-primary w-full">
            Solicitar información
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-secondary-500">
            {service.status === 'REQUESTED' && (
              <>
                <Clock className="w-4 h-4" />
                <span>Te contactaremos pronto</span>
              </>
            )}
            {service.status === 'IN_PROGRESS' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>En preparación</span>
              </>
            )}
          </div>
        )}

        {/* Delivered date */}
        {service.status === 'COMPLETED' && service.deliveredAt && (
          <p className="text-xs text-secondary-500 text-center mt-2">
            Entregado: {new Date(service.deliveredAt).toLocaleDateString('es-MX')}
          </p>
        )}
      </div>

      {/* Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Solicitar {service.name}
            </h3>
            <p className="text-sm text-secondary-600 mb-4">
              Completa el formulario y nos pondremos en contacto contigo para darte más información.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Notas o comentarios (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cuéntanos más sobre tu negocio o necesidades específicas..."
                className="input-field h-24 resize-none"
              />
            </div>

            <div className="bg-secondary-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-secondary-600">
                <strong>Precio base:</strong> ${service.price?.toLocaleString()} MXN
              </p>
              <p className="text-xs text-secondary-500 mt-1">
                El precio final puede variar según tus necesidades específicas.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={handleRequest}
                disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar solicitud'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ServiceCard;
