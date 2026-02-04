import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../../core/context/AuthContext';
import { recoverySchema } from '../../core/validations/authSchemas';
import { Button, Input, Alert } from '../../shared/components';

export function Recovery() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(recoverySchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data) => {
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await resetPassword(data.email);
      setSuccess(true);
    } catch (err) {
      console.error('Recovery error:', err);

      const errorMessages = {
        'auth/user-not-found': 'No existe una cuenta con este correo electrónico',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
      };

      setError(errorMessages[err.code] || 'Error al enviar el correo. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-secondary-900 mb-2">
          Correo enviado
        </h2>
        <p className="text-secondary-600 mb-6">
          Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center text-primary-600 hover:text-primary-700 font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <KeyRound className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold text-secondary-900">
          ¿Olvidaste tu contraseña?
        </h2>
        <p className="text-secondary-600 mt-2">
          Ingresa tu correo y te enviaremos instrucciones para restablecerla
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

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={loading}
        >
          Enviar instrucciones
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="inline-flex items-center text-secondary-600 hover:text-secondary-800 font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}

export default Recovery;
