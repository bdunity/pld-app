import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../core/config/firebase';
import {
  Search,
  Filter,
  Upload,
  CheckCircle,
  Clock,
  Loader2,
  AlertCircle,
  FileCheck,
  Building2,
  Link as LinkIcon,
  Send,
} from 'lucide-react';

const SERVICE_TYPES = [
  { id: 'MANUAL_PLD', name: 'Manual de PLD Personalizado' },
  { id: 'CAPACITACION_ANUAL', name: 'Capacitación Anual PLD' },
  { id: 'AUDITORIA_EXTERNA', name: 'Auditoría Externa PLD' },
  { id: 'ASESORIA_LEGAL', name: 'Asesoría Legal Especializada' },
];

export function ServiceFulfillment() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeliverModal, setShowDeliverModal] = useState(null);
  const [deliveryData, setDeliveryData] = useState({
    fileUrl: '',
    notes: '',
  });
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const loadPendingDeliveries = async () => {
    setLoading(true);
    setError(null);
    try {
      const getPendingLeads = httpsCallable(functions, 'getPendingLeads');
      const result = await getPendingLeads({ status: 'IN_PROGRESS', limit: 100 });

      // También cargar leads contactados que pueden estar listos para entregar
      const contactedResult = await getPendingLeads({ status: 'CONTACTED', limit: 100 });

      const allLeads = [...(result.data.leads || []), ...(contactedResult.data.leads || [])];
      setLeads(allLeads);
    } catch (err) {
      console.error('Error loading leads:', err);
      setError('Error al cargar entregas pendientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingDeliveries();
  }, []);

  const handleDeliver = async () => {
    if (!deliveryData.fileUrl) {
      alert('Ingresa la URL del archivo');
      return;
    }

    setDeliveryLoading(true);
    try {
      const deliverService = httpsCallable(functions, 'deliverService');
      await deliverService({
        tenantId: showDeliverModal.tenantId,
        serviceType: showDeliverModal.serviceType,
        fileUrl: deliveryData.fileUrl,
        leadId: showDeliverModal.id,
        notes: deliveryData.notes,
      });

      setSuccessMessage(`Servicio "${showDeliverModal.serviceName}" entregado correctamente`);
      setShowDeliverModal(null);
      setDeliveryData({ fileUrl: '', notes: '' });
      await loadPendingDeliveries();

      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Error delivering service:', err);
      alert('Error al entregar el servicio: ' + (err.message || 'Error desconocido'));
    } finally {
      setDeliveryLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-600/20 text-purple-400">
            En proceso
          </span>
        );
      case 'CONTACTED':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-600/20 text-blue-400">
            Contactado
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary-600 text-secondary-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-green-400" />
            Entrega de Servicios
          </h1>
          <p className="text-secondary-400 mt-1">
            Servicios listos para entregar a los clientes
          </p>
        </div>
        <button
          onClick={loadPendingDeliveries}
          className="px-4 py-2 bg-secondary-700 hover:bg-secondary-600 rounded-lg text-white flex items-center gap-2"
        >
          <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-400">{successMessage}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-primary-900/20 border border-primary-800 rounded-xl p-4">
        <h3 className="text-primary-400 font-medium mb-2">Proceso de Entrega</h3>
        <p className="text-secondary-300 text-sm">
          1. Prepara el documento/material para el cliente
          <br />
          2. Súbelo a Firebase Storage o a un servicio de almacenamiento seguro
          <br />
          3. Usa el botón "Entregar" e ingresa la URL del archivo
          <br />
          4. El cliente recibirá una notificación por email
        </p>
      </div>

      {/* Deliveries Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-secondary-800 rounded-xl border border-secondary-700 p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">¡Todo al día!</h3>
          <p className="text-secondary-400">
            No hay servicios pendientes de entrega.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="bg-secondary-800 rounded-xl border border-secondary-700 p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-600/20 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{lead.tenantName}</p>
                    <p className="text-secondary-400 text-sm">{lead.tenantEmail}</p>
                  </div>
                </div>
                {getStatusBadge(lead.status)}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-secondary-400 text-sm">Servicio</span>
                  <span className="text-white font-medium">{lead.serviceName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-400 text-sm">RFC</span>
                  <span className="text-secondary-300 font-mono text-sm">{lead.tenantRfc}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-400 text-sm">Solicitado</span>
                  <span className="text-secondary-300 text-sm">
                    {new Date(lead.createdAt).toLocaleDateString('es-MX')}
                  </span>
                </div>
              </div>

              {lead.notes && (
                <div className="bg-secondary-700/50 rounded-lg p-3 mb-4">
                  <p className="text-secondary-400 text-xs mb-1">Notas del cliente:</p>
                  <p className="text-secondary-200 text-sm">{lead.notes}</p>
                </div>
              )}

              <button
                onClick={() => setShowDeliverModal(lead)}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Entregar Servicio
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Deliver Modal */}
      {showDeliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-secondary-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Entregar Servicio</h3>
            <p className="text-secondary-400 text-sm mb-4">
              Entregando: <strong className="text-white">{showDeliverModal.serviceName}</strong>
              <br />
              Cliente: <strong className="text-white">{showDeliverModal.tenantName}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-300 mb-1">
                  URL del archivo *
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <input
                    type="url"
                    value={deliveryData.fileUrl}
                    onChange={(e) =>
                      setDeliveryData({ ...deliveryData, fileUrl: e.target.value })
                    }
                    placeholder="https://storage.googleapis.com/..."
                    className="w-full pl-10 pr-4 py-2 bg-secondary-700 border border-secondary-600 rounded-lg text-white placeholder-secondary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <p className="text-secondary-500 text-xs mt-1">
                  URL de acceso al archivo en Firebase Storage u otro servicio
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-300 mb-1">
                  Notas de entrega (opcional)
                </label>
                <textarea
                  value={deliveryData.notes}
                  onChange={(e) =>
                    setDeliveryData({ ...deliveryData, notes: e.target.value })
                  }
                  placeholder="Información adicional para el cliente..."
                  className="w-full bg-secondary-700 border border-secondary-600 rounded-lg px-3 py-2 text-white placeholder-secondary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 resize-none"
                />
              </div>
            </div>

            <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-3 mt-4">
              <p className="text-amber-400 text-sm">
                <strong>Importante:</strong> Al entregar, el cliente recibirá un email de
                notificación y podrá descargar el archivo desde su panel.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeliverModal(null);
                  setDeliveryData({ fileUrl: '', notes: '' });
                }}
                className="flex-1 px-4 py-2 bg-secondary-700 hover:bg-secondary-600 rounded-lg text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeliver}
                disabled={!deliveryData.fileUrl || deliveryLoading}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deliveryLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Entregando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Entregar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceFulfillment;
