import { User, Hash, Trash2 } from 'lucide-react';
import { Student } from '../types';

interface StudentCardProps {
  student: Student;
  onClick: () => void;
  onDelete: () => void;
}

export default function StudentCard({ student, onClick, onDelete }: StudentCardProps) {
  const getGradeColor = (grade: number) => {
    if (grade >= 9) return 'bg-green-100 text-green-800';
    if (grade >= 7) return 'bg-yellow-100 text-yellow-800';
    if (grade >= 5) return 'bg-blue-100 text-blue-800';
    return 'bg-red-100 text-red-800';
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 60) return 'bg-yellow-500';
    if (progress >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

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
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">
            {student.firstName} {student.lastName}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">
              <Hash className="w-3 h-3" />
              {student.listNumber}
            </span>
          </div>
        </div>
        <div className="bg-primary-100 p-2 rounded-lg">
          <User className="w-5 h-5 text-primary-600" />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Progreso</span>
            <span className="font-medium text-gray-900">{student.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${getProgressColor(student.progress)}`}
              style={{ width: `${student.progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Calificación</span>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getGradeColor(student.averageGrade)}`}>
            {student.averageGrade.toFixed(1)}/10
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
          aria-label="Eliminar estudiante"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
