import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-secondary-900 flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-lg rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Shield className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            PLD BDU
          </h1>
          <p className="text-xl text-primary-200 mb-6">
            Plataforma de Cumplimiento Legal
          </p>
          <p className="text-primary-300">
            Gestiona tu cumplimiento con la Ley Antilavado (LFPIORPI) de manera
            automatizada, segura y eficiente.
          </p>
        </div>
      </div>

      {/* Right panel - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-lg rounded-xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">PLD BDU</h1>
          </div>

          {/* Auth form container */}
          <div className="glass-card p-8">
            <Outlet />
          </div>

          {/* Footer */}
          <p className="text-center text-primary-300 text-sm mt-6">
            &copy; {new Date().getFullYear()} PLD BDU. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
