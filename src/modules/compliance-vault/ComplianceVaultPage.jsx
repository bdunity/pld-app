import { useState } from 'react';
import { FolderLock, FileCheck, Users } from 'lucide-react';
import { AcknowledgmentView } from './components/AcknowledgmentView';
import { ClientFileView } from './components/ClientFileView';

const TABS = [
  {
    id: 'acknowledgments',
    label: 'Reportes y Acuses',
    icon: FileCheck,
    description: 'Gestiona los acuses de aceptación del SAT',
  },
  {
    id: 'clients',
    label: 'Expedientes de Clientes',
    icon: Users,
    description: 'Documentación KYC de tus clientes',
  },
];

export function ComplianceVaultPage() {
  const [activeTab, setActiveTab] = useState('acknowledgments');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <FolderLock className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">
            Bóveda Digital
          </h1>
          <p className="text-secondary-500">
            Resguardo legal y expedientes de cumplimiento
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="glass-card mb-6">
        <div className="border-b border-secondary-200">
          <nav className="flex gap-1 p-1" aria-label="Tabs">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm
                    transition-all duration-200
                    ${isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-secondary-600 hover:bg-secondary-50 hover:text-secondary-900'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600' : 'text-secondary-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab description */}
        <div className="px-6 py-3 bg-secondary-50/50 border-b border-secondary-200">
          <p className="text-sm text-secondary-600">
            {TABS.find(t => t.id === activeTab)?.description}
          </p>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'acknowledgments' && <AcknowledgmentView />}
          {activeTab === 'clients' && <ClientFileView />}
        </div>
      </div>
    </div>
  );
}

export default ComplianceVaultPage;
