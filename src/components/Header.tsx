import { LogOut, BookOpen } from 'lucide-react';
import { Teacher } from '../types';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function Header({ teacher, onLogout }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div 
            className="flex items-center gap-3 cursor-pointer min-w-0"
            onClick={() => navigate('/')}
          >
            <BookOpen className="w-8 h-8 text-primary-600" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Sistema de Evaluación</h1>
              <p className="text-sm text-gray-600 hidden sm:block truncate">CEIP Galicia</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{teacher.name}</p>
              <p className="text-xs text-gray-600 truncate max-w-[16rem]">{teacher.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="btn-secondary flex items-center gap-2"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
