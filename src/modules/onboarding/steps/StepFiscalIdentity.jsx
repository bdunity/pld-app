import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ArrowRight, HelpCircle } from 'lucide-react';
import { fiscalIdentitySchema, REGIMENES_FISCALES } from '../../../core/validations/authSchemas';
import { Button, Input } from '../../../shared/components';

export function StepFiscalIdentity({ data, onUpdate, onNext }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(fiscalIdentitySchema),
    defaultValues: {
      rfc: data.rfc || '',
      razonSocial: data.razonSocial || '',
      regimenFiscal: data.regimenFiscal || '',
    },
  });

  const onSubmit = (formData) => {
    onUpdate(formData);
    onNext();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-secondary-900">
            Identidad Fiscal
          </h3>
          <p className="text-sm text-secondary-500">
            Datos de tu empresa para el SAT
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* RFC */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-sm font-medium text-secondary-700">
              RFC <span className="text-error">*</span>
            </label>
            <div className="group relative">
              <HelpCircle className="w-4 h-4 text-secondary-400 cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-secondary-800 text-white text-xs rounded-lg shadow-lg z-10">
                Persona Moral: 12 caracteres (3 letras + 6 dígitos + 3 homoclave)
                <br />
                Persona Física: 13 caracteres (4 letras + 6 dígitos + 3 homoclave)
              </div>
            </div>
          </div>
          <Input
            placeholder="Ej: ABC123456XY9"
            className="uppercase"
            maxLength={13}
            error={errors.rfc?.message}
            {...register('rfc', {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase();
              },
            })}
          />
          <p className="mt-1 text-xs text-secondary-500">
            Formato: 3-4 letras + 6 dígitos (fecha) + 3 caracteres (homoclave)
          </p>
        </div>

        {/* Razón Social */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Razón Social <span className="text-error">*</span>
          </label>
          <Input
            placeholder="Nombre completo de la empresa"
            error={errors.razonSocial?.message}
            {...register('razonSocial')}
          />
        </div>

        {/* Régimen Fiscal */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Régimen Fiscal <span className="text-error">*</span>
          </label>
          <select
            className={`
              w-full px-4 py-2 rounded-lg border transition-all duration-200
              bg-white text-secondary-900
              focus:outline-none focus:ring-2 focus:ring-offset-0
              ${errors.regimenFiscal
                ? 'border-error focus:ring-error/30 focus:border-error'
                : 'border-secondary-300 focus:ring-primary-500/30 focus:border-primary-500'
              }
            `}
            {...register('regimenFiscal')}
          >
            <option value="">Selecciona un régimen fiscal</option>
            {REGIMENES_FISCALES.map((regimen) => (
              <option key={regimen.value} value={regimen.value}>
                {regimen.value} - {regimen.label}
              </option>
            ))}
          </select>
          {errors.regimenFiscal && (
            <p className="mt-1 text-sm text-error">{errors.regimenFiscal.message}</p>
          )}
        </div>

        {/* Submit button */}
        <div className="pt-4">
          <Button type="submit" className="w-full" size="lg">
            Continuar
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export default StepFiscalIdentity;
