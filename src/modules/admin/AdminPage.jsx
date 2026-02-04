import { Settings } from 'lucide-react';

export function AdminPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-secondary-900">
          Panel de Administración
        </h1>
      </div>
      <div className="glass-card p-6">
        <p className="text-secondary-600">
          Super Admin - FASE 6
        </p>
      </div>
    </div>
  );
}

export default AdminPage;
