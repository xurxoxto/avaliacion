import { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { Teacher } from '../types';

interface LoginPageProps {
  onLogin: (teacher: Teacher) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Por favor, introduce un email válido');
      return;
    }

    if (!password) {
      setError('Por favor, introduce una contraseña');
      return;
    }

    // DEMO: Simple authentication (replace with proper auth in production)
    // TODO: Implement proper authentication with backend validation
    const teacher: Teacher = {
      id: Date.now().toString(),
      name: email.split('@')[0],
      email,
      classroomIds: [],
    };

    onLogin(teacher);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 to-primary-800 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Sistema de Evaluación
            </h1>
            <p className="text-gray-600">CEIP Galicia - Portal del Profesor</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  placeholder="profesor@colegio.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-3 text-lg">
              Iniciar Sesión
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Sistema compatible con Decreto 155/2021
          </p>
        </div>
      </div>
    </div>
  );
}
