import { Users, Calendar, Trash2 } from 'lucide-react';
import { Classroom } from '../types';

interface ClassroomCardProps {
  classroom: Classroom;
  onClick: () => void;
  onDelete: () => void;
}

export default function ClassroomCard({ classroom, onClick, onDelete }: ClassroomCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:scale-105 transition-transform"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">{classroom.name}</h3>
          <p className="text-sm text-gray-600">{classroom.grade}</p>
        </div>
        <div className="bg-primary-100 p-3 rounded-lg">
          <Users className="w-6 h-6 text-primary-600" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-gray-700">
          <Users className="w-5 h-5 text-gray-400" />
          <span className="text-sm">
            {classroom.studentCount} {classroom.studentCount === 1 ? 'estudiante' : 'estudiantes'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-gray-700">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="text-sm">
            Creado {new Date(classroom.createdAt).toLocaleDateString('es-ES')}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
        <button
          onClick={onClick}
          className="text-primary-600 hover:text-primary-700 font-medium text-sm"
        >
          Ver detalles →
        </button>
        <button
          onClick={handleDelete}
          className="text-red-500 hover:text-red-700 font-medium text-sm p-2 rounded-full hover:bg-red-100"
          aria-label="Eliminar aula"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
