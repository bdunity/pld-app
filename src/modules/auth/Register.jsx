import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Lock, UserPlus, CheckCircle } from 'lucide-react';
import { useAuth } from '../../core/context/AuthContext';
import { registerSchema } from '../../core/validations/authSchemas';
import { Button, Input, Alert } from '../../shared/components';

export function Register() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password', '');

  // Validaciones de contraseña en tiempo real
  const passwordChecks = {
    length: password.length >= 6,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const onSubmit = async (data) => {
    setError('');
    setLoading(true);

    try {
      await registerUser(data.email, data.password);
      // Después del registro, redirigir al onboarding
      navigate('/onboarding');
    } catch (err) {
      console.error('Register error:', err);

      const errorMessages = {
        'auth/email-already-in-use': 'Ya existe una cuenta con este correo electrónico',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/operation-not-allowed': 'El registro está deshabilitado temporalmente',
        'auth/weak-password': 'La contraseña es muy débil',
      };

      setError(errorMessages[err.code] || 'Error al crear la cuenta. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-secondary-900">
          Crear cuenta
        </h2>
        <p className="text-secondary-600 mt-2">
          Comienza a gestionar tu cumplimiento PLD
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <Input
              type="email"
              placeholder="correo@ejemplo.com"
              className="pl-10"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>
        </div>

        <div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <Input
              type="password"
              placeholder="Crea una contraseña"
              className="pl-10"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>

          {/* Indicadores de validación de contraseña */}
          {password && (
            <div className="mt-2 space-y-1">
              <PasswordCheck
                valid={passwordChecks.length}
                text="Al menos 6 caracteres"
              />
              <PasswordCheck
                valid={passwordChecks.uppercase}
                text="Una letra mayúscula"
              />
              <PasswordCheck
                valid={passwordChecks.number}
                text="Un número"
              />
            </div>
          )}
        </div>

        <div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <Input
              type="password"
              placeholder="Confirma tu contraseña"
              className="pl-10"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={loading}
        >
          <UserPlus className="w-5 h-5 mr-2" />
          Crear Cuenta
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-secondary-600">
          ¿Ya tienes una cuenta?{' '}
          <Link
            to="/login"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Inicia sesión
          </Link>
        </p>
      </div>

      <p className="mt-4 text-xs text-secondary-500 text-center">
        Al registrarte, aceptas nuestros{' '}
        <a href="#" className="text-primary-600 hover:underline">
          Términos de Servicio
        </a>{' '}
        y{' '}
        <a href="#" className="text-primary-600 hover:underline">
          Política de Privacidad
        </a>
      </p>
    </div>
  );
}

// Componente auxiliar para los checks de contraseña
function PasswordCheck({ valid, text }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${valid ? 'text-success' : 'text-secondary-400'}`}>
      <CheckCircle className={`w-3.5 h-3.5 ${valid ? 'text-success' : 'text-secondary-300'}`} />
      <span>{text}</span>
    </div>
  );
}

export default Register;
