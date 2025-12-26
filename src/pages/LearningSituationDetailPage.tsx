import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash2 } from 'lucide-react';
import type { Classroom, LearningSituation, LearningTask, LearningSituationType, Student, TaskCriteriaLink, Teacher } from '../types';
import { getCriteriosPuenteTerminal } from '../data/criteriosPuenteTerminal';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import { listenClassrooms } from '../utils/firestore/classrooms';
import { listenStudents } from '../utils/firestore/students';
import {
  getLearningSituationWithLegacyFallback,
  deleteLearningSituationCascade,
  upsertLearningSituation,
} from '../lib/firestore/services/learningSituationsService';
import { listenTasks, upsertTask, deleteTask } from '../lib/firestore/services/learningTasksService';

interface LearningSituationDetailPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

const TYPE_LABEL: Record<LearningSituationType, string> = {
  PROJECT: 'Proyecto',
  TASK: 'Tarea',
  CHALLENGE: 'Reto',
};

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function LearningSituationDetailPage({ teacher, onLogout }: LearningSituationDetailPageProps) {
  const { learningSituationId } = useParams<{ learningSituationId: string }>();
  const navigate = useNavigate();

  const workspaceId = teacher.workspaceId;

  const [situation, setSituation] = useState<LearningSituation | null>(null);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<
    Array<{ criteriaId: string; weight: number }>
  >([]);
  const [criterioSearchForTask, setCriterioSearchForTask] = useState('');
  const [selectedCriterioIdsForTask, setSelectedCriterioIdsForTask] = useState<Set<string>>(new Set());
  const [weightDraftByKey, setWeightDraftByKey] = useState<Record<string, string>>({});

  // --- Asociación de criterios de evaluación (criterios puente/terminal) ---
  const [criterioSearch, setCriterioSearch] = useState('');
  const [selectedCriterioIds, setSelectedCriterioIds] = useState<string[]>([]);

  const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const criterios = getCriteriosPuenteTerminal(criterioSearch);

  // Criterios for task modal (unfiltered)
  const allCriterios = useMemo(() => getCriteriosPuenteTerminal(), []);

  // Guardar criterios asociados a la situación (en el objeto situation, campo 'criterioIds')
  const saveCriteriosAsociados = async (ids: string[]) => {
    if (!workspaceId || !learningSituationId || !situation) return;
    try {
      await upsertLearningSituation(workspaceId, {
        ...situation,
        criterioIds: ids,
      });
      setSituation((prev) => prev ? { ...prev, criterioIds: ids } : prev);
    } catch {
      alert('No se pudo guardar la asociación de criterios.');
    }
  };

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
    if (!workspaceId || !learningSituationId) return;
    const unsubTasks = listenTasks(workspaceId, learningSituationId, setTasks);
    const unsubClassrooms = listenClassrooms(workspaceId, setClassrooms);
    const unsubStudents = listenStudents(workspaceId, setStudents);
    return () => {
      unsubTasks();
      unsubClassrooms();
      unsubStudents();
    };
  }, [workspaceId, learningSituationId]);

  // Inicializar selección desde la situación (si ya tiene criterios asociados)
  useEffect(() => {
    if (situation && Array.isArray((situation as any).criterioIds)) {
      setSelectedCriterioIds((situation as any).criterioIds);
    }
  }, [situation]);

  const breadcrumbItems = useMemo(() => {
    return [
      { label: 'Situaciones de Aprendizaje', path: '/learning-situations' },
      { label: situation?.title || 'Situación', path: `/learning-situations/${encodeURIComponent(learningSituationId || '')}` },
    ];
  }, [learningSituationId, situation?.title]);

  const openCreateTask = () => {
    setEditingTaskId('');
    setTaskTitle('');
    setTaskDescription('');
    setAssignedStudentIds([]);
    setAssignmentSearch('');
    setLinkDrafts([]);
    setCriterioSearchForTask('');
    setSelectedCriterioIdsForTask(new Set());
    setWeightDraftByKey({});
    setTaskModalOpen(true);
  };

  const openEditTask = (t: LearningTask) => {
    setEditingTaskId(t.id);
    setTaskTitle(t.title || '');
    setTaskDescription(t.description || '');
    setAssignedStudentIds(Array.isArray((t as any).assignedStudentIds) ? (t as any).assignedStudentIds : []);
    setAssignmentSearch('');
    const raw = Array.isArray(t.links) ? t.links : [];
    const linkDraftsFromTask: Array<{ criteriaId: string; weight: number }> = [];
    const selectedIds = new Set<string>();
    for (const l of raw) {
      const criteriaId = String((l as any)?.criteriaId ?? '').trim();
      if (!criteriaId) continue;
      const w = typeof (l as any)?.weight === 'number' ? (l as any).weight : Number((l as any)?.weight ?? 0);
      const weight = Number.isFinite(w) ? clampPct(w) : 0;
      linkDraftsFromTask.push({ criteriaId, weight });
      selectedIds.add(criteriaId);
    }
    setLinkDrafts(linkDraftsFromTask);
    setSelectedCriterioIdsForTask(selectedIds);
    const weightDrafts: Record<string, string> = {};
    for (const l of linkDraftsFromTask) {
      weightDrafts[l.criteriaId] = l.weight === 0 ? '' : String(Math.round(l.weight));
    }
    setWeightDraftByKey(weightDrafts);
    setCriterioSearchForTask('');
    setTaskModalOpen(true);
  };

  const upsertCriterioDraft = (criteriaId: string, weight: number) => {
    const critId = String(criteriaId || '').trim();
    if (!critId) return;

    setLinkDrafts((prev) => {
      const idx = prev.findIndex((x) => x.criteriaId === critId);
      if (idx === -1) {
        return [...prev, { criteriaId: critId, weight }];
      }
      return prev.map((x, i) => i === idx ? { ...x, weight } : x);
    });

    setWeightDraftByKey((prev) => ({ ...prev, [critId]: weight === 0 ? '' : String(Math.round(weight)) }));
  };

  const removeCriterio = (criteriaId: string) => {
    const critId = String(criteriaId || '').trim();
    setLinkDrafts((prev) => prev.filter((x) => x.criteriaId !== critId));
    setSelectedCriterioIdsForTask((prev) => {
      const newSet = new Set(prev);
      newSet.delete(critId);
      return newSet;
    });
    setWeightDraftByKey((prev) => {
      const newObj = { ...prev };
      delete newObj[critId];
      return newObj;
    });
  };

  const totalWeight = useMemo(() => {
    return linkDrafts.reduce((acc, l) => acc + (Number(l.weight) || 0), 0);
  }, [linkDrafts]);

  const filteredCriterios = useMemo(() => {
    // Only show criteria that are associated with the learning situation
    const situationCriteria = allCriterios.filter(c => selectedCriterioIds.includes(c.id));
    const q = (criterioSearchForTask || '').trim().toLowerCase();
    if (!q) return situationCriteria;
    return situationCriteria.filter((c) => {
      const hay = `${c.id} ${c.criterio} ${c.area}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allCriterios, criterioSearchForTask, selectedCriterioIds]);

  const eligibleStudents = useMemo(() => {
    const allowed = new Set((teacher.classroomIds || []).filter(Boolean));
    const filtered = allowed.size > 0 ? students.filter((s) => allowed.has(s.classroomId)) : students;
    const byClassroomName = new Map(classrooms.map((c) => [c.id, c.name] as const));
    return [...filtered].sort((a, b) => {
      const aCls = byClassroomName.get(a.classroomId) || '';
      const bCls = byClassroomName.get(b.classroomId) || '';
      if (aCls !== bCls) return aCls.localeCompare(bCls);
      if (a.listNumber !== b.listNumber) return a.listNumber - b.listNumber;
      const aName = `${a.lastName} ${a.firstName}`.trim();
      const bName = `${b.lastName} ${b.firstName}`.trim();
      return aName.localeCompare(bName);
    });
  }, [students, teacher.classroomIds, classrooms]);

  const studentsByClassroomId = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of eligibleStudents) {
      const arr = map.get(s.classroomId) || [];
      arr.push(s);
      map.set(s.classroomId, arr);
    }
    return map;
  }, [eligibleStudents]);

  const saveTask = async () => {
    if (!workspaceId || !learningSituationId) return;
    const title = taskTitle.trim();
    if (!title) {
      alert('El título de la tarea es requerido');
      return;
    }

    const normalizedLinks: TaskCriteriaLink[] = [];
    for (const d of linkDrafts) {
      const criteriaId = String(d.criteriaId || '').trim();
      if (!criteriaId) continue;
      const w = typeof d.weight === 'number' ? d.weight : Number(d.weight || 0);
      normalizedLinks.push({ criteriaId, weight: Number.isFinite(w) ? clampPct(w) : 0 });
    }

    const id = editingTaskId || newId('task');
    try {
      await upsertTask(workspaceId, {
        id,
        learningSituationId,
        title,
        description: taskDescription.trim(),
        links: normalizedLinks,
        assignedStudentIds,
      });
      setTaskModalOpen(false);
    } catch {
      alert('No se pudo guardar la tarea.');
    }
  };

  const saveSituationMeta = async (patch: Partial<Pick<LearningSituation, 'title' | 'description' | 'type' | 'relatedCompetencyIds'>>) => {
    if (!workspaceId || !learningSituationId || !situation) return;
    try {
      await upsertLearningSituation(workspaceId, {
        id: learningSituationId,
        title: patch.title ?? situation.title,
        description: patch.description ?? situation.description,
        type: patch.type ?? situation.type,
        relatedCompetencyIds: patch.relatedCompetencyIds ?? situation.relatedCompetencyIds,
      });
    } catch {
      alert('No se pudo guardar la situación.');
    }
  };

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header teacher={teacher} onLogout={onLogout} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <p className="text-center text-gray-600">Necesitas iniciar sesión.</p>
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
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/learning-situations')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Volver
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{situation?.title || 'Situación'}</h1>
              <p className="text-gray-600 mt-1">Define tareas y pesos hacia competencias y descriptores operativos (DO).</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/learning-situations/${encodeURIComponent(learningSituationId || '')}/evaluate`)}
            >
              Evaluar
            </button>
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={() => {
                if (!workspaceId || !learningSituationId) return;
                const title = situation?.title || '';
                const ok = window.confirm(
                  `¿Eliminar la situación${title ? ` "${title}"` : ''}? Se borrarán también sus tareas y evaluaciones.`
                );
                if (!ok) return;
                deleteLearningSituationCascade(workspaceId, learningSituationId)
                  .then(() => navigate('/learning-situations'))
                  .catch(() => alert('No se pudo eliminar la situación.'));
              }}
              title="Eliminar situación"
            >
              <Trash2 className="w-5 h-5" />
              <span className="hidden sm:inline">Eliminar</span>
            </button>
            <button type="button" className="btn-primary flex items-center gap-2" onClick={openCreateTask}>
              <Plus className="w-5 h-5" />
              Nueva Tarea
            </button>
          </div>
        </div>

        {!situation ? (
          <div className="card">
            <p className="text-sm text-gray-700">Situación no encontrada.</p>
          </div>
        ) : (
          <>
            <div className="card mb-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-2">Criterios de evaluación asociados</h2>
                <div className="flex flex-col md:flex-row md:items-end gap-2 mb-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Buscar criterio</label>
                    <input
                      className="input-field"
                      value={criterioSearch}
                      onChange={e => setCriterioSearch(e.target.value)}
                      placeholder="Palabra clave, código, área…"
                    />
                  </div>
                  <button
                    className="btn-secondary h-10"
                    onClick={() => setCriterioSearch('')}
                    type="button"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg p-2 bg-white">
                  {criterios.length === 0 ? (
                    <p className="text-sm text-gray-600">No hay criterios que coincidan.</p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left font-semibold">Curso</th>
                          <th className="text-left font-semibold">Área</th>
                          <th className="text-left font-semibold">Código</th>
                          <th className="text-left font-semibold">Criterio</th>
                          <th className="text-left font-semibold">DO</th>
                          <th className="text-left font-semibold">Tipo</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {criterios.map(c => {
                          const checked = selectedCriterioIds.includes(c.id);
                          return (
                            <tr key={c.id} className={checked ? 'bg-blue-50' : ''}>
                              <td>{c.cursos.join(', ')}</td>
                              <td>{c.area}</td>
                              <td>{c.id}</td>
                              <td>{c.criterio}</td>
                              <td>{c.descriptores.join(', ')}</td>
                              <td>{c.tipo === 'puente' ? 'Puente' : 'Terminal'}</td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    let next = checked
                                      ? selectedCriterioIds.filter(id => id !== c.id)
                                      : [...selectedCriterioIds, c.id];
                                    setSelectedCriterioIds(next);
                                    saveCriteriosAsociados(next);
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  <b>Puente</b>: criterio presente en 5º y 6º (el dato de 6º sobrescribe el de 5º). <b>Terminal</b>: criterio exclusivo de un curso.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
                  <input
                    className="input-field"
                    defaultValue={situation.title}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== situation.title) {
                        setSituation((prev) => (prev ? { ...prev, title: next } : prev));
                        saveSituationMeta({ title: next });
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo (etiqueta)</label>
                  <select
                    className="input-field"
                    value={situation.type}
                    onChange={(e) => {
                      const next = e.target.value as LearningSituationType;
                      setSituation((prev) => (prev ? { ...prev, type: next } : prev));
                      saveSituationMeta({ type: next });
                    }}
                  >
                    <option value="TASK">Tarea</option>
                    <option value="PROJECT">Proyecto</option>
                    <option value="CHALLENGE">Reto</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{TYPE_LABEL[situation.type]} · Por ahora no cambia el flujo de evaluación.</p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                <textarea
                  className="input-field"
                  rows={3}
                  defaultValue={situation.description}
                  onBlur={(e) => {
                    const next = e.target.value;
                    if (next !== situation.description) {
                      setSituation((prev) => (prev ? { ...prev, description: next } : prev));
                      saveSituationMeta({ description: next });
                    }
                  }}
                />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Tareas</h2>
                  <p className="text-sm text-gray-600">Cada tarea aporta a competencias y descriptores operativos (DO) con un porcentaje manual.</p>
                </div>
              </div>

              {tasks.length === 0 ? (
                <p className="text-sm text-gray-600 mt-4">Aún no hay tareas.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {tasks.map((t) => (
                    <div key={t.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="text-left min-w-0" onClick={() => openEditTask(t)}>
                          <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                          {t.description ? <p className="text-xs text-gray-600 mt-1">{t.description}</p> : null}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => navigate(`/learning-situations/${encodeURIComponent(learningSituationId || '')}/evaluate?taskId=${encodeURIComponent(t.id)}`)}
                            title="Evaluar esta tarea"
                          >
                            Evaluar
                          </button>
                          <button
                            type="button"
                            className="btn-secondary flex items-center gap-2"
                            onClick={() => {
                              if (!workspaceId || !learningSituationId) return;
                              const ok = window.confirm(`¿Eliminar la tarea "${t.title}"?`);
                              if (!ok) return;
                              deleteTask(workspaceId, learningSituationId, t.id).catch(() => {
                                alert('No se pudo eliminar la tarea.');
                              });
                            }}
                            title="Eliminar tarea"
                          >
                            <Trash2 className="w-5 h-5" />
                            <span className="hidden sm:inline">Eliminar</span>
                          </button>
                        </div>
                      </div>

                      {t.links.length > 0 ? (
                        <div className="mt-3 text-xs text-gray-700">
                          <p className="font-semibold">Ponderación</p>
                          <ul className="mt-1 space-y-1">
                            {t.links.map((l, idx) => {
                              const crit = criterios.find(c => c.id === (l as any).criteriaId);
                              return (
                                <li key={idx}>
                                  {crit ? `${crit.id}: ${crit.criterio}` : (l as any).criteriaId}
                                  {` — ${Number(l.weight || 0).toFixed(0)}%`}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 mt-3">Sin criterios vinculados todavía.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {taskModalOpen ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 my-6 max-h-[calc(100vh-3rem)] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">{editingTaskId ? 'Editar tarea' : 'Nueva tarea'}</h2>
              <button
                onClick={() => setTaskModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
                <input className="input-field" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                <textarea className="input-field" rows={3} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} />
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900">Asignación</p>
                <p className="text-xs text-gray-600 mt-1">
                  Si no seleccionas a nadie, la tarea cuenta para todos los estudiantes disponibles.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={assignedStudentIds.length === 0 ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setAssignedStudentIds([])}
                    title="Aplicar a todos"
                  >
                    Todos
                  </button>
                  {Array.from(studentsByClassroomId.keys())
                    .map((cid) => {
                      const name = classrooms.find((c) => c.id === cid)?.name || cid;
                      const count = studentsByClassroomId.get(cid)?.length || 0;
                      return { cid, name, count };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(({ cid, name, count }) => {
                      const group = studentsByClassroomId.get(cid) || [];
                      const ids = group.map((s) => s.id);
                      const selectedCount = ids.filter((id) => assignedStudentIds.includes(id)).length;
                      const isAllSelected = assignedStudentIds.length > 0 && selectedCount === ids.length;
                      return (
                        <button
                          key={cid}
                          type="button"
                          className={isAllSelected ? 'btn-primary' : 'btn-secondary'}
                          onClick={() => {
                            if (ids.length === 0) return;
                            setAssignedStudentIds((prev) => {
                              const set = new Set(prev);
                              const hasAll = ids.every((id) => set.has(id));
                              // If none selected yet, selecting a class starts subset mode.
                              if (prev.length === 0) {
                                return ids;
                              }
                              if (hasAll) {
                                for (const id of ids) set.delete(id);
                              } else {
                                // Add missing
                                for (const id of ids) set.add(id);
                              }
                              return Array.from(set);
                            });
                          }}
                          title={name}
                        >
                          {name} ({count})
                        </button>
                      );
                    })}
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Buscar estudiante</label>
                  <input
                    className="input-field"
                    value={assignmentSearch}
                    onChange={(e) => setAssignmentSearch(e.target.value)}
                    placeholder="Apellido, nombre…"
                  />
                </div>

                <div className="mt-3">
                  <p className="text-xs text-gray-600">
                    {assignedStudentIds.length === 0
                      ? 'Modo: todos los estudiantes.'
                      : `Seleccionados: ${assignedStudentIds.length} estudiante(s).`}
                  </p>

                  {eligibleStudents.length === 0 ? (
                    <p className="text-sm text-gray-600 mt-2">No hay estudiantes disponibles.</p>
                  ) : (
                    <div className="mt-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2">
                      {eligibleStudents
                        .filter((s) => {
                          const q = assignmentSearch.trim().toLowerCase();
                          if (!q) return true;
                          return `${s.lastName} ${s.firstName}`.toLowerCase().includes(q);
                        })
                        .slice(0, 200)
                        .map((s) => {
                          const cls = classrooms.find((c) => c.id === s.classroomId)?.name || '';
                          const checked = assignedStudentIds.includes(s.id);
                          return (
                            <label key={s.id} className="flex items-center gap-2 py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAssignedStudentIds((prev) => {
                                    // Selecting any student puts us into subset mode.
                                    const set = new Set(prev.length === 0 ? [] : prev);
                                    if (prev.length === 0) {
                                      set.add(s.id);
                                      return Array.from(set);
                                    }
                                    if (set.has(s.id)) set.delete(s.id);
                                    else set.add(s.id);
                                    return Array.from(set);
                                  });
                                }}
                              />
                              <span className="text-sm text-gray-900">
                                {s.listNumber ? `${s.listNumber}. ` : ''}{s.lastName} {s.firstName}
                              </span>
                              {cls ? <span className="text-xs text-gray-600">· {cls}</span> : null}
                            </label>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Criterios de evaluación y pesos</p>
                    <p className="text-xs text-gray-600">Selecciona criterios asociados a esta situación y asigna un % a cada uno.</p>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Buscar criterio</label>
                  <input
                    className="input-field"
                    value={criterioSearchForTask}
                    onChange={(e) => setCriterioSearchForTask(e.target.value)}
                    placeholder="Escribe ID o descripción…"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    {filteredCriterios.slice(0, 24).map((c) => {
                      const selected = selectedCriterioIdsForTask.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={selected ? 'btn-primary' : 'btn-secondary'}
                          onClick={() => {
                            if (selected) removeCriterio(c.id);
                            else upsertCriterioDraft(c.id, 0);
                          }}
                          title={c.criterio}
                        >
                          {c.id}
                        </button>
                      );
                    })}
                  </div>

                  {filteredCriterios.length === 0 ? (
                    <p className="text-sm text-amber-600 mt-3">
                      No hay criterios asociados a esta situación. Primero asocia criterios a la situación desde la sección superior.
                    </p>
                  ) : null}

                  {linkDrafts.length === 0 ? (
                    <p className="text-sm text-gray-600 mt-3">Selecciona uno o más criterios.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {linkDrafts.map((l) => {
                        const crit = allCriterios.find(c => c.id === l.criteriaId);
                        return (
                          <div key={l.criteriaId} className="border border-gray-200 rounded-lg p-3 bg-white">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">
                                  {crit ? `${crit.id}: ${crit.criterio}` : l.criteriaId}
                                </p>
                                {crit ? (
                                  <p className="text-xs text-gray-600 mt-0.5">DO: {crit.descriptores.join(', ')}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="text-sm text-gray-600 hover:text-gray-900 underline"
                                onClick={() => removeCriterio(l.criteriaId)}
                              >
                                Quitar
                              </button>
                            </div>

                            <div className="mt-3">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Peso (%)</label>
                              <input
                                className="input-field"
                                type="text"
                                inputMode="numeric"
                                value={weightDraftByKey[l.criteriaId] ?? (l.weight === 0 ? '' : String(Math.round(l.weight)))}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    setWeightDraftByKey((prev) => ({ ...prev, [l.criteriaId]: '' }));
                                    upsertCriterioDraft(l.criteriaId, 0);
                                    return;
                                  }
                                  const digits = raw.replace(/[^0-9]/g, '');
                                  setWeightDraftByKey((prev) => ({ ...prev, [l.criteriaId]: digits }));
                                  const n = Number(digits);
                                  if (!Number.isFinite(n)) return;
                                  upsertCriterioDraft(l.criteriaId, n);
                                }}
                                onBlur={() => {
                                  const raw = (weightDraftByKey[l.criteriaId] ?? '').trim();
                                  if (raw === '') return;
                                  const n = Number(raw);
                                  if (!Number.isFinite(n)) return;
                                  const clamped = clampPct(n);
                                  setWeightDraftByKey((prev) => ({ ...prev, [l.criteriaId]: String(clamped) }));
                                  upsertCriterioDraft(l.criteriaId, clamped);
                                }}
                                placeholder="%"
                              />
                            </div>
                          </div>
                        );
                      })}

                      <p className={`text-xs ${totalWeight > 100 ? 'text-red-700' : 'text-gray-600'}`}>
                        Total pesos (tarea): {totalWeight.toFixed(0)}%
                        {totalWeight > 100 ? ' (revisa: supera 100%)' : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 bg-white pt-2">
                <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => setTaskModalOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary flex-1" onClick={saveTask}>
                  Guardar
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
