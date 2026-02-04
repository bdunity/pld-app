import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../core/config/firebase';
import { useAuth } from '../../core/context/AuthContext';
import {
  Shield,
  Building2,
  Users,
  FileCheck,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { Alert } from '../../shared/components';
import { StepFiscalIdentity } from './steps/StepFiscalIdentity';
import { StepRepresentation } from './steps/StepRepresentation';
import { StepActivities } from './steps/StepActivities';

const STEPS = [
  {
    id: 1,
    title: 'Identidad Fiscal',
    description: 'RFC y datos de la empresa',
    icon: Building2,
  },
  {
    id: 2,
    title: 'Representación',
    description: 'Oficial de cumplimiento',
    icon: Users,
  },
  {
    id: 3,
    title: 'Actividades',
    description: 'Actividades vulnerables',
    icon: FileCheck,
  },
];

export function Wizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Paso 1: Identidad Fiscal
    rfc: '',
    razonSocial: '',
    regimenFiscal: '',
    claveSujetoObligado: '',
    // Paso 2: Representación
    nombreOficialCumplimiento: '',
    rfcRepresentante: '',
    cargoRepresentante: '',
    emailContacto: '',
    telefonoContacto: '',
    // Paso 3: Actividades
    actividadesVulnerables: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { user, refreshTenantData } = useAuth();
  const navigate = useNavigate();

  // Actualizar datos del formulario
  const updateFormData = (data) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  // Navegar entre pasos
  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Guardar datos en Firestore
  const handleComplete = async () => {
    setError('');
    setLoading(true);

    try {
      // Guardar en colección tenants
      await setDoc(doc(db, 'tenants', user.uid), {
        // Datos fiscales
        rfc: formData.rfc.toUpperCase(),
        razonSocial: formData.razonSocial,
        regimenFiscal: formData.regimenFiscal,
        claveSujetoObligado: formData.claveSujetoObligado || '',
        // Representante
        oficialCumplimiento: {
          nombre: formData.nombreOficialCumplimiento,
          rfc: formData.rfcRepresentante.toUpperCase(),
          cargo: formData.cargoRepresentante,
          email: formData.emailContacto,
          telefono: formData.telefonoContacto,
        },
        // Actividades vulnerables
        actividadesVulnerables: formData.actividadesVulnerables,
        // Metadata
        tenantId: user.uid,
        ownerId: user.uid,
        ownerEmail: user.email,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        // Plan por defecto
        plan: 'free',
        planStatus: 'active',
      });

      // Refrescar datos del tenant en el contexto
      await refreshTenantData();

      // Redirigir al dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Error saving tenant data:', err);
      setError('Error al guardar los datos. Por favor intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-secondary-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-lg rounded-xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">PLD BDU</h1>
          </div>
          <h2 className="text-xl text-primary-200">
            Configuración inicial de tu cuenta
          </h2>
        </div>

        {/* Stepper */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                {/* Step indicator */}
                <div className="flex flex-col items-center">
                  <div
                    className={`
                      w-12 h-12 rounded-full flex items-center justify-center
                      transition-all duration-300
                      ${currentStep > step.id
                        ? 'bg-success text-white'
                        : currentStep === step.id
                        ? 'bg-white text-primary-600'
                        : 'bg-white/20 text-white/60'
                      }
                    `}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-6 h-6" />
                    ) : (
                      <step.icon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <p className={`text-sm font-medium ${
                      currentStep >= step.id ? 'text-white' : 'text-white/60'
                    }`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-primary-300 hidden sm:block">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Connector line */}
                {index < STEPS.length - 1 && (
                  <div
                    className={`
                      flex-1 h-1 mx-4 rounded
                      transition-all duration-300
                      ${currentStep > step.id ? 'bg-success' : 'bg-white/20'}
                    `}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form container */}
        <div className="max-w-2xl mx-auto">
          <div className="glass-card p-8">
            {error && (
              <Alert variant="error" className="mb-6" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* Step content */}
            {currentStep === 1 && (
              <StepFiscalIdentity
                data={formData}
                onUpdate={updateFormData}
                onNext={nextStep}
              />
            )}

            {currentStep === 2 && (
              <StepRepresentation
                data={formData}
                onUpdate={updateFormData}
                onNext={nextStep}
                onBack={prevStep}
              />
            )}

            {currentStep === 3 && (
              <StepActivities
                data={formData}
                onUpdate={updateFormData}
                onBack={prevStep}
                onComplete={handleComplete}
                loading={loading}
              />
            )}
          </div>

          {/* Footer info */}
          <p className="text-center text-primary-300 text-sm mt-6">
            Estos datos son necesarios para generar tus reportes XML al SAT.
            <br />
            Podrás modificarlos posteriormente en la configuración.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Wizard;
