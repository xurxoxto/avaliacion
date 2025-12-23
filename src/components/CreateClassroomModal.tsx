import { useState } from 'react';
import { X } from 'lucide-react';
import { Classroom } from '../types';

interface CreateClassroomModalProps {
  onClose: () => void;
  onSubmit: (classroom: Pick<Classroom, 'name' | 'grade'>) => void;
  initial?: Pick<Classroom, 'name' | 'grade'>;
  title?: string;
  submitLabel?: string;
}

export default function CreateClassroomModal({ onClose, onSubmit, initial, title, submitLabel }: CreateClassroomModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [grade, setGrade] = useState(initial?.grade ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('El nombre del aula es requerido');
      return;
    }

    if (!grade.trim()) {
      setError('El curso es requerido');
      return;
    }

    onSubmit({ name: name.trim(), grade: grade.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{title || 'Nueva Aula'}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Aula
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Ej: 1º Primaria A"
              required
            />
          </div>

          <div>
            <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
              Curso
            </label>
            <select
              id="grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="input-field"
              required
            >
              <option value="">Seleccionar curso...</option>
              <option value="1º Primaria">1º Primaria</option>
              <option value="2º Primaria">2º Primaria</option>
              <option value="3º Primaria">3º Primaria</option>
              <option value="4º Primaria">4º Primaria</option>
              <option value="5º Primaria">5º Primaria</option>
              <option value="6º Primaria">6º Primaria</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
            >
              {submitLabel || 'Crear Aula'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
