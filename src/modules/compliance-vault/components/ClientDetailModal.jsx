import { useState, useEffect, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, listAll, getMetadata } from 'firebase/storage';
import { storage } from '../../../core/config/firebase';
import { useAuth } from '../../../core/context/AuthContext';
import {
  X,
  User,
  Building2,
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  Download,
  Trash2,
  Loader2,
  Image,
  File
} from 'lucide-react';
import { Button, Alert } from '../../../shared/components';

// Tipos de documentos KYC
const DOCUMENT_TYPES = [
  { id: 'INE_FRONT', name: 'INE (Frente)', required: true, accepts: '.pdf,.jpg,.jpeg,.png' },
  { id: 'INE_BACK', name: 'INE (Reverso)', required: true, accepts: '.pdf,.jpg,.jpeg,.png' },
  { id: 'PROOF_OF_ADDRESS', name: 'Comprobante de Domicilio', required: true, accepts: '.pdf,.jpg,.jpeg,.png' },
  { id: 'CURP', name: 'CURP', required: false, accepts: '.pdf' },
  { id: 'TAX_ID', name: 'Cédula Fiscal (CSF)', required: false, accepts: '.pdf' },
  { id: 'INCORPORATION', name: 'Acta Constitutiva', required: false, accepts: '.pdf' },
  { id: 'POWER_OF_ATTORNEY', name: 'Poder Notarial', required: false, accepts: '.pdf' },
  { id: 'OTHER', name: 'Otro Documento', required: false, accepts: '.pdf,.jpg,.jpeg,.png' },
];

// Validar archivo
const validateFile = (file, accepts) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };

  if (file.size > maxSize) {
    return 'El archivo no puede exceder 5MB';
  }

  const acceptedExtensions = accepts.split(',');
  const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

  if (!acceptedExtensions.includes(fileExtension)) {
    return `Formato no permitido. Usa: ${accepts}`;
  }

  return null;
};

export function ClientDetailModal({ client, onClose }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Cargar documentos existentes
  const loadDocuments = useCallback(async () => {
    if (!user?.uid || !client?.rfc) return;

    try {
      setLoading(true);
      const basePath = `tenants/${user.uid}/clients/${client.rfc}/docs`;
      const listRef = ref(storage, basePath);

      const result = await listAll(listRef);
      const docsMap = {};

      for (const item of result.items) {
        const metadata = await getMetadata(item);
        const url = await getDownloadURL(item);
        const fileName = item.name;
        const docType = fileName.split('_')[0];

        if (DOCUMENT_TYPES.find(d => d.id === docType)) {
          docsMap[docType] = {
            name: fileName,
            url: url,
            size: metadata.size,
            contentType: metadata.contentType,
            uploadedAt: metadata.timeCreated,
          };
        }
      }

      setDocuments(docsMap);
    } catch (err) {
      // Si no existe la carpeta, no es un error
      if (err.code !== 'storage/object-not-found') {
        console.error('Error loading documents:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.uid, client?.rfc]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Subir documento
  const handleUpload = async (docType, file) => {
    const docConfig = DOCUMENT_TYPES.find(d => d.id === docType);

    // Validar archivo
    const validationError = validateFile(file, docConfig.accepts);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    setUploading(docType);
    setUploadProgress(0);

    try {
      const extension = file.name.split('.').pop().toLowerCase();
      const timestamp = Date.now();
      const fileName = `${docType}_${timestamp}.${extension}`;
      const filePath = `tenants/${user.uid}/clients/${client.rfc}/docs/${fileName}`;
      const storageRef = ref(storage, filePath);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          clientRfc: client.rfc,
          docType: docType,
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
          setUploading(null);
        },
        async () => {
          // Recargar documentos
          await loadDocuments();
          setSuccess(`${docConfig.name} subido correctamente`);
          setUploading(null);
          setUploadProgress(0);
        }
      );
    } catch (err) {
      console.error('Error uploading document:', err);
      setError('Error al subir el documento');
      setUploading(null);
    }
  };

  // Calcular progreso
  const requiredDocs = DOCUMENT_TYPES.filter(d => d.required);
  const uploadedRequired = requiredDocs.filter(d => documents[d.id]);
  const completionPercentage = Math.round(
    (uploadedRequired.length / requiredDocs.length) * 100
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
            <div className="flex items-center gap-3">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center
                ${client.tipo === 'FISICA' ? 'bg-info/10' : 'bg-success/10'}
              `}>
                {client.tipo === 'FISICA' ? (
                  <User className="w-6 h-6 text-info" />
                ) : (
                  <Building2 className="w-6 h-6 text-success" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">
                  {client.nombre}
                </h3>
                <p className="text-sm text-secondary-500 font-mono">{client.rfc}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-6 py-4 bg-secondary-50 border-b border-secondary-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-secondary-700">
                Expediente Digital
              </span>
              <span className={`text-sm font-bold ${
                completionPercentage === 100 ? 'text-success' : 'text-warning'
              }`}>
                {completionPercentage}% completo
              </span>
            </div>
            <div className="w-full bg-secondary-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  completionPercentage === 100 ? 'bg-success' : 'bg-warning'
                }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-secondary-500 mt-2">
              {uploadedRequired.length} de {requiredDocs.length} documentos obligatorios
            </p>
          </div>

          {/* Alerts */}
          <div className="px-6 pt-4">
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
          </div>

          {/* Documents list */}
          <div className="px-6 py-4 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {DOCUMENT_TYPES.map((docType) => {
                  const isUploaded = !!documents[docType.id];
                  const isUploading = uploading === docType.id;
                  const doc = documents[docType.id];

                  return (
                    <div
                      key={docType.id}
                      className={`
                        flex items-center gap-4 p-4 rounded-lg border-2 transition-all
                        ${isUploaded
                          ? 'border-success/30 bg-success/5'
                          : docType.required
                          ? 'border-warning/30 bg-warning/5'
                          : 'border-secondary-200 bg-white'
                        }
                      `}
                    >
                      {/* Icon */}
                      <div className={`
                        w-10 h-10 rounded-lg flex items-center justify-center
                        ${isUploaded
                          ? 'bg-success/10'
                          : docType.required
                          ? 'bg-warning/10'
                          : 'bg-secondary-100'
                        }
                      `}>
                        {isUploaded ? (
                          <CheckCircle className="w-5 h-5 text-success" />
                        ) : docType.required ? (
                          <AlertCircle className="w-5 h-5 text-warning" />
                        ) : (
                          <FileText className="w-5 h-5 text-secondary-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-secondary-900">
                            {docType.name}
                          </h4>
                          {docType.required && (
                            <span className="text-xs text-error">*</span>
                          )}
                        </div>
                        {isUploaded ? (
                          <p className="text-xs text-secondary-500">
                            Subido: {new Date(doc.uploadedAt).toLocaleDateString('es-MX')}
                          </p>
                        ) : (
                          <p className="text-xs text-secondary-400">
                            {docType.accepts.replace(/\./g, '').toUpperCase()}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {isUploaded && (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Descargar"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                        )}

                        {isUploading ? (
                          <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 text-primary-600 rounded-lg">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">{uploadProgress}%</span>
                          </div>
                        ) : (
                          <label className={`
                            flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
                            ${isUploaded
                              ? 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'
                              : 'bg-primary-600 text-white hover:bg-primary-700'
                            }
                          `}>
                            <Upload className="w-4 h-4" />
                            <span className="text-sm font-medium">
                              {isUploaded ? 'Reemplazar' : 'Subir'}
                            </span>
                            <input
                              type="file"
                              accept={docType.accepts}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUpload(docType.id, file);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-secondary-200 bg-secondary-50 rounded-b-xl">
            <p className="text-xs text-secondary-500">
              * Documentos obligatorios. Máximo 5MB por archivo.
            </p>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClientDetailModal;
