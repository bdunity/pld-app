import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { functions, db } from '../../core/config/firebase';
import { useAuth } from '../../core/context/AuthContext';
import { ACTIVIDADES_VULNERABLES } from '../../core/validations/authSchemas';
import { Alert, Button, Card } from '../../shared/components';
import {
  FileCode,
  Download,
  Loader2,
  Calendar,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Shield,
  Clock,
} from 'lucide-react';

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

const YEARS = [2024, 2025, 2026, 2027, 2028];

export function XmlFactoryPage() {
  const { tenantData, user } = useAuth();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedActivity, setSelectedActivity] = useState('');

  const [operationCount, setOperationCount] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState(null);

  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [error, setError] = useState('');

  // Obtener actividades del tenant (si no hay configuradas, mostrar todas para demo/testing)
  const tenantActivities = tenantData?.actividadesVulnerables || [];
  const availableActivities = tenantActivities.length > 0
    ? ACTIVIDADES_VULNERABLES.filter((av) => tenantActivities.includes(av.id))
    : ACTIVIDADES_VULNERABLES;

  useEffect(() => {
    if (selectedActivity && selectedYear && selectedMonth && user) {
      loadOperationPreview();
    } else {
      setOperationCount(null);
    }
  }, [selectedActivity, selectedYear, selectedMonth]);

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  const loadOperationPreview = async () => {
    setIsLoadingPreview(true);
    setGenerationResult(null);
    setValidationResult(null);
    try {
      const tenantId = tenantData?.tenantId || user.uid;
      const opsRef = collection(db, 'tenants', tenantId, 'operations');
      const q = query(
        opsRef,
        where('activityType', '==', selectedActivity),
        where('periodYear', '==', selectedYear),
        where('periodMonth', '==', selectedMonth)
      );
      const snapshot = await getDocs(q);
      setOperationCount(snapshot.size);
    } catch (err) {
      console.error('Error loading preview:', err);
      setOperationCount(0);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleGenerate = async (informeEnCeros = false) => {
    if (!selectedActivity) { setError('Selecciona una actividad'); return; }
    setIsGenerating(true);
    setError('');
    setGenerationResult(null);
    setValidationResult(null);
    try {
      const generateXMLFn = httpsCallable(functions, 'generateXML');
      const result = await generateXMLFn({
        activityType: selectedActivity,
        periodYear: selectedYear,
        periodMonth: selectedMonth,
        informeEnCeros,
      });
      if (result.data.success) {
        setGenerationResult(result.data);
        if (!informeEnCeros) {
          await autoValidateReports(result.data.reports);
        }
        loadHistory();
      }
    } catch (err) {
      console.error('Error generating XML:', err);
      setError('Error al generar XML: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsGenerating(false);
    }
  };

  const autoValidateReports = async (reports) => {
    setIsValidating(true);
    try {
      const validateXMLFn = httpsCallable(functions, 'validateXML');
      const validations = [];
      for (const report of reports) {
        const result = await validateXMLFn({ xmlBase64: report.xmlBase64, fileName: report.fileName });
        validations.push({ ...result.data.validation, reportType: report.type, reportLabel: report.label });
      }
      setValidationResult(validations);
    } catch (err) {
      console.error('Error validating XML:', err);
    } finally {
      setIsValidating(false);
    }
  };

  const handleDownload = (report) => {
    const byteCharacters = atob(report.xmlBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/xml' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const getXMLHistoryFn = httpsCallable(functions, 'getXMLHistory');
      const result = await getXMLHistoryFn();
      if (result.data.success) setHistory(result.data.history);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const resetResults = () => {
    setGenerationResult(null);
    setValidationResult(null);
    setError('');
    loadOperationPreview();
  };

  const getActivityLabel = (id) => {
    const act = ACTIVIDADES_VULNERABLES.find(a => a.id === id);
    return act ? act.label : id;
  };

  const getMonthLabel = (num) => {
    const m = MONTHS.find(m => m.value === num);
    return m ? m.label : num;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <FileCode className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Generador XML SAT</h1>
          <p className="text-secondary-500">Genera reportes XML para la UIF según parámetros del SAT</p>
        </div>
      </div>

      {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

      {/* Selectores */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-600" />
          Periodo y Actividad
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">Año</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white">
              {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">Mes</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white">
              {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">Actividad Vulnerable</label>
            <select value={selectedActivity} onChange={(e) => setSelectedActivity(e.target.value)}
              className="w-full px-4 py-2.5 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white">
              <option value="">Seleccionar actividad...</option>
              {availableActivities.map((activity) => (
                <option key={activity.id} value={activity.id}>{activity.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Preview */}
      {selectedActivity && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary-600" />
            Operaciones Disponibles
          </h2>
          {isLoadingPreview ? (
            <div className="flex items-center gap-2 text-secondary-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Consultando operaciones...
            </div>
          ) : operationCount !== null ? (
            <div className="flex items-center justify-between">
              <div>
                {operationCount > 0 ? (
                  <div className="space-y-2">
                    <p className="text-secondary-700">
                      Se encontraron <span className="font-bold text-primary-600 text-xl">{operationCount}</span> operaciones
                      para <span className="font-medium">{getMonthLabel(selectedMonth)} {selectedYear}</span> en{' '}
                      <span className="font-medium">{getActivityLabel(selectedActivity)}</span>
                    </p>
                    {selectedActivity === 'JUEGOS_APUESTAS' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                        <p className="text-sm text-amber-800 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span><strong>Nota:</strong> Para Juegos y Sorteos se generarán <strong>2 reportes XML</strong> separados: uno para Depósitos/Apuestas y otro para Retiros/Premios.</span>
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-secondary-500">
                      No hay operaciones cargadas para este periodo. Sube datos desde el{' '}
                      <a href="/ingest" className="text-primary-600 underline">módulo de carga</a>,
                      o genera un Informe en Ceros.
                    </p>
                    {!generationResult && (
                      <Button onClick={() => handleGenerate(true)} disabled={isGenerating} variant="secondary" className="flex items-center gap-2">
                        {isGenerating ? (<><Loader2 className="w-5 h-5 animate-spin" /> Generando...</>) : (<><FileCode className="w-5 h-5" /> Generar Informe en Ceros</>)}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {operationCount > 0 && !generationResult && (
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button onClick={() => handleGenerate(false)} disabled={isGenerating} className="flex items-center gap-2">
                    {isGenerating ? (<><Loader2 className="w-5 h-5 animate-spin" /> Generando...</>) : (<><FileCode className="w-5 h-5" /> Generar XML</>)}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* Resultado generación */}
      {generationResult && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" /> XML Generado Exitosamente
            </h2>
            <Button variant="secondary" size="sm" onClick={resetResults} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Nueva Generación
            </Button>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800">
              Se generaron <strong>{generationResult.reports.length} reporte(s)</strong> con un total de <strong>{generationResult.totalOperations} operaciones</strong>.
            </p>
          </div>
          <div className="space-y-3">
            {generationResult.reports.map((report, index) => (
              <div key={index} className="flex items-center justify-between bg-white border border-secondary-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <FileCode className="w-8 h-8 text-primary-600" />
                  <div>
                    <p className="font-medium text-secondary-900">{report.label}</p>
                    <p className="text-sm text-secondary-500">{report.fileName} &bull; {report.recordCount} operaciones</p>
                  </div>
                </div>
                <Button onClick={() => handleDownload(report)} size="sm" className="flex items-center gap-2">
                  <Download className="w-4 h-4" /> Descargar
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Validación CNMV/SAT */}
      {(isValidating || validationResult) && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-600" /> Validación CNMV / SAT
          </h2>
          {isValidating ? (
            <div className="flex items-center gap-2 text-secondary-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Validando contra parámetros del SAT...
            </div>
          ) : validationResult ? (
            <div className="space-y-4">
              {validationResult.map((val, index) => (
                <div key={index} className="border border-secondary-200 rounded-lg overflow-hidden">
                  <div className={`px-4 py-3 flex items-center justify-between ${val.isValid ? (val.warnings?.length > 0 ? 'bg-amber-50 border-b border-amber-200' : 'bg-green-50 border-b border-green-200') : 'bg-red-50 border-b border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      {val.isValid ? (val.warnings?.length > 0 ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <CheckCircle className="w-5 h-5 text-green-600" />) : <XCircle className="w-5 h-5 text-red-600" />}
                      <span className="font-medium">{val.reportLabel || val.fileName}</span>
                    </div>
                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${val.isValid ? (val.warnings?.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700') : 'bg-red-100 text-red-700'}`}>
                      {val.status === 'VALIDO' && 'VÁLIDO'}
                      {val.status === 'VALIDO_CON_ADVERTENCIAS' && 'VÁLIDO CON ADVERTENCIAS'}
                      {val.status === 'ERROR' && 'CON ERRORES'}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="grid grid-cols-3 gap-4 text-center text-sm">
                      <div><p className="text-2xl font-bold text-secondary-700">{val.summary?.avisoCount || 0}</p><p className="text-secondary-500">Avisos</p></div>
                      <div><p className="text-2xl font-bold text-red-600">{val.summary?.totalErrors || 0}</p><p className="text-secondary-500">Errores</p></div>
                      <div><p className="text-2xl font-bold text-amber-600">{val.summary?.totalWarnings || 0}</p><p className="text-secondary-500">Advertencias</p></div>
                    </div>
                  </div>
                  {val.errors?.length > 0 && (
                    <div className="px-4 py-3 border-t border-secondary-100">
                      <h4 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1"><XCircle className="w-4 h-4" /> Errores ({val.errors.length})</h4>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {val.errors.map((err, i) => (
                          <div key={i} className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                            <span className="font-mono text-xs text-red-400 mr-2">[{err.code}]</span>{err.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {val.warnings?.length > 0 && (
                    <div className="px-4 py-3 border-t border-secondary-100">
                      <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Advertencias ({val.warnings.length})</h4>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {val.warnings.map((warn, i) => (
                          <div key={i} className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded">
                            <span className="font-mono text-xs text-amber-400 mr-2">[{warn.code}]</span>{warn.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!val.errors || val.errors.length === 0) && (!val.warnings || val.warnings.length === 0) && (
                    <div className="px-4 py-3 border-t border-secondary-100">
                      <Alert variant="success">El XML cumple con todos los parámetros del SAT/CNMV. Listo para enviar.</Alert>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      )}

      {/* Historial */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-secondary-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-600" /> Historial de Generaciones
          </h2>
          <Button variant="secondary" size="sm" onClick={loadHistory} disabled={isLoadingHistory} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
        {isLoadingHistory ? (
          <div className="flex items-center gap-2 text-secondary-500 py-4"><Loader2 className="w-5 h-5 animate-spin" /> Cargando historial...</div>
        ) : history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary-50">
                <tr>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Actividad</th>
                  <th className="px-4 py-3 text-left text-secondary-700 font-medium">Periodo</th>
                  <th className="px-4 py-3 text-center text-secondary-700 font-medium">Registros</th>
                  <th className="px-4 py-3 text-center text-secondary-700 font-medium">Reportes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-secondary-50">
                    <td className="px-4 py-3 text-secondary-600">
                      {item.generatedAt ? new Date(item.generatedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-secondary-900 font-medium">{getActivityLabel(item.activityType)}</td>
                    <td className="px-4 py-3 text-secondary-600">{getMonthLabel(item.periodMonth)} {item.periodYear}</td>
                    <td className="px-4 py-3 text-center text-secondary-900 font-medium">{item.recordCount}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded-full text-xs font-medium">
                        {item.reportCount} XML{item.reportCount > 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-secondary-500 py-4 text-center">No hay generaciones previas. Selecciona un periodo y genera tu primer XML.</p>
        )}
      </Card>
    </div>
  );
}

export default XmlFactoryPage;
