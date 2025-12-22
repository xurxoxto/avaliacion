import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, BarChart3, ListTree } from 'lucide-react';
import { Teacher, Classroom, Student } from '../types';
import { storage } from '../utils/storage';
import { listenClassrooms, createClassroom, deleteClassroom } from '../utils/firestore/classrooms';
import { listenStudents } from '../utils/firestore/students';
import { deleteGradesForStudents } from '../utils/firestore/grades';
import { deleteTriangulationObservationsForStudents } from '../utils/firestore/triangulationObservations';
import Header from '../components/Header';
import ClassroomCard from '../components/ClassroomCard';
import CreateClassroomModal from '../components/CreateClassroomModal';

interface DashboardPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function DashboardPage({ teacher, onLogout }: DashboardPageProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!teacher.workspaceId) return;

    const unsubClassrooms = listenClassrooms(teacher.workspaceId, (remoteClassrooms) => {
      setClassrooms(remoteClassrooms);
      storage.saveClassrooms(remoteClassrooms);
    });

    const unsubStudents = listenStudents(teacher.workspaceId, (remoteStudents) => {
      setStudents(remoteStudents);
      storage.saveStudents(remoteStudents);
    });

    return () => {
      unsubClassrooms();
      unsubStudents();
    };
  }, [teacher.workspaceId]);

  const handleCreateClassroom = async (classroomData: Omit<Classroom, 'id' | 'createdAt' | 'updatedAt' | 'studentCount'>) => {
    const newClassroom: Omit<Classroom, 'id' | 'createdAt' | 'updatedAt'> = {
      ...classroomData,
      studentCount: 0,
    };

    if (!teacher.workspaceId) return;
    try {
      await createClassroom(teacher.workspaceId, newClassroom);
    } catch (error) {
      console.error("Error creating classroom:", error);
      alert("Hubo un error al crear el aula. Por favor, inténtalo de nuevo.");
    }
    
    setShowCreateModal(false);
  };

  const handleDeleteClassroom = async (classroomId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta aula y todos sus estudiantes? Esta acción no se puede deshacer.')) {
      if (!teacher.workspaceId) return;
      try {
        const removedStudentIds = students.filter(s => s.classroomId === classroomId).map(s => s.id);
        if (removedStudentIds.length > 0) {
          await Promise.all([
            deleteGradesForStudents(teacher.workspaceId, removedStudentIds),
            deleteTriangulationObservationsForStudents(teacher.workspaceId, removedStudentIds),
          ]);
        }
        await deleteClassroom(teacher.workspaceId, classroomId);
      } catch (error) {
        console.error("Error deleting classroom:", error);
        alert("Hubo un error al eliminar el aula. Por favor, inténtalo de nuevo.");
      }
    }
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
              Crear Aula
            </button>
          </div>
        </div>

        {classrooms.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {classrooms.map(classroom => (
              <ClassroomCard
                key={classroom.id}
                classroom={classroom}
                onClick={() => navigate(`/classroom/${classroom.id}`)}
                onDelete={() => handleDeleteClassroom(classroom.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay aulas</h3>
            <p className="mt-1 text-sm text-gray-500">
              Empieza por crear una nueva aula para tus estudiantes.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowCreateModal(true)}
                type="button"
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Crear Aula
              </button>
            </div>
          </div>
        )}

        {showCreateModal && (
          <CreateClassroomModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateClassroom}
          />
        )}
      </main>
    </div>
  );
}
