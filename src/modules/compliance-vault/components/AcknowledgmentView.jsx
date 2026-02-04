import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../core/config/firebase';
import { useAuth } from '../../../core/context/AuthContext';
import {
  FileCode,
  Upload,
  CheckCircle,
  Clock,
  Download,
  AlertCircle,
  Loader2,
  Calendar,
  FileText,
  X
} from 'lucide-react';
import { Button, Alert } from '../../../shared/components';

// Estados de los reportes
const STATUS_CONFIG = {
  PENDING: {
    label: 'Pendiente',
    color: 'text-warning',
    bg: 'bg-warning/10',
    icon: Clock,
  },
  SENT: {
    label: 'Enviado',
    color: 'text-info',
    bg: 'bg-info/10',
    icon: FileCode,
  },
  COMPLETED: {
    label: 'Completado',
    color: 'text-success',
    bg: 'bg-success/10',
    icon: CheckCircle,
  },
  ERROR: {
    label: 'Error',
    color: 'text-error',
    bg: 'bg-error/10',
    icon: AlertCircle,
  },
};

// Tipos de reporte
const REPORT_TYPES = {
  AVISO: 'Aviso',
  INFORME: 'Informe',
};

export function AcknowledgmentView() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Cargar reportes en tiempo real
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'reports'),
      where('tenantId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const reportsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setReports(reportsData);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading reports:', err);
        setError('Error al cargar los reportes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Manejar subida de acuse
  const handleUploadAcuse = async (reportId, file) => {
    // Validar archivo
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo no puede exceder 5MB');
      return;
    }

    setError('');
    setSuccess('');
    setUploadingId(reportId);
    setUploadProgress(0);

    try {
      // Ruta en Storage: tenants/{tenantId}/compliance/acuses/{reportId}.pdf
      const filePath = `tenants/${user.uid}/compliance/acuses/${reportId}.pdf`;
      const storageRef = ref(storage, filePath);

      // Subir archivo con seguimiento de progreso
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: 'application/pdf',
        customMetadata: {
          reportId: reportId,
          uploadedBy: user.uid,
          originalName: file.name,
        },
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          setError('Error al subir el archivo');
          setUploadingId(null);
        },
        async () => {
          // Upload completado - el trigger de Cloud Functions actualizará el estado
          setSuccess('Acuse subido correctamente. El estado se actualizará automáticamente.');
          setUploadingId(null);
          setUploadProgress(0);
        }
      );
    } catch (err) {
      console.error('Error uploading acuse:', err);
      setError('Error al subir el acuse');
      setUploadingId(null);
    }
  };

  // Formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Formatear periodo
  const formatPeriod = (month, year) => {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${months[month - 1]} ${year}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Alerts */}
      {error && (
        <Alert variant="error" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-4" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-secondary-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-info/10 rounded-lg flex items-center justify-center">
              <FileCode className="w-5 h-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">{reports.length}</p>
              <p className="text-sm text-secondary-500">Total Reportes</p>
            </div>
          </div>
        </div>

        <div className="bg-secondary-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {reports.filter(r => r.status !== 'COMPLETED').length}
              </p>
              <p className="text-sm text-secondary-500">Pendientes</p>
            </div>
          </div>
        </div>

        <div className="bg-secondary-50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary-900">
                {reports.filter(r => r.status === 'COMPLETED').length}
              </p>
              <p className="text-sm text-secondary-500">Completados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reports table */}
      {reports.length === 0 ? (
        <div className="text-center py-12 bg-secondary-50 rounded-lg">
          <FileText className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-secondary-900 mb-1">
            Sin reportes generados
          </h3>
          <p className="text-secondary-500">
            Los reportes XML aparecerán aquí una vez que los generes
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-600">
                  Periodo
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-600">
                  Tipo
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-600">
                  Fecha Envío
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-secondary-600">
                  Estatus
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-secondary-600">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.PENDING;
                const StatusIcon = statusConfig.icon;
                const isUploading = uploadingId === report.id;

                return (
                  <tr
                    key={report.id}
                    className="border-b border-secondary-100 hover:bg-secondary-50/50 transition-colors"
                  >
                    {/* Periodo */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-secondary-400" />
                        <span className="font-medium text-secondary-900">
                          {formatPeriod(report.month, report.year)}
                        </span>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                        {REPORT_TYPES[report.type] || report.type}
                      </span>
                    </td>

                    {/* Fecha Envío */}
                    <td className="py-4 px-4 text-secondary-600">
                      {formatDate(report.sentAt || report.createdAt)}
                    </td>

                    {/* Estatus */}
                    <td className="py-4 px-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusConfig.bg}`}>
                        <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                        <span className={`text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Descargar XML */}
                        {report.downloadUrl && (
                          <a
                            href={report.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Descargar XML"
                          >
                            <FileCode className="w-5 h-5" />
                          </a>
                        )}

                        {/* Acción según estado */}
                        {report.status === 'COMPLETED' ? (
                          // Ya tiene acuse - mostrar botón de descarga
                          <a
                            href={report.acknowledgment?.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                            title="Descargar Acuse"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-sm font-medium">Acuse</span>
                            <Download className="w-4 h-4" />
                          </a>
                        ) : isUploading ? (
                          // Subiendo...
                          <div className="inline-flex items-center gap-2 px-3 py-2 bg-primary-50 text-primary-600 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-medium">{uploadProgress}%</span>
                          </div>
                        ) : (
                          // Botón para subir acuse
                          <label className="inline-flex items-center gap-2 px-3 py-2 bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-colors cursor-pointer">
                            <Upload className="w-4 h-4" />
                            <span className="text-sm font-medium">Subir Acuse</span>
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadAcuse(report.id, file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AcknowledgmentView;
