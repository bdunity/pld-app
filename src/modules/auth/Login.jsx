import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Lock, LogIn } from 'lucide-react';
import { useAuth } from '../../core/context/AuthContext';
import { loginSchema } from '../../core/validations/authSchemas';
import { Button, Input, Alert } from '../../shared/components';

export function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data) => {
    setError('');
    setLoading(true);

    try {
      await login(data.email, data.password);
      // La redirección se maneja en App.jsx según el estado del onboarding
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);

      // Mapear errores de Firebase a mensajes amigables
      const errorMessages = {
        'auth/user-not-found': 'No existe una cuenta con este correo electrónico',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
        'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde',
        'auth/invalid-credential': 'Credenciales inválidas. Verifica tu correo y contraseña',
      };

      setError(errorMessages[err.code] || 'Error al iniciar sesión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-secondary-900">
          Bienvenido de vuelta
        </h2>
        <p className="text-secondary-600 mt-2">
          Ingresa tus credenciales para continuar
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
              placeholder="Tu contraseña"
              className="pl-10"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Link
            to="/recovery"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={loading}
        >
          <LogIn className="w-5 h-5 mr-2" />
          Iniciar Sesión
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-secondary-600">
          ¿No tienes una cuenta?{' '}
          <Link
            to="/register"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
