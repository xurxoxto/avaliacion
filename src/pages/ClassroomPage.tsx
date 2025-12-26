import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Search, User, Trash2, Upload, Download } from 'lucide-react';
import { Teacher, Classroom, Student } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import StudentCard from '../components/StudentCard';
import CreateStudentModal from '../components/CreateStudentModal';
import ImportStudentsModal from '../components/ImportStudentsModal';
import CreateClassroomModal from '../components/CreateClassroomModal';
import Breadcrumbs from '../components/Breadcrumbs';
import { listenStudentsByClassroom, createStudent, createStudentsBulk, deleteStudent } from '../utils/firestore/students';
import { listenClassrooms, deleteClassroom, updateClassroom } from '../utils/firestore/classrooms';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { deleteEvidenceNotesForStudents } from '../lib/firestore/services/evidenceNotesService';
import { deleteTaskEvaluationsForStudents } from '../lib/firestore/services/taskEvaluationsService';
import { fetchCriteria } from '../lib/firestore/services/criteriaFetchService';
import { fetchCriterionEvaluationsForStudents } from '../lib/firestore/services/xadeExportService';
import { downloadCsvFile, findUnmappedEvaluatedAreas, generateXadeCsv } from '../logic/xade/xadeExport';

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditClassroomModal, setShowEditClassroomModal] = useState(false);
  const [xadeExporting, setXadeExporting] = useState(false);

  const handleExportXade = async () => {
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Inicia sesión para exportar.');
      return;
    }
    if (!classroom || !id) return;
    if (students.length === 0) {
      alert('No hay estudiantes en el aula.');
      return;
    }

    setXadeExporting(true);
    try {
      const [criteria, evaluations] = await Promise.all([
        fetchCriteria(workspaceId),
        fetchCriterionEvaluationsForStudents({ workspaceId, studentIds: students.map((s) => s.id) }),
      ]);

      if (evaluations.length === 0) {
        const ok = confirm(
          'No se han encontrado evaluaciones por criterio (escala 1–4) para este aula.\n\nEl CSV saldrá sin calificaciones.\n\n¿Quieres exportar igualmente?'
        );
        if (!ok) return;
      }

      if (criteria.length === 0) {
        alert(
          'Aviso: no hay criterios cargados en Firestore para este workspace. Sin criterios, el exportador no puede asociar evaluaciones a áreas XADE y el CSV puede salir vacío.'
        );
      }

      const csv = generateXadeCsv({
        classroom,
        students,
        criteria,
        criterionEvaluations: evaluations,
        delimiter: ';',
      });

      const unmapped = findUnmappedEvaluatedAreas({ criteria, criterionEvaluations: evaluations });

      const safeName = String(classroom.name || 'aula')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^\w\-]+/g, '');
      const course = String(classroom.grade || '').trim().replace(/\s+/g, '');
      const filename = `XADE_${course || 'curso'}_${safeName || 'aula'}.csv`;
      downloadCsvFile(filename, csv);

      if (unmapped.length > 0) {
        const head = unmapped.slice(0, 8).join(' · ');
        alert(
          `Aviso: algunos criterios evaluados no se pudieron mapear a columnas XADE y se omitieron del CSV.\n\nEjemplos: ${head}${unmapped.length > 8 ? '…' : ''}`
        );
      }
    } catch (e) {
      console.error('XADE export failed', e);
      alert('No se pudo exportar el CSV de XADE.');
    } finally {
      setXadeExporting(false);
    }
  };

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

  const handleCreateStudent = async (form: Pick<Student, 'firstName' | 'lastName' | 'listNumber' | 'level'>) => {
    if (teacher.workspaceId && id) {
      try {
        await createStudent(teacher.workspaceId, {
          ...form,
          classroomId: id,
          progress: 0,
          averageGrade: 0,
        });
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

  const handleImportStudents = async (importRows: Array<Pick<Student, 'firstName' | 'lastName' | 'listNumber' | 'level'>>) => {
    if (!teacher.workspaceId || !id) return;
    if (importRows.length === 0) return;

    try {
      const created = await createStudentsBulk(
        teacher.workspaceId,
        importRows.map((r) => ({
          ...r,
          classroomId: id,
          progress: 0,
          averageGrade: 0,
        }))
      );

      const classroomRef = doc(db, 'workspaces', teacher.workspaceId, 'classrooms', id);
      await updateDoc(classroomRef, {
        studentCount: increment(created),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error importing students:', error);
      alert('Hubo un error al importar estudiantes. Por favor, inténtalo de nuevo.');
      throw error;
    }
  };

  const handleEditClassroom = async (form: Pick<Classroom, 'name' | 'grade'>) => {
    if (!teacher.workspaceId || !id) return;
    try {
      await updateClassroom(teacher.workspaceId, id, { name: form.name, grade: form.grade });
    } catch (error) {
      console.error('Error updating classroom:', error);
      alert('Hubo un error al actualizar el aula. Por favor, inténtalo de nuevo.');
    }
    setShowEditClassroomModal(false);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este estudiante? Esta acción no se puede deshacer.')) {
      if (teacher.workspaceId && id) {
        try {
          await Promise.all([
            deleteTaskEvaluationsForStudents(teacher.workspaceId, [studentId]),
            deleteEvidenceNotesForStudents(teacher.workspaceId, [studentId]),
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
        ? deleteTaskEvaluationsForStudents(workspaceId, removedStudentIdsList)
        : Promise.resolve(),
      removedStudentIdsList.length > 0
        ? deleteEvidenceNotesForStudents(workspaceId, removedStudentIdsList)
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
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{classroom.name}</h1>
              <p className="text-gray-600 mt-2">
                {classroom.grade} • {students.length} {students.length === 1 ? 'estudiante' : 'estudiantes'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowEditClassroomModal(true)}
              className="btn-secondary flex items-center justify-center gap-2"
              title="Editar aula"
            >
              Editar Aula
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="btn-secondary flex items-center justify-center gap-2"
              title="Importar estudiantes desde CSV"
            >
              <Upload className="w-5 h-5" />
              Importar
            </button>
            <button
              onClick={handleExportXade}
              className="btn-secondary flex items-center justify-center gap-2"
              title="Exportar CSV compatible con XADE"
              disabled={!teacher.workspaceId || xadeExporting}
            >
              <Download className="w-5 h-5" />
              {xadeExporting ? 'Exportando…' : 'Exportar XADE'}
            </button>
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
              placeholder="Buscar estudiantes por nombre o número…"
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
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateStudent}
        />
      )}

      {showImportModal && (
        <ImportStudentsModal
          onClose={() => setShowImportModal(false)}
          existingStudents={students}
          onImport={handleImportStudents}
        />
      )}

      {showEditClassroomModal && classroom ? (
        <CreateClassroomModal
          onClose={() => setShowEditClassroomModal(false)}
          onSubmit={handleEditClassroom}
          initial={{ name: classroom.name, grade: classroom.grade }}
          title="Editar Aula"
          submitLabel="Guardar"
        />
      ) : null}
    </div>
  );
}
