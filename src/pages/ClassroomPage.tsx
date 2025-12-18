import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, User } from 'lucide-react';
import { Teacher, Classroom, Student } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import StudentCard from '../components/StudentCard';
import CreateStudentModal from '../components/CreateStudentModal';

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
    if (id) {
      loadClassroom(id);
      loadStudents(id);
    }
  }, [id]);

  useEffect(() => {
    filterStudents();
  }, [searchQuery, students]);

  const loadClassroom = (classroomId: string) => {
    const allClassrooms = storage.getClassrooms();
    const found = allClassrooms.find(c => c.id === classroomId);
    setClassroom(found || null);
  };

  const loadStudents = (classroomId: string) => {
    const allStudents = storage.getStudents();
    const classroomStudents = allStudents.filter(s => s.classroomId === classroomId);
    setStudents(classroomStudents);
    setFilteredStudents(classroomStudents);
  };

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

  const handleCreateStudent = (studentData: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newStudent: Student = {
      ...studentData,
      id: Date.now().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedStudents = [...students, newStudent];
    storage.saveStudents([...storage.getStudents().filter(s => s.classroomId !== id), ...updatedStudents]);
    setStudents(updatedStudents);
    setShowCreateModal(false);

    // Update classroom student count
    if (classroom) {
      const allClassrooms = storage.getClassrooms();
      const updatedClassrooms = allClassrooms.map(c =>
        c.id === classroom.id ? { ...c, studentCount: updatedStudents.length, updatedAt: new Date() } : c
      );
      storage.saveClassrooms(updatedClassrooms);
      setClassroom({ ...classroom, studentCount: updatedStudents.length });
    }
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate('/')}
          className="btn-secondary flex items-center gap-2 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver al Dashboard
        </button>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{classroom.name}</h1>
            <p className="text-gray-600 mt-2">
              {classroom.grade} • {students.length} {students.length === 1 ? 'estudiante' : 'estudiantes'}
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Añadir Estudiante
          </button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredStudents.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                onClick={() => navigate(`/student/${student.id}`)}
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
