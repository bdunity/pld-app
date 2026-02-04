import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, ArrowRight, ArrowLeft } from 'lucide-react';
import { representationSchema, CARGOS_REPRESENTANTE } from '../../../core/validations/authSchemas';
import { Button, Input } from '../../../shared/components';

export function StepRepresentation({ data, onUpdate, onNext, onBack }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(representationSchema),
    defaultValues: {
      nombreOficialCumplimiento: data.nombreOficialCumplimiento || '',
      rfcRepresentante: data.rfcRepresentante || '',
      cargoRepresentante: data.cargoRepresentante || '',
      emailContacto: data.emailContacto || '',
      telefonoContacto: data.telefonoContacto || '',
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
          <Users className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-secondary-900">
            Representación Legal
          </h3>
          <p className="text-sm text-secondary-500">
            Datos del oficial de cumplimiento
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Nombre del Oficial */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Nombre del Oficial de Cumplimiento <span className="text-error">*</span>
          </label>
          <Input
            placeholder="Nombre completo"
            error={errors.nombreOficialCumplimiento?.message}
            {...register('nombreOficialCumplimiento')}
          />
        </div>

        {/* RFC del Representante */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            RFC del Representante <span className="text-error">*</span>
          </label>
          <Input
            placeholder="RFC persona física (13 caracteres)"
            className="uppercase"
            maxLength={13}
            error={errors.rfcRepresentante?.message}
            {...register('rfcRepresentante', {
              onChange: (e) => {
                e.target.value = e.target.value.toUpperCase();
              },
            })}
          />
          <p className="mt-1 text-xs text-secondary-500">
            Debe ser el RFC de una persona física (13 caracteres)
          </p>
        </div>

        {/* Cargo */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Cargo <span className="text-error">*</span>
          </label>
          <select
            className={`
              w-full px-4 py-2 rounded-lg border transition-all duration-200
              bg-white text-secondary-900
              focus:outline-none focus:ring-2 focus:ring-offset-0
              ${errors.cargoRepresentante
                ? 'border-error focus:ring-error/30 focus:border-error'
                : 'border-secondary-300 focus:ring-primary-500/30 focus:border-primary-500'
              }
            `}
            {...register('cargoRepresentante')}
          >
            <option value="">Selecciona el cargo</option>
            {CARGOS_REPRESENTANTE.map((cargo) => (
              <option key={cargo.value} value={cargo.value}>
                {cargo.label}
              </option>
            ))}
          </select>
          {errors.cargoRepresentante && (
            <p className="mt-1 text-sm text-error">{errors.cargoRepresentante.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Email de Contacto <span className="text-error">*</span>
          </label>
          <Input
            type="email"
            placeholder="oficial@empresa.com"
            error={errors.emailContacto?.message}
            {...register('emailContacto')}
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Teléfono de Contacto <span className="text-error">*</span>
          </label>
          <Input
            type="tel"
            placeholder="10 dígitos"
            maxLength={10}
            error={errors.telefonoContacto?.message}
            {...register('telefonoContacto', {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
              },
            })}
          />
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            size="lg"
            onClick={onBack}
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Anterior
          </Button>
          <Button type="submit" className="flex-1" size="lg">
            Continuar
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export default StepRepresentation;
