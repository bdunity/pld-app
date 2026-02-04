/**
 * Support Page
 * Página principal de soporte con tabs
 */

import { useState } from 'react';
import { LifeBuoy, MessageSquare, Ticket } from 'lucide-react';
import { TicketSystem } from './components/TicketSystem';

const TABS = [
  { id: 'tickets', name: 'Mis Tickets', icon: Ticket },
  { id: 'faq', name: 'Preguntas Frecuentes', icon: MessageSquare },
];

export function SupportPage() {
  const [activeTab, setActiveTab] = useState('tickets');

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <LifeBuoy className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">
            Centro de Soporte
          </h1>
          <p className="text-secondary-600">
            Obtén ayuda y gestiona tus solicitudes
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-secondary-200 mb-6">
        <nav className="flex gap-8">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 border-b-2 font-medium text-sm transition-colors
                  ${isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'tickets' && <TicketSystem />}

      {activeTab === 'faq' && (
        <div className="space-y-4">
          <FAQItem
            question="¿Cómo presento un Aviso al SAT?"
            answer="Los Avisos se presentan a través del portal del SAT (SITI) antes del día 17 del mes siguiente a la operación. En PLD BDU puedes generar el archivo XML listo para cargar."
          />
          <FAQItem
            question="¿Cuáles son los umbrales de aviso?"
            answer="Los umbrales varían según la Actividad Vulnerable. Por ejemplo, para operaciones inmobiliarias no hay umbral (siempre se reportan), mientras que para préstamos entre particulares es de aproximadamente $527,500 MXN."
          />
          <FAQItem
            question="¿Cuánto tiempo debo conservar la documentación?"
            answer="Según el Art. 18 de la LFPIORPI, debes conservar por 5 años la documentación e información de las Actividades Vulnerables, contados a partir de la fecha de realización de la operación."
          />
          <FAQItem
            question="¿Qué pasa si no presento un Aviso?"
            answer="Las multas por omitir Avisos pueden ir desde 200 hasta 2,000 días de UMA (aproximadamente $21,700 a $217,000 MXN), dependiendo de la gravedad y reincidencia."
          />
          <FAQItem
            question="¿Cómo contacto soporte técnico?"
            answer="Puedes crear un ticket desde la pestaña 'Mis Tickets' o usar el chatbot de IA para resolver dudas rápidas sobre cumplimiento PLD."
          />
        </div>
      )}

      {/* Info adicional */}
      <div className="mt-8 p-6 bg-primary-50 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-secondary-900 mb-1">
              ¿Necesitas ayuda inmediata?
            </h3>
            <p className="text-sm text-secondary-600 mb-3">
              Usa nuestro asistente de IA "Antigravity Bot" para resolver dudas sobre la Ley Antilavado al instante.
              Busca el ícono de chat en la esquina inferior derecha.
            </p>
            <p className="text-xs text-secondary-500">
              El chatbot está disponible 24/7 para preguntas sobre LFPIORPI, umbrales y cumplimiento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente FAQ
function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-secondary-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary-50 transition-colors"
      >
        <span className="font-medium text-secondary-900">{question}</span>
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-secondary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-secondary-600 text-sm">
          {answer}
        </div>
      )}
    </div>
  );
}

export default SupportPage;
