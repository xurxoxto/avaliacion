import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, BarChart3, ListTree, Search } from 'lucide-react';
import { Teacher, Classroom, Student } from '../types';
import { storage } from '../utils/storage';
import { useRemoteRefresh } from '../utils/useRemoteRefresh';
import Header from '../components/Header';
import ClassroomCard from '../components/ClassroomCard';
import CreateClassroomModal from '../components/CreateClassroomModal';
import StudentCard from '../components/StudentCard';

interface DashboardPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function DashboardPage({ teacher, onLogout }: DashboardPageProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  const loadClassrooms = () => {
    const allClassrooms = storage.getClassrooms();
    setClassrooms(allClassrooms);
    setStudents(storage.getStudents());
  };

  useEffect(() => {
    loadClassrooms();
  }, []);

  useRemoteRefresh(loadClassrooms);

  const filteredStudents = studentQuery.trim()
    ? students.filter(s => {
        const q = studentQuery.trim().toLowerCase();
        return (
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          `${s.lastName} ${s.firstName}`.toLowerCase().includes(q) ||
          String(s.listNumber).includes(q)
        );
      })
    : [];

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Mis Aulas</h1>
            <p className="text-gray-600 mt-2">Gestiona tus clases y estudiantes</p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => navigate('/analytics')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              Analíticas
            </button>
            <button
              onClick={() => navigate('/competencias')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <ListTree className="w-5 h-5" />
              Competencias
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nueva Aula
            </button>
          </div>
        </div>

        <div className="card mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Buscar estudiantes</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              className="input-field pl-10"
              placeholder="Buscar por nombre, apellidos o número de lista..."
            />
          </div>

          {studentQuery.trim() && (
            <div className="mt-4">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-gray-600">No se encontraron estudiantes.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredStudents.slice(0, 12).map((s) => (
                    <StudentCard key={s.id} student={s} onClick={() => navigate(`/student/${s.id}`)} />
                  ))}
                </div>
              )}
            </div>
          )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
