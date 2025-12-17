import { useState } from 'react';
import { X } from 'lucide-react';
import { Student } from '../types';

interface CreateStudentModalProps {
  classroomId: string;
  onClose: () => void;
  onCreate: (student: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function CreateStudentModal({ classroomId, onClose, onCreate }: CreateStudentModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [listNumber, setListNumber] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim()) {
      setError('El nombre es requerido');
      return;
    }

    if (!lastName.trim()) {
      setError('Los apellidos son requeridos');
      return;
    }

    if (!listNumber || parseInt(listNumber) < 1) {
      setError('El número de lista debe ser mayor a 0');
      return;
    }

    onCreate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      classroomId,
      listNumber: parseInt(listNumber),
      progress: 0,
      averageGrade: 0,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Nuevo Estudiante</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input-field"
              placeholder="Ej: María"
              required
            />
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
              Apellidos
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input-field"
              placeholder="Ej: García López"
              required
            />
          </div>

          <div>
            <label htmlFor="listNumber" className="block text-sm font-medium text-gray-700 mb-2">
              Número de Lista
            </label>
            <input
              id="listNumber"
              type="number"
              value={listNumber}
              onChange={(e) => setListNumber(e.target.value)}
              className="input-field"
              placeholder="Ej: 1"
              min="1"
              required
            />
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
              Crear Estudiante
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
