import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, BarChart3, ListTree, BookOpen, Search } from 'lucide-react';
import { Teacher, Classroom, Student, LearningSituation, LearningTask } from '../types';
import { storage } from '../utils/storage';
import { listenClassrooms, createClassroom, deleteClassroom } from '../utils/firestore/classrooms';
import { listenStudents } from '../utils/firestore/students';
import { deleteGradesForStudents } from '../utils/firestore/grades';
import { deleteTriangulationObservationsForStudents } from '../utils/firestore/triangulationObservations';
import Header from '../components/Header';
import ClassroomCard from '../components/ClassroomCard';
import CreateClassroomModal from '../components/CreateClassroomModal';
import { seedMvpLearningSituations } from '../lib/firestore/seedData';
import { listenLearningSituations } from '../lib/firestore/services/learningSituationsService';
import { listTasks } from '../lib/firestore/services/learningTasksService';

interface DashboardPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function DashboardPage({ teacher, onLogout }: DashboardPageProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [quickQuery, setQuickQuery] = useState('');
  const [situations, setSituations] = useState<LearningSituation[]>([]);
  const [taskIndex, setTaskIndex] = useState<Array<{ situation: LearningSituation; task: LearningTask }>>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksLoadError, setTasksLoadError] = useState(false);
  const [tasksProgress, setTasksProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const navigate = useNavigate();
  const seededRef = useRef(false);
  const taskIndexWorkspaceRef = useRef<string>('');
  const taskLoadRunIdRef = useRef(0);

  useEffect(() => {
    if (!teacher.workspaceId) return;

    if (!seededRef.current) {
      seededRef.current = true;
      seedMvpLearningSituations(teacher.workspaceId).catch(() => {
        // ignore (permissions/offline)
      });
    }

    const unsubClassrooms = listenClassrooms(teacher.workspaceId, (remoteClassrooms) => {
      setClassrooms(remoteClassrooms);
      storage.saveClassrooms(remoteClassrooms);
    });

    const unsubStudents = listenStudents(teacher.workspaceId, (remoteStudents) => {
      setStudents(remoteStudents);
      storage.saveStudents(remoteStudents);
    });

    const unsubSituations = listenLearningSituations(teacher.workspaceId, setSituations);

    return () => {
      unsubClassrooms();
      unsubStudents();
      unsubSituations();
    };
  }, [teacher.workspaceId]);

  useEffect(() => {
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) return;
    if (taskIndexWorkspaceRef.current === workspaceId && taskIndex.length > 0) return;
    if (situations.length === 0) return;

    taskIndexWorkspaceRef.current = workspaceId;
    taskLoadRunIdRef.current += 1;
    const runId = taskLoadRunIdRef.current;

    setTasksLoading(true);
    setTasksLoadError(false);
    setTasksProgress({ done: 0, total: situations.length });
    setTaskIndex([]);

    const BATCH = 10;
    (async () => {
      let hadError = false;
      for (let i = 0; i < situations.length; i += BATCH) {
        const chunk = situations.slice(i, i + BATCH);
        const settled = await Promise.allSettled(
          chunk.map(async (situation) => {
            const tasks = await listTasks(workspaceId, situation.id);
            return tasks.map((task) => ({ situation, task }));
          })
        );

        if (taskLoadRunIdRef.current !== runId) return;

        const items: Array<{ situation: LearningSituation; task: LearningTask }> = [];
        for (const r of settled) {
          if (r.status === 'fulfilled') items.push(...r.value);
          else hadError = true;
        }

        if (items.length > 0) {
          setTaskIndex((prev) => [...prev, ...items]);
        }

        setTasksProgress((prev) => ({ done: Math.min(prev.done + chunk.length, prev.total), total: prev.total }));
      }

      if (taskLoadRunIdRef.current !== runId) return;
      setTasksLoadError(hadError);
      setTasksLoading(false);
    })().catch(() => {
      if (taskLoadRunIdRef.current !== runId) return;
      setTasksLoadError(true);
      setTasksLoading(false);
    });
  }, [teacher.workspaceId, situations, taskIndex.length]);

  const RECENT_KEYS = {
    students: 'avaliacion_recent_students',
    tasks: 'avaliacion_recent_tasks',
  } as const;

  const loadRecents = (key: string): string[] => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const pushRecent = (key: string, value: string) => {
    try {
      const existing = loadRecents(key);
      const next = [value, ...existing.filter((x) => x !== value)].slice(0, 8);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const norm = (value: string) => {
    try {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    } catch {
      return String(value || '').toLowerCase().trim();
    }
  };

  const normKey = (value: string) => {
    const n = norm(value);
    // Remove spaces/punctuation so 'tarefa2' matches 'Tarefa 2', etc.
    return n.replace(/[^a-z0-9]+/g, '');
  };

  const handleCreateClassroom = async (classroomData: Pick<Classroom, 'name' | 'grade'>) => {
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
      <Header teacher={teacher} onLogout={onLogout} showSearch={false} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Acceso rápido</p>
                <p className="text-xs text-gray-600">Ir directo a observación o a evaluar una tarea.</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="shrink-0 text-gray-500">
                <Search className="w-5 h-5" />
              </div>
              <input
                className="input-field"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder="Buscar estudiante o tarea…"
              />
            </div>

            <p className="mt-2 text-xs text-gray-600">
              Estudiantes: {students.length} · Situaciones: {situations.length} · Tareas indexadas: {taskIndex.length}
              {tasksLoading ? ` · Cargando tareas… (${tasksProgress.done}/${tasksProgress.total})` : ''}
              {tasksLoadError ? ' · (Algunas tareas no se pudieron cargar)' : ''}
            </p>

            {(() => {
              const allowed = new Set((teacher.classroomIds || []).filter(Boolean));
              const pool = allowed.size > 0 ? students.filter((s) => allowed.has(s.classroomId)) : students;
              const rawQuery = String(quickQuery || '');
              const hasUserQuery = rawQuery.trim().length > 0;
              const qKey = normKey(rawQuery);
              const qText = norm(rawQuery);

              const situationResults: LearningSituation[] = hasUserQuery
                ? situations
                    .filter((s) => {
                      const hayKey = normKey(`${s.title} ${s.description || ''}`);
                      const hayText = norm(`${s.title} ${s.description || ''}`);
                      return (qKey ? hayKey.includes(qKey) : false) || (qText ? hayText.includes(qText) : false);
                    })
                    .slice(0, 6)
                : [];

              const studentResults: Student[] = hasUserQuery
                ? pool
                    .filter((s) => {
                      const hayKey = normKey(`${s.lastName} ${s.firstName}`);
                      const hayText = norm(`${s.lastName} ${s.firstName}`);
                      return (qKey ? hayKey.includes(qKey) : false) || (qText ? hayText.includes(qText) : false);
                    })
                    .slice(0, 6)
                : [];

              const taskResults: Array<{ situation: LearningSituation; task: LearningTask }> = hasUserQuery
                ? taskIndex
                    .filter((x) => {
                      const tKey = normKey(x.task.title);
                      const sKey = normKey(x.situation.title);
                      const dKey = normKey(x.task.description || '');

                      const tText = norm(x.task.title);
                      const sText = norm(x.situation.title);
                      const dText = norm(x.task.description || '');

                      const keyMatch = qKey ? (tKey.includes(qKey) || sKey.includes(qKey) || dKey.includes(qKey)) : false;
                      const textMatch = qText ? (tText.includes(qText) || sText.includes(qText) || dText.includes(qText)) : false;
                      return keyMatch || textMatch;
                    })
                    .slice(0, 6)
                : [];

              // Keep the empty state clean: only show results when user types.
              const showStudents = hasUserQuery ? studentResults : [];
              const showTasks = hasUserQuery ? taskResults : [];

              const showSituations = hasUserQuery ? situationResults : [];

              // No output when query is empty (clean).

              if (hasUserQuery && tasksLoading && taskIndex.length === 0) {
                return <p className="mt-3 text-sm text-gray-600">Cargando tareas…</p>;
              }

              if (hasUserQuery && showStudents.length === 0 && showTasks.length === 0 && showSituations.length === 0) {
                return (
                  <p className="mt-3 text-sm text-gray-600">
                    No hay resultados.
                    {tasksLoadError ? ' (No se pudieron cargar algunas tareas.)' : ''}
                  </p>
                );
              }

              if (showStudents.length === 0 && showTasks.length === 0 && showSituations.length === 0) return null;

              return (
                <div className="mt-3 space-y-3">
                  {showSituations.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-600">Situaciones</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {showSituations.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="btn-secondary text-left"
                            onClick={() => {
                              navigate(`/learning-situations/${encodeURIComponent(s.id)}/evaluate`);
                            }}
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{s.title}</p>
                              {s.description ? <p className="text-xs text-gray-600 truncate">{s.description}</p> : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {showStudents.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-600">Estudiantes</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {showStudents.map((s) => {
                          const classroomName = classrooms.find((c) => c.id === s.classroomId)?.name || '';
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className="btn-secondary text-left"
                              onClick={() => {
                                pushRecent(RECENT_KEYS.students, s.id);
                                navigate(`/classroom/${encodeURIComponent(s.classroomId)}/student/${encodeURIComponent(s.id)}?focus=obs`);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-900 truncate">
                                  {s.listNumber ? `${s.listNumber}. ` : ''}{s.lastName} {s.firstName}
                                </span>
                                {classroomName ? <span className="text-xs text-gray-600 truncate">{classroomName}</span> : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {showTasks.length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-600">Tareas</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {showTasks.map((x) => {
                          const key = `${x.situation.id}:${x.task.id}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              className="btn-secondary text-left"
                              onClick={() => {
                                pushRecent(RECENT_KEYS.tasks, key);
                                navigate(`/learning-situations/${encodeURIComponent(x.situation.id)}/evaluate?taskId=${encodeURIComponent(x.task.id)}`);
                              }}
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{x.task.title}</p>
                                <p className="text-xs text-gray-600 truncate">{x.situation.title}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {tasksLoading && taskIndex.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-600">Cargando tareas…</p>
                      ) : null}

                      {tasksLoadError ? (
                        <p className="mt-2 text-xs text-gray-600">Nota: algunas tareas no se pudieron cargar (posible falta de permisos o datos antiguos).</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Mis Aulas</h1>
            <p className="text-gray-600 mt-2">Gestiona tus clases y estudiantes</p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => navigate('/learning-situations')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <BookOpen className="w-5 h-5" />
              Situaciones
            </button>
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
            onSubmit={handleCreateClassroom}
          />
        )}
      </main>
    </div>
  );
}
