import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, BarChart3 } from 'lucide-react';
import { Teacher, Classroom } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import ClassroomCard from '../components/ClassroomCard';
import CreateClassroomModal from '../components/CreateClassroomModal';

interface DashboardPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function DashboardPage({ teacher, onLogout }: DashboardPageProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadClassrooms();
  }, []);

  const loadClassrooms = () => {
    const allClassrooms = storage.getClassrooms();
    setClassrooms(allClassrooms);
  };

  const handleCreateClassroom = (classroom: Omit<Classroom, 'id' | 'createdAt' | 'updatedAt' | 'studentCount'>) => {
    const newClassroom: Classroom = {
      ...classroom,
      id: Date.now().toString(),
      studentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedClassrooms = [...classrooms, newClassroom];
    storage.saveClassrooms(updatedClassrooms);
    setClassrooms(updatedClassrooms);
    setShowCreateModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mis Aulas</h1>
            <p className="text-gray-600 mt-2">Gestiona tus clases y estudiantes</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/analytics')}
              className="btn-secondary flex items-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              Analíticas
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nueva Aula
            </button>
          </div>
        </div>

        {classrooms.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No hay aulas creadas
            </h3>
            <p className="text-gray-500 mb-6">
              Comienza creando tu primera aula para gestionar estudiantes
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Crear Primera Aula
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.map((classroom) => (
              <ClassroomCard
                key={classroom.id}
                classroom={classroom}
                onClick={() => navigate(`/classroom/${classroom.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateClassroomModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateClassroom}
        />
      )}
    </div>
  );
}
