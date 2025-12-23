import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, NotebookPen, X } from 'lucide-react';
import type { Competencia, GradeKey, LearningSituation, LearningTask, TaskEvaluation, Student, Teacher } from '../types';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import { listenStudents } from '../utils/firestore/students';
import { listenCompetencias } from '../utils/firestore/competencias';
import { getLearningSituationWithLegacyFallback } from '../lib/firestore/services/learningSituationsService';
import { listenTasks } from '../lib/firestore/services/learningTasksService';
import { listenTaskEvaluationsForTask, upsertTaskEvaluation } from '../lib/firestore/services/taskEvaluationsService';
import { GRADE_COLOR_CLASS, GRADE_KEYS, GRADE_LABEL_ES } from '../utils/triangulation/gradeScale';

interface QuickEvaluationPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

type ToastState = { message: string; visible: boolean };

export default function QuickEvaluationPage({ teacher, onLogout }: QuickEvaluationPageProps) {
  const { learningSituationId } = useParams<{ learningSituationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const focusStudentId = useMemo(() => {
    try {
      const qp = new URLSearchParams(location.search);
      return (qp.get('studentId') || '').trim();
    } catch {
      return '';
    }
  }, [location.search]);

  const didAutoScrollStudentRef = useRef(false);

  const [situation, setSituation] = useState<LearningSituation | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [evaluations, setEvaluations] = useState<TaskEvaluation[]>([]);
  const [savingStudentId, setSavingStudentId] = useState<string>('');

  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const toastTimer = useRef<number | null>(null);

  const [obsOpen, setObsOpen] = useState(false);
  const [obsStudentId, setObsStudentId] = useState<string>('');
  const [obsDraft, setObsDraft] = useState<string>('');

  const workspaceId = teacher.workspaceId;

  useEffect(() => {
    if (!workspaceId || !learningSituationId) return;

    let cancelled = false;
    getLearningSituationWithLegacyFallback(workspaceId, learningSituationId)
      .then((s) => {
        if (cancelled) return;
        setSituation(s);
      })
      .catch(() => {
        if (cancelled) return;
        setSituation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, learningSituationId]);

  useEffect(() => {
    if (!workspaceId) return;
    const unsubStudents = listenStudents(workspaceId, setStudents);
    const unsubComps = listenCompetencias(workspaceId, setCompetencias);
    return () => {
      unsubStudents();
      unsubComps();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !learningSituationId) return;
    const unsub = listenTasks(workspaceId, learningSituationId, (items) => {
      setTasks(items);
      setSelectedTaskId((prev) => {
        const qp = new URLSearchParams(location.search);
        const preferred = (qp.get('taskId') || '').trim();
        if (preferred && items.some((t) => t.id === preferred)) return preferred;
        if (prev && items.some((t) => t.id === prev)) return prev;
        return items[0]?.id || '';
      });
    });
    return () => unsub();
  }, [workspaceId, learningSituationId, location.search]);

  useEffect(() => {
    if (!workspaceId || !selectedTaskId) {
      setEvaluations([]);
      return;
    }
    const unsub = listenTaskEvaluationsForTask(workspaceId, selectedTaskId, setEvaluations);
    return () => unsub();
  }, [workspaceId, selectedTaskId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const evaluationsByStudentId = useMemo(() => {
    const map = new Map<string, TaskEvaluation>();
    for (const e of evaluations) map.set(e.studentId, e);
    return map;
  }, [evaluations]);

  const competenciasById = useMemo(() => {
    const map = new Map<string, Competencia>();
    for (const c of competencias) map.set(c.id, c);
    return map;
  }, [competencias]);

  const assignedStudentSet = useMemo(() => {
    const t = tasks.find((x) => x.id === selectedTaskId);
    const ids = Array.isArray((t as any)?.assignedStudentIds) ? (t as any).assignedStudentIds : [];
    return new Set(ids.map(String).filter(Boolean));
  }, [tasks, selectedTaskId]);

  const eligibleStudents = useMemo(() => {
    const allowed = new Set((teacher.classroomIds || []).filter(Boolean));
    const filtered = allowed.size > 0 ? students.filter((s) => allowed.has(s.classroomId)) : students;

    const filteredByAssignment = assignedStudentSet.size > 0
      ? filtered.filter((s) => assignedStudentSet.has(s.id))
      : filtered;

    return [...filteredByAssignment].sort((a, b) => {
      if (a.classroomId !== b.classroomId) return a.classroomId.localeCompare(b.classroomId);
      if (a.listNumber !== b.listNumber) return a.listNumber - b.listNumber;
      const aName = `${a.lastName} ${a.firstName}`.trim();
      const bName = `${b.lastName} ${b.firstName}`.trim();
      return aName.localeCompare(bName);
    });
  }, [students, teacher.classroomIds, assignedStudentSet]);

  useEffect(() => {
    if (!focusStudentId) {
      didAutoScrollStudentRef.current = false;
      return;
    }
    if (didAutoScrollStudentRef.current) return;
    if (!eligibleStudents.some((s) => s.id === focusStudentId)) return;
    didAutoScrollStudentRef.current = true;

    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-student-row="${CSS.escape(focusStudentId)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }, [focusStudentId, eligibleStudents]);

  const breadcrumbItems = useMemo(() => {
    return [
      { label: 'Situaciones de Aprendizaje', path: '/learning-situations' },
      { label: situation?.title || 'Evaluación rápida', path: `/learning-situations/${encodeURIComponent(learningSituationId || '')}/evaluate` },
    ];
  }, [learningSituationId, situation?.title]);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  const showToast = (message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = window.setTimeout(() => {
      setToast({ message: '', visible: false });
    }, 2200);
  };

  const competencyLabel = (id: string) => {
    const c = competenciasById.get(id);
    if (!c) return id;
    return `${c.code}`;
  };

  const relatedCompetencySummary = (ids: string[]) => {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (uniq.length === 0) return '';
    return uniq.map(competencyLabel).join(', ');
  };

  const handleSaveRating = async (studentId: string, rating: GradeKey) => {
    if (!workspaceId || !learningSituationId || !selectedTaskId) return;
    setSavingStudentId(studentId);
    try {
      const res = await upsertTaskEvaluation({
        workspaceId,
        studentId,
        learningSituationId,
        taskId: selectedTaskId,
        rating,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
      });
      const compIds = Array.from(new Set((res.links || []).map((l) => l.competenciaId).filter(Boolean)));
      const comps = relatedCompetencySummary(compIds);
      showToast(comps ? `Evaluación guardada. Alimenta: ${comps}` : 'Evaluación guardada.');
    } catch {
      alert('No se pudo guardar la evaluación.');
    } finally {
      setSavingStudentId('');
    }
  };

  const openObservation = (studentId: string) => {
    const existing = evaluationsByStudentId.get(studentId);
    if (!existing?.rating) {
      alert('Selecciona un nivel antes de añadir una observación.');
      return;
    }
    setObsStudentId(studentId);
    setObsDraft(existing?.observation || '');
    setObsOpen(true);
  };

  const saveObservation = async () => {
    if (!workspaceId || !learningSituationId || !selectedTaskId || !obsStudentId) return;
    const existing = evaluationsByStudentId.get(obsStudentId);
    const rating = existing?.rating;
    if (!rating) {
      alert('Selecciona un nivel antes de guardar.');
      return;
    }

    setSavingStudentId(obsStudentId);
    try {
      const res = await upsertTaskEvaluation({
        workspaceId,
        studentId: obsStudentId,
        learningSituationId,
        taskId: selectedTaskId,
        rating,
        observation: obsDraft,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
      });
      const compIds = Array.from(new Set((res.links || []).map((l) => l.competenciaId).filter(Boolean)));
      const comps = relatedCompetencySummary(compIds);
      showToast(comps ? `Observación guardada. Alimenta: ${comps}` : 'Observación guardada.');
      setObsOpen(false);
      setObsStudentId('');
      setObsDraft('');
    } catch {
      alert('No se pudo guardar la observación.');
    } finally {
      setSavingStudentId('');
    }
  };

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header teacher={teacher} onLogout={onLogout} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <p className="text-center text-gray-600">Necesitas iniciar sesión para evaluar.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Breadcrumbs items={breadcrumbItems} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/learning-situations')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Volver a Situaciones
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                {situation?.title || 'Evaluación rápida'}
              </h1>
              {situation?.description ? (
                <p className="text-gray-600 mt-1 line-clamp-2">{situation.description}</p>
              ) : (
                <p className="text-gray-600 mt-1">Evalúa con 4 niveles y guarda (opcional) una observación.</p>
              )}
            </div>
          </div>
        </div>

        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tarea</label>
              <select
                className="input-field"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                disabled={tasks.length === 0}
              >
                {tasks.length === 0 ? <option value="">No hay tareas</option> : null}
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              {selectedTask?.links?.length ? (
                <p className="text-xs text-gray-600 mt-2">
                  Alimenta: {relatedCompetencySummary(Array.from(new Set(selectedTask.links.map((l) => l.competenciaId))))}
                </p>
              ) : (
                <p className="text-xs text-gray-600 mt-2">Define vínculos de competencias en la tarea para alimentar el cálculo.</p>
              )}

              {assignedStudentSet.size > 0 ? (
                <p className="text-xs text-gray-600 mt-1">Asignada a {assignedStudentSet.size} estudiante(s).</p>
              ) : null}
            </div>
            <div>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => navigate(`/learning-situations/${encodeURIComponent(learningSituationId || '')}`)}
              >
                Editar tareas
              </button>
            </div>
          </div>
        </div>

        {!situation ? (
          <div className="card">
            <p className="text-sm text-gray-700">Situación no encontrada.</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="card">
            <p className="text-sm text-gray-700">Crea al menos una tarea para evaluar.</p>
          </div>
        ) : eligibleStudents.length === 0 ? (
          <div className="card">
            <p className="text-sm text-gray-700">No hay estudiantes disponibles.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {eligibleStudents.map((s) => {
              const ev = evaluationsByStudentId.get(s.id);
              const active = ev?.rating || null;
              const disabled = savingStudentId === s.id;
              return (
                <div key={s.id} data-student-row={s.id} className="card p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {s.listNumber ? `${s.listNumber}. ` : ''}{s.lastName} {s.firstName}
                      </p>
                      {ev?.observation ? (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">“{ev.observation}”</p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">Sin observación</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {GRADE_KEYS.map((k) => {
                          const isActive = active === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              disabled={disabled}
                              onClick={() => handleSaveRating(s.id, k)}
                              className={
                                `w-10 h-10 rounded-full border flex items-center justify-center ` +
                                (isActive ? 'border-gray-900' : 'border-gray-200') +
                                (disabled ? ' opacity-60 cursor-not-allowed' : ' hover:border-gray-400')
                              }
                              title={GRADE_LABEL_ES[k]}
                              aria-label={GRADE_LABEL_ES[k]}
                            >
                              <span className={`w-7 h-7 rounded-full ${GRADE_COLOR_CLASS[k]}`} />
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className="btn-secondary flex items-center justify-center gap-2"
                        disabled={disabled}
                        onClick={() => openObservation(s.id)}
                        title="Añadir observación"
                      >
                        <NotebookPen className="w-5 h-5" />
                        <span className="hidden sm:inline">Observación</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {toast.visible ? (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm shadow-md">
            {toast.message}
          </div>
        </div>
      ) : null}

      {obsOpen ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Observación</h2>
              <button
                onClick={() => {
                  setObsOpen(false);
                  setObsStudentId('');
                  setObsDraft('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <textarea
              className="input-field min-h-32"
              value={obsDraft}
              onChange={(e) => setObsDraft(e.target.value)}
              placeholder="Escribe una observación breve (opcional)"
            />

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setObsOpen(false);
                  setObsStudentId('');
                  setObsDraft('');
                }}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveObservation}
                className="btn-primary flex-1"
                disabled={savingStudentId === obsStudentId}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
