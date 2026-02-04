import { AlertTriangle } from 'lucide-react';

export function RiskEnginePage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-secondary-900">
          Motor de Riesgo
        </h1>
      </div>
      <div className="glass-card p-6">
        <p className="text-secondary-600">
          Semáforo de Riesgo (EBR) - FASE 2
        </p>
      </div>
    </div>
  );
}

export default RiskEnginePage;
