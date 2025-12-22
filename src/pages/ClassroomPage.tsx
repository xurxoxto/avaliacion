import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, User, Trash2 } from 'lucide-react';
import { Teacher, Classroom, Student } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import StudentCard from '../components/StudentCard';
import CreateStudentModal from '../components/CreateStudentModal';
import Breadcrumbs from '../components/Breadcrumbs';
import { deleteGradesForStudents } from '../utils/firestore/grades';
import { deleteTriangulationObservationsForStudents } from '../utils/firestore/triangulationObservations';
import { listenStudentsByClassroom, createStudent, deleteStudent } from '../utils/firestore/students';
import { listenClassrooms, deleteClassroom } from '../utils/firestore/classrooms';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

interface ClassroomPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function ClassroomPage({ teacher, onLogout }: ClassroomPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!id) return;

    if (!teacher.workspaceId) return;

    const unsubClassrooms = listenClassrooms(teacher.workspaceId, (remoteClassrooms) => {
      storage.saveClassrooms(remoteClassrooms);
      const found = remoteClassrooms.find(c => c.id === id);
      setClassroom(found || null);
    });

    const unsubStudents = listenStudentsByClassroom(teacher.workspaceId, id, (remoteStudents) => {
      setStudents(remoteStudents);
      const allLocalStudents = storage.getStudents().filter(s => s.classroomId !== id);
      storage.saveStudents([...allLocalStudents, ...remoteStudents]);
    });

    return () => {
      unsubClassrooms();
      unsubStudents();
    };
  }, [id, teacher.workspaceId]);

  useEffect(() => {
    filterStudents();
  }, [searchQuery, students]);

  const filterStudents = () => {
    if (!searchQuery.trim()) {
      setFilteredStudents(students);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = students.filter(student =>
      `${student.firstName} ${student.lastName}`.toLowerCase().includes(query) ||
      student.listNumber.toString().includes(query)
    );
    setFilteredStudents(filtered);
  };

  const handleCreateStudent = async (studentData: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (teacher.workspaceId && id) {
      try {
        await createStudent(teacher.workspaceId, studentData);
        // After creating the student, update the classroom's student count
        const classroomRef = doc(db, 'workspaces', teacher.workspaceId, 'classrooms', id);
        await updateDoc(classroomRef, {
          studentCount: increment(1),
          updatedAt: new Date(),
        });
      } catch (error) {
        console.error("Error creating student:", error);
        alert("Hubo un error al crear el estudiante. Por favor, inténtalo de nuevo.");
      }
    }
    setShowCreateModal(false);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este estudiante? Esta acción no se puede deshacer.')) {
      if (teacher.workspaceId && id) {
        try {
          await Promise.all([
            deleteGradesForStudents(teacher.workspaceId, [studentId]),
            deleteTriangulationObservationsForStudents(teacher.workspaceId, [studentId]),
          ]);
          await deleteStudent(teacher.workspaceId, studentId);
          // After deleting the student, update the classroom's student count
          const classroomRef = doc(db, 'workspaces', teacher.workspaceId, 'classrooms', id);
          await updateDoc(classroomRef, {
            studentCount: increment(-1),
            updatedAt: new Date(),
          });
        } catch (error) {
          console.error("Error deleting student:", error);
          alert("Hubo un error al eliminar el estudiante. Por favor, inténtalo de nuevo.");
        }
      }
    }
  };

  const handleDeleteClassroom = () => {
    if (!classroom || !id) return;
    const ok = confirm(`Eliminar el aula "${classroom.name}" y todos sus estudiantes? Esta acción no se puede deshacer.`);
    if (!ok) return;

    const workspaceId = teacher.workspaceId;
    if (!workspaceId) return;
    const removedStudentIdsList = students.map(s => s.id);
    Promise.all([
      removedStudentIdsList.length > 0
        ? deleteGradesForStudents(workspaceId, removedStudentIdsList)
        : Promise.resolve(),
      removedStudentIdsList.length > 0
        ? deleteTriangulationObservationsForStudents(workspaceId, removedStudentIdsList)
        : Promise.resolve(),
    ])
      .then(() => deleteClassroom(workspaceId, id))
      .then(() => navigate('/'))
      .catch(() => {
        alert('No se pudo eliminar el aula.');
      });
  };

  if (!classroom) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header teacher={teacher} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Aula no encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {classroom && (
          <Breadcrumbs items={[{ label: classroom.name, path: `/classroom/${id}` }]} />
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Volver al Dashboard
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{classroom.name}</h1>
              <p className="text-gray-600 mt-2">
                {classroom.grade} • {students.length} {students.length === 1 ? 'estudiante' : 'estudiantes'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleDeleteClassroom}
              className="btn-secondary flex items-center justify-center gap-2"
              title="Eliminar aula"
            >
              <Trash2 className="w-5 h-5" />
              Eliminar Aula
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Añadir Estudiante
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10"
              placeholder="Buscar por nombre o número..."
            />
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="text-center py-16">
            <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {searchQuery ? 'No se encontraron estudiantes' : 'No hay estudiantes'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery 
                ? 'Intenta con otro término de búsqueda' 
                : 'Comienza añadiendo estudiantes a esta aula'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Añadir Primer Estudiante
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredStudents.map(student => (
              <StudentCard
                key={student.id}
                student={student}
                onClick={() => navigate(`/classroom/${id}/student/${student.id}`)}
                onDelete={() => handleDeleteStudent(student.id)}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateStudentModal
          classroomId={id!}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateStudent}
        />
      )}
    </div>
  );
}
