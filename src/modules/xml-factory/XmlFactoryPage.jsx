import { FileCode } from 'lucide-react';

export function XmlFactoryPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <FileCode className="w-8 h-8 text-primary-600" />
        <h1 className="text-2xl font-bold text-secondary-900">
          Generador XML
        </h1>
      </div>
      <div className="glass-card p-6">
        <p className="text-secondary-600">
          Generación de XML para SAT - FASE 2
        </p>
      </div>
    </div>
  );
}

export default XmlFactoryPage;
