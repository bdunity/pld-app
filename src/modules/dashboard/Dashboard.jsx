import { LayoutDashboard } from 'lucide-react';

export function Dashboard() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-secondary-900">
          Dashboard - Ciclo de Cumplimiento
        </h1>
      </div>
      <div className="glass-card p-6">
        <p className="text-secondary-600">
          Vista principal del Dashboard - FASE 2
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
