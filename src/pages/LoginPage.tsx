import { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { Teacher } from '../types';
import { auth } from '../config/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

interface LoginPageProps {
  onLogin: (teacher: Teacher) => void;
  externalError?: string;
}

export default function LoginPage({ onLogin, externalError }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !email.includes('@')) {
      setError('Por favor, introduce un email válido');
      setLoading(false);
      return;
    }

    // Domain restriction (matches Firestore rules)
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@edu.xunta.gal')) {
      setError('Solo se permiten cuentas @edu.xunta.gal');
      setLoading(false);
      return;
    }

    if (!password) {
      setError('Por favor, introduce una contraseña');
      setLoading(false);
      return;
    }

    try {
      let userCredential;
      if (mode === 'signup') {
        userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }

      const user = userCredential.user;
      const userEmail = (user.email || normalizedEmail).toLowerCase();
      const domain = userEmail.split('@')[1] || userEmail;
      const workspaceId = domain;

      const teacher: Teacher = {
        id: user.uid,
        name: userEmail.split('@')[0],
        email: userEmail,
        workspaceId,
        classroomIds: [],
      };

      onLogin(teacher);
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'auth/invalid-credential') setError('Credenciales incorrectas');
      else if (code === 'auth/user-not-found') setError('Usuario no encontrado');
      else if (code === 'auth/wrong-password') setError('Contraseña incorrecta');
      else if (code === 'auth/email-already-in-use') setError('Ese email ya está registrado');
      else if (code === 'auth/weak-password') setError('La contraseña es demasiado débil');
      else if (code === 'auth/network-request-failed') setError('Error de red. Revisa tu conexión.');
      else if (code === 'auth/operation-not-allowed') {
        setError('En Firebase: habilita Email/Password en Authentication → Sign-in method.');
      }
      else if (code === 'auth/unauthorized-domain') {
        setError('Dominio no autorizado en Firebase Auth. Añade este dominio en Authentication → Settings → Authorized domains.');
      }
      else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Espera un momento y vuelve a intentarlo.');
      }
      else setError('No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
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

          {externalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {externalError}
            </div>
          )}

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
              {loading ? 'Cargando...' : (mode === 'signup' ? 'Crear cuenta' : 'Iniciar Sesión')}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-primary-700 hover:text-primary-800 font-medium"
              onClick={() => {
                setError('');
                setMode(m => (m === 'login' ? 'signup' : 'login'));
              }}
              disabled={loading}
            >
              {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Iniciar sesión'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            Sistema compatible con Decreto 155/2021
          </p>
        </div>
      </div>
    </div>
  );
}
