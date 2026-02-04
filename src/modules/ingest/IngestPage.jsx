import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../core/config/firebase';
import { useAuth } from '../../core/context/AuthContext';
import { ACTIVIDADES_VULNERABLES } from '../../core/validations/authSchemas';
import { Alert, Button, Card } from '../../shared/components';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Calendar,
  Briefcase,
  X,
  FileWarning,
  RefreshCw,
} from 'lucide-react';

// Meses del año
const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

// Años disponibles
const YEARS = [2025, 2026, 2027, 2028];

export function IngestPage() {
  const { tenantData } = useAuth();

  // Estados de selección
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedActivity, setSelectedActivity] = useState('');

  // Estados de UI
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Obtener actividades del tenant
  const tenantActivities = tenantData?.actividadesVulnerables || [];
  const availableActivities = ACTIVIDADES_VULNERABLES.filter(
    (av) => tenantActivities.includes(av.id)
  );

  // Handler para descargar plantilla
  const handleDownloadTemplate = async () => {
    if (!selectedActivity) {
      setError('Selecciona una actividad para descargar la plantilla');
      return;
    }

    setIsGeneratingTemplate(true);
    setError('');

    try {
      const getTemplate = httpsCallable(functions, 'getTemplate');
      const result = await getTemplate({ activityType: selectedActivity });

      if (result.data.success) {
        // Convertir base64 a blob y descargar
        const byteCharacters = atob(result.data.fileBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.data.mimeType });

        // Crear link de descarga
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.data.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Error downloading template:', err);
      setError('Error al descargar la plantilla: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  // Handler para subir archivo
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Selecciona un archivo para cargar');
      return;
    }

    if (!selectedActivity) {
      setError('Selecciona una actividad antes de cargar');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setError('');
    setUploadResult(null);

    try {
      // Leer archivo como base64
      const fileBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      setUploadProgress(30);

      // Llamar a Cloud Function
      const processUpload = httpsCallable(functions, 'processUpload');

      setUploadProgress(50);

      const result = await processUpload({
        fileBase64,
        fileName: selectedFile.name,
        activityType: selectedActivity,
        periodYear: selectedYear,
        periodMonth: selectedMonth,
      });

      setUploadProgress(100);

      if (result.data.success) {
        setUploadResult(result.data);
        setSelectedFile(null);
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Error al procesar el archivo: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsUploading(false);
    }
  };

  // Configuración de dropzone
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setUploadResult(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  const clearFile = () => {
    setSelectedFile(null);
    setUploadResult(null);
  };

  const resetForm = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setError('');
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <Upload className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">
            Carga de Datos
          </h1>
          <p className="text-secondary-500">
            Motor de ingesta para actividades vulnerables
          </p>
        </div>
      </div>

      {/* Alerta de error global */}
      {error && (
        <Alert variant="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Selectores de Contexto */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-600" />
          Periodo y Actividad
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Año */}
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              Año
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            >
              {YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Mes */}
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              Mes
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            >
              {MONTHS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actividad */}
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              Actividad Vulnerable
            </label>
            <select
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="w-full px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            >
              <option value="">Seleccionar actividad...</option>
              {availableActivities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.label}
                </option>
              ))}
            </select>
            {availableActivities.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No hay actividades configuradas en tu perfil
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Generador de Plantilla */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary-600" />
          Plantilla de Carga
        </h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-secondary-600">
              Descarga la plantilla Excel personalizada para la actividad seleccionada.
            </p>
            <p className="text-sm text-secondary-500 mt-1">
              La plantilla incluye las columnas requeridas por el SAT.
            </p>
          </div>

          <Button
            onClick={handleDownloadTemplate}
            disabled={!selectedActivity || isGeneratingTemplate}
            className="flex items-center gap-2 shrink-0"
          >
            {isGeneratingTemplate ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Descargar Plantilla
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Zona de Carga */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-primary-600" />
          Cargar Archivo
        </h2>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
            transition-all duration-200
            ${isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-secondary-300 hover:border-primary-400 hover:bg-secondary-50'
            }
            ${isUploading ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input {...getInputProps()} />

          {selectedFile ? (
            <div className="flex items-center justify-center gap-4">
              <FileSpreadsheet className="w-12 h-12 text-primary-600" />
              <div className="text-left">
                <p className="font-medium text-secondary-900">{selectedFile.name}</p>
                <p className="text-sm text-secondary-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {!isUploading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-secondary-500" />
                </button>
              )}
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
              <p className="text-secondary-600 mb-2">
                {isDragActive
                  ? 'Suelta el archivo aquí...'
                  : 'Arrastra tu archivo Excel aquí o haz clic para seleccionar'}
              </p>
              <p className="text-sm text-secondary-400">
                Formatos aceptados: .xlsx, .csv
              </p>
            </>
          )}
        </div>

        {/* Barra de progreso */}
        {isUploading && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-secondary-600">Procesando archivo...</span>
              <span className="text-sm font-medium text-primary-600">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-secondary-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Botón de carga */}
        {selectedFile && !isUploading && !uploadResult && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleUpload} className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Procesar Archivo
            </Button>
          </div>
        )}
      </Card>

      {/* Resultados de la carga */}
      {uploadResult && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Resultado de la Carga
            </h2>
            <Button variant="secondary" size="sm" onClick={resetForm} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Nueva Carga
            </Button>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{uploadResult.recordsProcessed}</p>
              <p className="text-sm text-green-600">Registros procesados</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-red-700">{uploadResult.recordsWithErrors}</p>
              <p className="text-sm text-red-600">Con errores</p>
            </div>
            <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-secondary-700">{uploadResult.totalRecords}</p>
              <p className="text-sm text-secondary-600">Total filas</p>
            </div>
          </div>

          {/* Lista de errores */}
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-secondary-900 mb-3 flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-red-500" />
                Errores de Validación ({uploadResult.errors.length})
                {uploadResult.hasMoreErrors && ' - Mostrando los primeros 50'}
              </h3>
              <div className="max-h-64 overflow-y-auto border border-secondary-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-secondary-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-secondary-700 font-medium">Fila</th>
                      <th className="px-4 py-2 text-left text-secondary-700 font-medium">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {uploadResult.errors.map((err, index) => (
                      <tr key={index} className="hover:bg-secondary-50">
                        <td className="px-4 py-2 text-secondary-900 font-medium">{err.row}</td>
                        <td className="px-4 py-2">
                          <ul className="list-disc list-inside text-red-600">
                            {err.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mensaje de éxito */}
          {uploadResult.recordsWithErrors === 0 && (
            <Alert variant="success">
              ¡Todos los registros fueron procesados correctamente!
            </Alert>
          )}
        </Card>
      )}
    </div>
  );
}

export default IngestPage;
