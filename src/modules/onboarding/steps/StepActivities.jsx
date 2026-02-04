import { useState, useEffect } from 'react';
import { FileCheck, ArrowLeft, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { ACTIVIDADES_VULNERABLES } from '../../../core/validations/authSchemas';
import { Button, Alert } from '../../../shared/components';

export function StepActivities({ data, onUpdate, onBack, onComplete, loading }) {
  const [selectedActivities, setSelectedActivities] = useState(data.actividadesVulnerables || []);
  const [error, setError] = useState('');

  // Sincronizar con data prop
  useEffect(() => {
    if (data.actividadesVulnerables) {
      setSelectedActivities(data.actividadesVulnerables);
    }
  }, [data.actividadesVulnerables]);

  const toggleActivity = (activityId) => {
    setError('');
    setSelectedActivities((prev) => {
      if (prev.includes(activityId)) {
        return prev.filter((id) => id !== activityId);
      }
      return [...prev, activityId];
    });
  };

  const handleSubmit = () => {
    if (selectedActivities.length === 0) {
      setError('Debes seleccionar al menos una actividad vulnerable');
      return;
    }

    onUpdate({ actividadesVulnerables: selectedActivities });
    onComplete();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <FileCheck className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-secondary-900">
            Actividades Vulnerables
          </h3>
          <p className="text-sm text-secondary-500">
            Selecciona las actividades que realiza tu empresa
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-primary-800 font-medium">
              Importante
            </p>
            <p className="text-sm text-primary-700 mt-1">
              Las actividades seleccionadas determinarán las plantillas de carga y
              los umbrales de reporte aplicables según la LFPIORPI.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Activities grid */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
        {ACTIVIDADES_VULNERABLES.map((activity) => {
          const isSelected = selectedActivities.includes(activity.id);

          return (
            <button
              key={activity.id}
              type="button"
              onClick={() => toggleActivity(activity.id)}
              className={`
                w-full p-4 rounded-lg border-2 text-left transition-all duration-200
                ${isSelected
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-secondary-200 bg-white hover:border-secondary-300'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`
                    w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5
                    ${isSelected
                      ? 'bg-primary-600 text-white'
                      : 'border-2 border-secondary-300'
                    }
                  `}
                >
                  {isSelected && <CheckCircle className="w-4 h-4" />}
                </div>
                <div>
                  <p className={`font-medium ${isSelected ? 'text-primary-900' : 'text-secondary-900'}`}>
                    {activity.label}
                  </p>
                  <p className="text-sm text-secondary-500 mt-0.5">
                    {activity.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected count */}
      <div className="mt-4 text-center">
        <p className="text-sm text-secondary-600">
          {selectedActivities.length} actividad(es) seleccionada(s)
        </p>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-6">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          size="lg"
          onClick={onBack}
          disabled={loading}
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Anterior
        </Button>
        <Button
          type="button"
          className="flex-1"
          size="lg"
          onClick={handleSubmit}
          loading={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5 mr-2" />
              Completar Registro
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default StepActivities;
