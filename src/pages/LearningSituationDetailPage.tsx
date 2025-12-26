import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash2 } from 'lucide-react';
import type { AudienceLevel, Classroom, Competencia, LearningSituation, LearningTask, LearningSituationType, Student, SubCompetencia, TaskCompetencyLink, Teacher } from '../types';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import { listenCompetencias } from '../utils/firestore/competencias';
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
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAudienceLevels, setTaskAudienceLevels] = useState<AudienceLevel[]>([5, 6]);
  const [achievementText5, setAchievementText5] = useState('');
  const [achievementText6, setAchievementText6] = useState('');
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<
    Array<{ competenciaId: string; weightAll: number; subWeights: Record<string, number> }>
  >([]);
  const [competenciaSearch, setCompetenciaSearch] = useState('');
  const [weightDraftByKey, setWeightDraftByKey] = useState<Record<string, string>>({});
  const [subPickerOpenByCompId, setSubPickerOpenByCompId] = useState<Record<string, boolean>>({});

  const weightKey = (competenciaId: string, subCompetenciaId?: string) => {
    const c = String(competenciaId || '').trim();
    const s = String(subCompetenciaId || '').trim();
    return `${c}__${s || 'ALL'}`;
  };

  const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const briefSubNote = (s: SubCompetencia) => {
    const raw = String(s.description || s.name || '').trim();
    if (!raw) return '';
    const oneLine = raw.replace(/\s+/g, ' ');
    return oneLine.length > 140 ? oneLine.slice(0, 140).trimEnd() + '…' : oneLine;
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
    const unsubComps = listenCompetencias(workspaceId, setCompetencias);
    const unsubClassrooms = listenClassrooms(workspaceId, setClassrooms);
    const unsubStudents = listenStudents(workspaceId, setStudents);
    return () => {
      unsubTasks();
      unsubComps();
      unsubClassrooms();
      unsubStudents();
    };
  }, [workspaceId, learningSituationId]);

  const competenciasById = useMemo(() => {
    const map = new Map<string, Competencia>();
    for (const c of competencias) map.set(c.id, c);
    return map;
  }, [competencias]);

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
    setTaskAudienceLevels([5, 6]);
    setAchievementText5('');
    setAchievementText6('');
    setAssignedStudentIds([]);
    setAssignmentSearch('');
    setLinkDrafts([]);
    setCompetenciaSearch('');
    setWeightDraftByKey({});
    setSubPickerOpenByCompId({});
    setTaskModalOpen(true);
  };

  const openEditTask = (t: LearningTask) => {
    setEditingTaskId(t.id);
    setTaskTitle(t.title || '');
    setTaskDescription(t.description || '');
    const rawAudience = Array.isArray((t as any).audienceLevels) ? (t as any).audienceLevels : [];
    const levels = rawAudience
      .map((x: any) => Number(x))
      .filter((n: any) => n === 5 || n === 6) as AudienceLevel[];
    const uniq = Array.from(new Set(levels));
    setTaskAudienceLevels(uniq.length === 1 ? uniq : [5, 6]);
    const ach = (t as any).achievementTextByLevel;
    setAchievementText5(typeof ach?.[5] === 'string' ? String(ach[5]) : '');
    setAchievementText6(typeof ach?.[6] === 'string' ? String(ach[6]) : '');
    setAssignedStudentIds(Array.isArray((t as any).assignedStudentIds) ? (t as any).assignedStudentIds : []);
    setAssignmentSearch('');
    const raw = Array.isArray(t.links) ? t.links : [];
    const byComp = new Map<
      string,
      { weightAll: number; subWeights: Record<string, number>; hasAll: boolean; hasAnySub: boolean }
    >();
    for (const l of raw) {
      const compId = String((l as any)?.competenciaId ?? '').trim();
      if (!compId) continue;
      const subId = String((l as any)?.subCompetenciaId ?? '').trim();
      const w = typeof (l as any)?.weight === 'number' ? (l as any).weight : Number((l as any)?.weight ?? 0);
      const weight = Number.isFinite(w) ? Math.max(0, Math.min(100, w)) : 0;
      const entry =
        byComp.get(compId) || { weightAll: 0, subWeights: {} as Record<string, number>, hasAll: false, hasAnySub: false };
      if (subId) {
        entry.hasAnySub = true;
        entry.subWeights[subId] = clampPct((entry.subWeights[subId] ?? 0) + weight);
      } else {
        entry.hasAll = true;
        entry.weightAll = clampPct(entry.weightAll + weight);
      }
      byComp.set(compId, entry);
    }

    const nextLinkDrafts = Array.from(byComp.entries()).map(([competenciaId, v]) => {
      // If there are subcompetency links, treat it as per-sub mode.
      const subWeights = v.hasAnySub ? v.subWeights : {};
      const weightAll = v.hasAnySub ? 0 : v.weightAll;
      return { competenciaId, weightAll, subWeights };
    });

    setLinkDrafts(nextLinkDrafts);
    const weightDrafts: Record<string, string> = {};
    for (const l of nextLinkDrafts) {
      if (Object.keys(l.subWeights || {}).length > 0) {
        for (const [subId, w] of Object.entries(l.subWeights)) {
          const ww = typeof w === 'number' && Number.isFinite(w) ? w : 0;
          weightDrafts[weightKey(l.competenciaId, subId)] = ww === 0 ? '' : String(Math.round(ww));
        }
      } else {
        const w = typeof l.weightAll === 'number' && Number.isFinite(l.weightAll) ? l.weightAll : 0;
        weightDrafts[weightKey(l.competenciaId)] = w === 0 ? '' : String(Math.round(w));
      }
    }
    setWeightDraftByKey(weightDrafts);
    setSubPickerOpenByCompId({});
    setCompetenciaSearch('');
    setTaskModalOpen(true);
  };

  const upsertCompetenciaDraft = (
    competenciaId: string,
    patch: Partial<{ weightAll: number; subWeights: Record<string, number> }>
  ) => {
    const compId = String(competenciaId || '').trim();
    if (!compId) return;

    setLinkDrafts((prev) => {
      const idx = prev.findIndex((x) => x.competenciaId === compId);
      if (idx === -1) {
        return [
          ...prev,
          {
            competenciaId: compId,
            weightAll: typeof patch.weightAll === 'number' ? patch.weightAll : 0,
            subWeights: patch.subWeights && typeof patch.subWeights === 'object' ? patch.subWeights : {},
          },
        ];
      }
      return prev.map((x, i) => {
        if (i !== idx) return x;
        return {
          ...x,
          ...(typeof patch.weightAll === 'number' ? { weightAll: patch.weightAll } : null),
          ...(patch.subWeights && typeof patch.subWeights === 'object' ? { subWeights: patch.subWeights } : null),
        };
      });
    });

    // Ensure a draft exists (at least for ALL).
    setWeightDraftByKey((prev) => (Object.prototype.hasOwnProperty.call(prev, weightKey(compId)) ? prev : { ...prev, [weightKey(compId)]: '' }));
  };

  const upsertSubWeight = (competenciaId: string, subCompetenciaId: string, weight: number) => {
    const compId = String(competenciaId || '').trim();
    const subId = String(subCompetenciaId || '').trim();
    if (!compId || !subId) return;
    setLinkDrafts((prev) => {
      const idx = prev.findIndex((x) => x.competenciaId === compId);
      const current = idx === -1 ? { competenciaId: compId, weightAll: 0, subWeights: {} as Record<string, number> } : prev[idx];
      const nextSubWeights = { ...(current.subWeights || {}) };
      nextSubWeights[subId] = clampPct(weight);
      const nextItem = { ...current, weightAll: 0, subWeights: nextSubWeights };
      if (idx === -1) return [...prev, nextItem];
      return prev.map((x, i) => (i === idx ? nextItem : x));
    });
  };

  const toggleSub = (competenciaId: string, subCompetenciaId: string) => {
    const compId = String(competenciaId || '').trim();
    const subId = String(subCompetenciaId || '').trim();
    if (!compId || !subId) return;
    setLinkDrafts((prev) => {
      const idx = prev.findIndex((x) => x.competenciaId === compId);
      const current = idx === -1 ? { competenciaId: compId, weightAll: 0, subWeights: {} as Record<string, number> } : prev[idx];
      const nextSubWeights = { ...(current.subWeights || {}) };
      if (Object.prototype.hasOwnProperty.call(nextSubWeights, subId)) delete nextSubWeights[subId];
      else nextSubWeights[subId] = 0;
      const nextItem = {
        ...current,
        // If any sub is selected, switch to per-sub mode.
        weightAll: Object.keys(nextSubWeights).length > 0 ? 0 : current.weightAll,
        subWeights: nextSubWeights,
      };
      if (idx === -1) return [...prev, nextItem];
      return prev.map((x, i) => (i === idx ? nextItem : x));
    });
    const k = weightKey(compId, subId);
    setWeightDraftByKey((prev) => (Object.prototype.hasOwnProperty.call(prev, k) ? prev : { ...prev, [k]: '' }));
  };

  const clearSubs = (competenciaId: string) => {
    const compId = String(competenciaId || '').trim();
    if (!compId) return;
    setLinkDrafts((prev) => prev.map((x) => (x.competenciaId === compId ? { ...x, subWeights: {} } : x)));
  };

  const removeCompetencia = (competenciaId: string) => {
    const compId = String(competenciaId || '').trim();
    if (!compId) return;
    setLinkDrafts((prev) => prev.filter((x) => x.competenciaId !== compId));
    setWeightDraftByKey((prev) => {
      const next = { ...prev };
      // Remove ALL + any sub keys
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${compId}__`)) delete next[k];
      }
      return next;
    });
    setSubPickerOpenByCompId((prev) => {
      const next = { ...prev };
      delete next[compId];
      return next;
    });
  };

  const totalWeight = useMemo(() => {
    return linkDrafts.reduce((acc, l) => {
      const sub = l.subWeights || {};
      const subSum = Object.values(sub).reduce((a, v) => a + (Number(v) || 0), 0);
      if (Object.keys(sub).length > 0) return acc + subSum;
      return acc + (Number(l.weightAll) || 0);
    }, 0);
  }, [linkDrafts]);

  const selectedCompetenciaIds = useMemo(() => {
    return new Set(linkDrafts.map((l) => l.competenciaId).filter(Boolean));
  }, [linkDrafts]);

  const filteredCompetencias = useMemo(() => {
    const q = (competenciaSearch || '').trim().toLowerCase();
    if (!q) return competencias;
    return competencias.filter((c) => {
      const hay = `${c.code} ${c.name} ${c.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [competencias, competenciaSearch]);

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

    const audience = Array.from(new Set((taskAudienceLevels || []).filter((x) => x === 5 || x === 6)));
    const effectiveAudience: AudienceLevel[] = audience.length === 1 ? (audience as AudienceLevel[]) : [5, 6];

    const t5 = String(achievementText5 || '').trim();
    const t6 = String(achievementText6 || '').trim();
    const achievementTextByLevel: Partial<Record<AudienceLevel, string>> = {};
    if (t5) achievementTextByLevel[5] = t5;
    if (t6) achievementTextByLevel[6] = t6;

    const normalizedLinks: TaskCompetencyLink[] = [];
    for (const d of linkDrafts) {
      const competenciaId = String(d.competenciaId || '').trim();
      if (!competenciaId) continue;

      const sub = d.subWeights && typeof d.subWeights === 'object' ? d.subWeights : {};
      const subIds = Object.keys(sub).map((x) => String(x || '').trim()).filter(Boolean);
      if (subIds.length === 0) {
        const w = typeof d.weightAll === 'number' ? d.weightAll : Number(d.weightAll || 0);
        const weightAll = Number.isFinite(w) ? clampPct(w) : 0;
        normalizedLinks.push({ competenciaId, weight: weightAll });
      } else {
        for (const subId of subIds) {
          const w = typeof sub[subId] === 'number' ? sub[subId] : Number(sub[subId] || 0);
          normalizedLinks.push({ competenciaId, subCompetenciaId: subId, weight: Number.isFinite(w) ? clampPct(w) : 0 });
        }
      }
    }

    const id = editingTaskId || newId('task');
    try {
      await upsertTask(workspaceId, {
        id,
        learningSituationId,
        title,
        description: taskDescription.trim(),
        links: normalizedLinks,
        audienceLevels: effectiveAudience.length === 2 ? undefined : effectiveAudience,
        achievementTextByLevel: Object.keys(achievementTextByLevel).length > 0 ? achievementTextByLevel : undefined,
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
              <p className="text-gray-600 mt-1">Define tareas y pesos hacia competencias/subcompetencias.</p>
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
                  <p className="text-sm text-gray-600">Cada tarea aporta a competencias/subcompetencias con un porcentaje manual.</p>
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
                              const c = competenciasById.get(l.competenciaId);
                              const sub = c?.subCompetencias?.find((s) => s.id === l.subCompetenciaId);
                              return (
                                <li key={idx}>
                                  {c ? `${c.code}` : l.competenciaId}
                                  {sub ? ` · ${sub.code ? sub.code + ': ' : ''}${sub.name}` : ''}
                                  {` — ${Number(l.weight || 0).toFixed(0)}%`}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 mt-3">Sin competencias vinculadas todavía.</p>
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
                <p className="text-sm font-semibold text-gray-900">Audiencia (internivel)</p>
                <p className="text-xs text-gray-600 mt-1">Define si la tarea es común (5º+6º) o específica por nivel.</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={taskAudienceLevels.length === 2 ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTaskAudienceLevels([5, 6])}
                    title="Aplicar a 5º y 6º"
                  >
                    Ambos
                  </button>
                  <button
                    type="button"
                    className={taskAudienceLevels.length === 1 && taskAudienceLevels[0] === 5 ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTaskAudienceLevels([5])}
                    title="Solo 5º"
                  >
                    5º
                  </button>
                  <button
                    type="button"
                    className={taskAudienceLevels.length === 1 && taskAudienceLevels[0] === 6 ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => setTaskAudienceLevels([6])}
                    title="Solo 6º"
                  >
                    6º
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Texto de logro (5º) (opcional)</label>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={achievementText5}
                      onChange={(e) => setAchievementText5(e.target.value)}
                      placeholder="Qué se espera observar en 5º…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Texto de logro (6º) (opcional)</label>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={achievementText6}
                      onChange={(e) => setAchievementText6(e.target.value)}
                      placeholder="Qué se espera observar en 6º…"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900">Asignación (opcional)</p>
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
                    <p className="text-sm font-semibold text-gray-900">Competencias/subcompetencias y pesos</p>
                    <p className="text-xs text-gray-600">Selecciona competencias como etiquetas y asigna un % manual a cada una.</p>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Buscar competencia</label>
                  <input
                    className="input-field"
                    value={competenciaSearch}
                    onChange={(e) => setCompetenciaSearch(e.target.value)}
                    placeholder="Escribe código o nombre…"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    {filteredCompetencias.slice(0, 24).map((c) => {
                      const selected = selectedCompetenciaIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={selected ? 'btn-primary' : 'btn-secondary'}
                          onClick={() => {
                            if (selected) removeCompetencia(c.id);
                            else upsertCompetenciaDraft(c.id, { weightAll: 0, subWeights: {} });
                          }}
                          title={c.name}
                        >
                          {c.code}
                        </button>
                      );
                    })}
                  </div>

                  {linkDrafts.length === 0 ? (
                    <p className="text-sm text-gray-600 mt-3">Selecciona una o más competencias.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {linkDrafts.map((l) => {
                        const c = competenciasById.get(l.competenciaId);
                        const subs = c?.subCompetencias || [];
                        const subPickerOpen = Boolean(subPickerOpenByCompId[l.competenciaId]);
                        const selectedSubIds = new Set(Object.keys(l.subWeights || {}).filter(Boolean));
                        return (
                          <div key={l.competenciaId} className="border border-gray-200 rounded-lg p-3 bg-white">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">
                                  {(c ? `${c.code}: ${c.name}` : l.competenciaId)}
                                </p>
                                {c?.description ? (
                                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{c.description}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="text-sm text-gray-600 hover:text-gray-900 underline"
                                onClick={() => removeCompetencia(l.competenciaId)}
                              >
                                Quitar
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                              <div className="md:col-span-7">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="block text-xs font-medium text-gray-700">Subcompetencias (opcional)</label>
                                  {subs.length > 0 ? (
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() =>
                                        setSubPickerOpenByCompId((prev) => ({
                                          ...prev,
                                          [l.competenciaId]: !Boolean(prev[l.competenciaId]),
                                        }))
                                      }
                                    >
                                      {subPickerOpen ? 'Ocultar' : 'Seleccionar'}
                                    </button>
                                  ) : null}
                                </div>

                                {subs.length === 0 ? (
                                  <p className="text-xs text-gray-600 mt-1">Esta competencia no tiene subcompetencias.</p>
                                ) : subPickerOpen ? (
                                  <>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className={selectedSubIds.size === 0 ? 'btn-primary' : 'btn-secondary'}
                                        onClick={() => clearSubs(l.competenciaId)}
                                        title="Aplicar a toda la competencia"
                                      >
                                        Todas
                                      </button>
                                      {subs.map((s) => {
                                        const selected = selectedSubIds.has(s.id);
                                        return (
                                          <button
                                            key={s.id}
                                            type="button"
                                            className={selected ? 'btn-primary' : 'btn-secondary'}
                                            onClick={() => {
                                              toggleSub(l.competenciaId, s.id);
                                            }}
                                            title={s.name}
                                          >
                                            {s.code || s.name}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <p className="text-xs text-gray-600 mt-2">
                                      {selectedSubIds.size === 0
                                        ? 'Aplicando a toda la competencia.'
                                        : `Aplicando a ${selectedSubIds.size} subcompetencia(s).`}
                                    </p>

                                    {selectedSubIds.size > 0 ? (
                                      <div className="mt-3 space-y-2">
                                        {subs
                                          .filter((s) => selectedSubIds.has(s.id))
                                          .map((s) => {
                                            const k = weightKey(l.competenciaId, s.id);
                                            const wNum = (l.subWeights || {})[s.id] ?? 0;
                                            const draft = weightDraftByKey[k] ?? (Number(wNum) === 0 ? '' : String(Math.round(Number(wNum))));
                                            const note = briefSubNote(s);
                                            return (
                                              <div key={s.id} className="border border-gray-100 rounded-lg p-2">
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-gray-900">
                                                      {(s.code ? s.code + ': ' : '') + s.name}
                                                    </p>
                                                    {note ? <p className="text-[11px] text-gray-600 mt-0.5">{note}</p> : null}
                                                  </div>
                                                  <div className="w-24 shrink-0">
                                                    <input
                                                      className="input-field"
                                                      type="text"
                                                      inputMode="numeric"
                                                      value={draft}
                                                      onFocus={(e) => e.currentTarget.select()}
                                                      onChange={(e) => {
                                                        const raw = e.target.value;
                                                        if (raw === '') {
                                                          setWeightDraftByKey((prev) => ({ ...prev, [k]: '' }));
                                                          upsertSubWeight(l.competenciaId, s.id, 0);
                                                          return;
                                                        }
                                                        const digits = raw.replace(/[^0-9]/g, '');
                                                        setWeightDraftByKey((prev) => ({ ...prev, [k]: digits }));
                                                        const n = Number(digits);
                                                        if (!Number.isFinite(n)) return;
                                                        upsertSubWeight(l.competenciaId, s.id, n);
                                                      }}
                                                      onBlur={() => {
                                                        const raw = (weightDraftByKey[k] ?? '').trim();
                                                        if (raw === '') return;
                                                        const n = Number(raw);
                                                        if (!Number.isFinite(n)) return;
                                                        const clamped = clampPct(n);
                                                        setWeightDraftByKey((prev) => ({ ...prev, [k]: String(clamped) }));
                                                        upsertSubWeight(l.competenciaId, s.id, clamped);
                                                      }}
                                                      placeholder="%"
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <p className="text-xs text-gray-600 mt-1">
                                    {selectedSubIds.size === 0
                                      ? 'Aplicando a toda la competencia.'
                                      : `${selectedSubIds.size} subcompetencia(s) seleccionada(s).`}
                                  </p>
                                )}
                              </div>

                              <div className="md:col-span-5">
                                {selectedSubIds.size > 0 ? (
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Peso (por subcompetencia)</label>
                                    <p className="text-[11px] text-gray-600">Introduce un % por cada subcompetencia seleccionada.</p>
                                  </div>
                                ) : (
                                  <>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Peso (%)</label>
                                    <input
                                      className="input-field"
                                      type="text"
                                      inputMode="numeric"
                                      value={
                                        weightDraftByKey[weightKey(l.competenciaId)] ??
                                        (Number(l.weightAll || 0) === 0 ? '' : String(Math.round(Number(l.weightAll || 0))))
                                      }
                                      onFocus={(e) => e.currentTarget.select()}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === '') {
                                          setWeightDraftByKey((prev) => ({ ...prev, [weightKey(l.competenciaId)]: '' }));
                                          upsertCompetenciaDraft(l.competenciaId, { weightAll: 0 });
                                          return;
                                        }

                                        const digits = raw.replace(/[^0-9]/g, '');
                                        setWeightDraftByKey((prev) => ({ ...prev, [weightKey(l.competenciaId)]: digits }));
                                        const n = Number(digits);
                                        if (!Number.isFinite(n)) return;
                                        upsertCompetenciaDraft(l.competenciaId, { weightAll: clampPct(n) });
                                      }}
                                      onBlur={() => {
                                        const raw = (weightDraftByKey[weightKey(l.competenciaId)] ?? '').trim();
                                        if (raw === '') return;
                                        const n = Number(raw);
                                        if (!Number.isFinite(n)) return;
                                        const clamped = clampPct(n);
                                        setWeightDraftByKey((prev) => ({ ...prev, [weightKey(l.competenciaId)]: String(clamped) }));
                                        upsertCompetenciaDraft(l.competenciaId, { weightAll: clamped });
                                      }}
                                      placeholder="%"
                                    />
                                  </>
                                )}
                              </div>
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
