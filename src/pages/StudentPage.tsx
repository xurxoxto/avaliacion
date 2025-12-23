import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react';
import { Teacher, Student, Project, TriangulationGrade, Classroom } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import TrafficButton from '../components/TrafficButton';
import CreateStudentModal from '../components/CreateStudentModal';
import { useCompetencyCalculator } from '../hooks/useCompetencyCalculator';
import { listenProjects, createProject, deleteProject } from '../utils/firestore/projects';
import { listenGradesForStudent, upsertGrade, deleteGradesForStudent } from '../utils/firestore/grades';
import { deleteGradesForProject } from '../utils/firestore/grades';
import { listenCompetencias, seedCompetenciasIfEmpty } from '../utils/firestore/competencias';
import { listenStudents, deleteStudent, updateStudent } from '../utils/firestore/students';
import { listenClassrooms } from '../utils/firestore/classrooms';
import {
  addTriangulationObservation,
  deleteTriangulationObservationsForProject,
  deleteTriangulationObservationsForStudent,
  listenTriangulationObservationsForStudent,
} from '../utils/firestore/triangulationObservations';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { GradeKey, TriangulationObservation } from '../types';
import { GRADE_LABEL_ES, GRADE_VALUE, gradeKeyFromNumeric } from '../utils/triangulation/gradeScale';
import { GRADE_COLOR_CLASS } from '../utils/triangulation/gradeScale';
import { normalizeCompetenceCode } from '../data/competencias';

const SHOW_LEGACY_TRIANGULATION = false;

const TRI_EVIDENCE_WINDOW_DAYS = 45;
const TRI_DISAGREE_LAST_N = 4;
const GRADE_ORDER: Record<GradeKey, number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
  BLUE: 3,
};

const DEFAULT_OBS_TEMPLATE = `Evidencia observable (qué hizo/dijo; tarea y condiciones):
Indicador/criterio observable (en qué me fijo; qué cuenta como logrado):
Decisión docente (mañana haré… / feedback / ayuda / reto):`;

interface StudentPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function StudentPage({ teacher, onLogout }: StudentPageProps) {
  const { id, classroomId } = useParams<{ id: string, classroomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [student, setStudent] = useState<Student | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [competencias, setCompetencias] = useState(storage.getCompetencias());
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [showLevelsInfo, setShowLevelsInfo] = useState(false);

  const competenciaIdSet = useMemo(() => new Set(competencias.map((c) => c.id)), [competencias]);
  const competenciaIdByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of competencias) map.set(normalizeCompetenceCode(c.code), c.id);
    return map;
  }, [competencias]);

  const resolveCompetenciaId = useMemo(() => {
    return (raw: any): string | null => {
      const v = String(raw ?? '').trim();
      if (!v) return null;
      if (competenciaIdSet.has(v)) return v;

      const normalized = normalizeCompetenceCode(v);
      const mapped = competenciaIdByCode.get(normalized);
      if (mapped) return mapped;

      // Legacy fallback (pre-LOMLOE defaults used codes like C1..C7)
      const legacy = /^C([1-7])$/i.exec(v);
      if (legacy) return `c${legacy[1]}`;

      return null;
    };
  }, [competenciaIdByCode, competenciaIdSet]);

  const obsSectionRef = useRef<HTMLDivElement | null>(null);
  const didAutoFocusObsRef = useRef(false);

  const [obsTemplate, setObsTemplate] = useState<string>(DEFAULT_OBS_TEMPLATE);
  const [templateDraft, setTemplateDraft] = useState<string>(DEFAULT_OBS_TEMPLATE);

  const focusObs = useMemo(() => {
    try {
      const qp = new URLSearchParams(location.search);
      return (qp.get('focus') || '').toLowerCase() === 'obs';
    } catch {
      return false;
    }
  }, [location.search]);

  useEffect(() => {
    if (!focusObs) {
      didAutoFocusObsRef.current = false;
      return;
    }
    if (didAutoFocusObsRef.current) return;
    if (!obsSectionRef.current) return;

    didAutoFocusObsRef.current = true;
    window.setTimeout(() => {
      const el = obsSectionRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const input = el.querySelector<HTMLTextAreaElement>('textarea[data-obs-input="true"]');
      input?.focus();
    }, 60);
  }, [focusObs, competencias.length]);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  const [justSavedCompId, setJustSavedCompId] = useState<string>('');
  const savedTimer = useRef<number | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [triGrades, setTriGrades] = useState<TriangulationGrade[]>([]);
  const [triObs, setTriObs] = useState<TriangulationObservation[]>([]);
  const [pendingGradeByComp, setPendingGradeByComp] = useState<Record<string, GradeKey | null>>({});
  const [obsTextByComp, setObsTextByComp] = useState<Record<string, string>>({});
  const [subByComp, setSubByComp] = useState<Record<string, string>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const creatingDefaultProject = useRef(false);

  useEffect(() => {
    if (!teacher.workspaceId || !id) return;

    const unsubStudents = listenStudents(teacher.workspaceId, (remoteStudents) => {
      storage.saveStudents(remoteStudents);
      const found = remoteStudents.find(s => s.id === id);
      setStudent(found || null);
    });

    const unsubClassrooms = listenClassrooms(teacher.workspaceId, (remoteClassrooms) => {
      storage.saveClassrooms(remoteClassrooms);
      const clsId = classroomId || (student ? student.classroomId : undefined);
      const found = clsId ? remoteClassrooms.find(c => c.id === clsId) : undefined;
      setClassroom(found || null);
    });

    return () => {
      unsubStudents();
      unsubClassrooms();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.workspaceId, id, classroomId]);

  useEffect(() => {
    if (!teacher.workspaceId) {
      setCompetencias(storage.getCompetencias());
      return;
    }

    void seedCompetenciasIfEmpty(teacher.workspaceId, storage.getCompetencias()).catch(() => {
      // ignore; may be offline
    });

    const unsub = listenCompetencias(teacher.workspaceId, (items) => setCompetencias(items));
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    if (!teacher.workspaceId || !id) return;

    const unsubProjects = listenProjects(teacher.workspaceId, (ps) => {
      setProjects(ps);
    });
    const unsubGrades = listenGradesForStudent(teacher.workspaceId, id, (gs) => {
      setTriGrades(gs);
    });

    const unsubObs = listenTriangulationObservationsForStudent(teacher.workspaceId, id, (items) => {
      setTriObs(items);
    });

    return () => {
      unsubProjects();
      unsubGrades();
      unsubObs();
    };
  }, [teacher.workspaceId, id]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    if (projects.length > 0) {
      setSelectedProjectId((prev) => prev || projects[0].id);
      return;
    }
    if (creatingDefaultProject.current) return;
    creatingDefaultProject.current = true;
    createProject(teacher.workspaceId, 'General')
      .catch(() => {
        // ignore; user may lack permissions or offline
      })
      .finally(() => {
        creatingDefaultProject.current = false;
      });
  }, [projects, teacher.workspaceId]);

  // Competencias are sourced from Firestore (workspace-wide)

  useEffect(() => {
    const emailKey = (teacher.email || 'unknown').trim().toLowerCase();
    const storageKey = `avaliacion_obs_template_${encodeURIComponent(emailKey)}`;
    try {
      const saved = window.localStorage.getItem(storageKey);
      const tpl = (saved || '').trim() ? String(saved) : DEFAULT_OBS_TEMPLATE;
      setObsTemplate(tpl);
      setTemplateDraft(tpl);
    } catch {
      // ignore (private mode / storage disabled)
      setObsTemplate(DEFAULT_OBS_TEMPLATE);
      setTemplateDraft(DEFAULT_OBS_TEMPLATE);
    }
  }, [teacher.email]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, []);

  const saveTemplate = () => {
    const emailKey = (teacher.email || 'unknown').trim().toLowerCase();
    const storageKey = `avaliacion_obs_template_${encodeURIComponent(emailKey)}`;
    const next = (templateDraft || '').trim() ? templateDraft : DEFAULT_OBS_TEMPLATE;
    setObsTemplate(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // ignore
    }
    setShowTemplateEditor(false);
  };

  const applyTemplateIfEmpty = (current: string) => {
    if ((current || '').trim()) return current;
    return obsTemplate;
  };

  const breadcrumbItems = useMemo(() => {
    if (!classroom || !student) return [];
    return [
      { label: classroom.name, path: `/classroom/${classroom.id}` },
      { label: `${student.firstName} ${student.lastName}`, path: `/classroom/${classroom.id}/student/${student.id}` },
    ];
  }, [classroom, student]);

  const handleSaveObservation = ({ competenciaId, subCompetenciaId, gradeKey, observationText }: { competenciaId: string, subCompetenciaId?: string, gradeKey: GradeKey, observationText: string }) => {
    if (!student) return;

    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Inicia sesión para guardar y sincronizar.');
      return;
    }

    const markJustSaved = () => {
      setJustSavedCompId(competenciaId);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setJustSavedCompId(''), 1500);
    };

    if (!selectedProjectId) {
      alert('Por favor, selecciona un proyecto.');
      return;
    }

    // Persist the current level for the project/competencia
    upsertGrade({
      workspaceId: workspaceId,
      studentId: student.id,
      projectId: selectedProjectId,
      competenciaId: competenciaId,
      gradeKey: gradeKey,
    }).catch(() => {
      // non-fatal; keep trying to record observation anyway
    });

    addTriangulationObservation({
      workspaceId: workspaceId,
      studentId: student.id,
      projectId: selectedProjectId,
      competenciaId: competenciaId,
      subCompetenciaId: subCompetenciaId,
      gradeKey: gradeKey,
      observation: observationText,
      teacherId: teacher.id,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
    })
      .then(() => {
        setObsTextByComp(prev => ({ ...prev, [competenciaId]: '' }));
        markJustSaved();
      })
      .catch(() => {
        alert('No se pudo guardar la observación.');
      });
  };

  const handleDeleteStudent = () => {
    if (!student) return;
    const ok = confirm(`Eliminar a ${student.firstName} ${student.lastName}? Esta acción no se puede deshacer.`);
    if (!ok) return;

    const workspaceId = teacher.workspaceId;
    if (!workspaceId) return;

    const studentId = student.id;
    Promise.all([
      deleteGradesForStudent(workspaceId, studentId),
      deleteTriangulationObservationsForStudent(workspaceId, studentId),
      deleteStudent(workspaceId, studentId),
    ])
      .then(async () => {
        const clsId = classroomId || student.classroomId;
        if (clsId) {
          try {
            const classroomRef = doc(db, 'workspaces', workspaceId, 'classrooms', clsId);
            await updateDoc(classroomRef, { studentCount: increment(-1), updatedAt: new Date() });
          } catch {
            // ignore
          }
        }
      })
      .finally(() => {
        navigate(`/classroom/${student.classroomId}`);
      });
  };

  const handleEditStudent = async (form: Pick<Student, 'firstName' | 'lastName' | 'listNumber'>) => {
    if (!student) return;
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Necesitas estar online para editar.');
      return;
    }
    try {
      await updateStudent(workspaceId, student.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        listNumber: form.listNumber,
      });
      setShowEditStudentModal(false);
    } catch (error) {
      console.error('Error updating student:', error);
      alert('Hubo un error al actualizar el estudiante. Por favor, inténtalo de nuevo.');
    }
  };

  const formatDateEs = (value: any) => {
    try {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  const gradesByCompetenciaForProject = useMemo(() => {
    const map = new Map<string, TriangulationGrade>();
    for (const g of triGrades) {
      if (g.projectId !== selectedProjectId) continue;
      const compId = resolveCompetenciaId(g.competenciaId);
      if (!compId) continue;
      map.set(compId, g);
    }
    return map;
  }, [triGrades, selectedProjectId, resolveCompetenciaId]);

  const taskCompetency = useCompetencyCalculator({
    workspaceId: teacher.workspaceId,
    studentId: id,
  });

  const taskGlobal = useMemo(() => {
    const items = Array.from(taskCompetency.computedByCompetency.values());
    if (items.length === 0) return null;
    const totalCount = items.reduce((acc, x) => acc + (typeof x.count === 'number' ? x.count : 0), 0);
    const weightedSum = items.reduce(
      (acc, x) => acc + (typeof x.average === 'number' ? x.average : 0) * (typeof x.count === 'number' ? x.count : 0),
      0
    );
    const avg = totalCount > 0 ? weightedSum / totalCount : items.reduce((a, x) => a + x.average, 0) / items.length;
    const safeAvg = Number.isFinite(avg) ? avg : 0;
    return {
      average: safeAvg,
      gradeKey: gradeKeyFromNumeric(safeAvg),
      competencyCount: items.length,
      evidenceCount: totalCount,
    };
  }, [taskCompetency.computedByCompetency]);

  const allObsSorted = useMemo(() => {
    return triObs
      .slice()
      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  }, [triObs]);

  const evidenceStats = useMemo(() => {
    const now = Date.now();
    const cutoff = now - TRI_EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const byComp = new Map<string, TriangulationObservation[]>();
    for (const o of allObsSorted) {
      const compId = resolveCompetenciaId(o.competenciaId);
      if (!compId) continue;
      const arr = byComp.get(compId);
      if (arr) arr.push(o);
      else byComp.set(compId, [o]);
    }

    const latestByComp = new Map<string, TriangulationObservation>();
    const recentCountByComp = new Map<string, number>();
    const confidenceByComp = new Map<string, 'Alta' | 'Media' | 'Baja'>();
    const needsReviewByComp = new Map<string, boolean>();

    for (const [compId, items] of byComp.entries()) {
      if (items.length > 0) latestByComp.set(compId, items[0]);

      const recentCount = items.reduce((acc, o) => {
        const t = o.createdAt instanceof Date ? o.createdAt.getTime() : 0;
        return acc + (t >= cutoff ? 1 : 0);
      }, 0);
      recentCountByComp.set(compId, recentCount);
      confidenceByComp.set(compId, recentCount >= 3 ? 'Alta' : recentCount >= 2 ? 'Media' : 'Baja');

      const last = items.slice(0, TRI_DISAGREE_LAST_N);
      const emails = new Set(last.map(x => x.teacherEmail).filter(Boolean) as string[]);
      if (emails.size < 2) {
        needsReviewByComp.set(compId, false);
        continue;
      }

      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const x of last) {
        const v = GRADE_ORDER[x.gradeKey];
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      needsReviewByComp.set(compId, (max - min) >= 2);
    }

    return {
      byComp,
      latestByComp,
      recentCountByComp,
      confidenceByComp,
      needsReviewByComp,
    };
  }, [allObsSorted, resolveCompetenciaId]);

  const taskEvidenceStats = useMemo(() => {
    const now = Date.now();
    const cutoff = now - TRI_EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    type TaskEv = {
      at: Date;
      rating: GradeKey;
      numericalValue: number;
      observation: string;
      teacherName?: string;
      teacherEmail?: string;
    };

    const byComp = new Map<string, TaskEv[]>();
    for (const ev of taskCompetency.evaluations) {
      const at = ev.timestamp instanceof Date ? ev.timestamp : new Date(ev.timestamp);
      if (!Number.isFinite(at.getTime())) continue;

      const links = Array.isArray(ev.links) ? ev.links : [];
      for (const l of links) {
        const compId = resolveCompetenciaId(l?.competenciaId);
        if (!compId) continue;
        const arr = byComp.get(compId);
        const item: TaskEv = {
          at,
          rating: ev.rating,
          numericalValue: typeof ev.numericalValue === 'number' ? ev.numericalValue : GRADE_VALUE[ev.rating],
          observation: typeof ev.observation === 'string' ? ev.observation : '',
          teacherName: typeof ev.teacherName === 'string' ? ev.teacherName : undefined,
          teacherEmail: typeof ev.teacherEmail === 'string' ? ev.teacherEmail : undefined,
        };
        if (arr) arr.push(item);
        else byComp.set(compId, [item]);
      }
    }

    const latestByComp = new Map<string, TaskEv>();
    const recentCountByComp = new Map<string, number>();
    const confidenceByComp = new Map<string, 'Alta' | 'Media' | 'Baja'>();
    const needsReviewByComp = new Map<string, boolean>();

    for (const [compId, items] of byComp.entries()) {
      items.sort((a, b) => b.at.getTime() - a.at.getTime());
      if (items.length > 0) latestByComp.set(compId, items[0]);

      const recentCount = items.reduce((acc, it) => acc + (it.at.getTime() >= cutoff ? 1 : 0), 0);
      recentCountByComp.set(compId, recentCount);
      confidenceByComp.set(compId, recentCount >= 3 ? 'Alta' : recentCount >= 2 ? 'Media' : 'Baja');

      const last = items.slice(0, TRI_DISAGREE_LAST_N);
      const emails = new Set(last.map(x => x.teacherEmail).filter(Boolean) as string[]);
      if (emails.size < 2) {
        needsReviewByComp.set(compId, false);
        continue;
      }

      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const x of last) {
        const v = GRADE_ORDER[x.rating];
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      needsReviewByComp.set(compId, (max - min) >= 2);
    }

    return {
      latestByComp,
      recentCountByComp,
      confidenceByComp,
      needsReviewByComp,
    };
  }, [taskCompetency.evaluations, resolveCompetenciaId]);

  const obsByProject = useMemo(() => {
    const groups = new Map<string, typeof allObsSorted>();
    for (const o of allObsSorted) {
      const key = o.projectId || 'unknown';
      const arr = groups.get(key);
      if (arr) arr.push(o);
      else groups.set(key, [o]);
    }
    return groups;
  }, [allObsSorted]);

  if (!student) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header teacher={teacher} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Estudiante no encontrado</p>
        </div>
      </div>
    );
  }

  const isOnline = !!teacher.workspaceId;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(`/classroom/${student?.classroomId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver a la clase
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditStudentModal(true)}
              className="btn-secondary"
              title="Editar estudiante"
              disabled={!isOnline}
            >
              Editar
            </button>
            <button
              onClick={handleDeleteStudent}
              className="btn-secondary flex items-center justify-center gap-2"
              title="Eliminar estudiante"
              disabled={!isOnline}
            >
              <Trash2 className="w-5 h-5" />
              Eliminar
            </button>
          </div>
        </div>

              {!isOnline && (
                <p className="text-sm text-gray-600 mt-4">
                  Estás en modo offline. Para registrar evidencias en tareas, inicia sesión.
                </p>
              )}

              <div className="mt-4 space-y-4">
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Competencias del estudiante</p>
                      <p className="text-xs text-gray-600">
                        Fuente: evaluaciones por tareas. Registra evidencias en Situaciones → Tareas.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => navigate('/learning-situations')}
                    >
                      Ver situaciones
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    {isOnline && taskGlobal ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[taskGlobal.gradeKey]}`} />
                        <span className="text-gray-700">
                          Global: {GRADE_LABEL_ES[taskGlobal.gradeKey]} ({taskGlobal.average.toFixed(1)})
                        </span>
                        <span className="text-gray-600">· {taskGlobal.competencyCount} competencias</span>
                        <span className="text-gray-600">· {taskGlobal.evidenceCount} evidencias</span>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-sm text-gray-600 hover:text-gray-900 underline"
                        onClick={() => setShowLevelsInfo((v) => !v)}
                      >
                        Niveles
                      </button>
                      {showLevelsInfo ? (
                        <div className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.RED}`} />
                              <div>
                                <div className="font-semibold">{GRADE_LABEL_ES.RED}</div>
                                <div className="text-gray-600">Hay discrepancia o necesita mucha guía; conviene más evidencia/ajuste.</div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.YELLOW}`} />
                              <div>
                                <div className="font-semibold">{GRADE_LABEL_ES.YELLOW}</div>
                                <div className="text-gray-600">Reproduce con apoyo: sigue instrucciones y aplica en contexto similar.</div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.GREEN}`} />
                              <div>
                                <div className="font-semibold">{GRADE_LABEL_ES.GREEN}</div>
                                <div className="text-gray-600">Trabaja de forma autónoma: elige estrategias y se autocorrige.</div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.BLUE}`} />
                              <div>
                                <div className="font-semibold">{GRADE_LABEL_ES.BLUE}</div>
                                <div className="text-gray-600">Transfiere: aplica lo aprendido en situaciones nuevas y justifica decisiones.</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {!isOnline ? (
                    <p className="text-sm text-gray-600 mt-3">
                      Inicia sesión para ver y registrar evidencias en tareas.
                    </p>
                  ) : taskCompetency.computedByCompetency.size === 0 ? (
                    <p className="text-sm text-gray-600 mt-3">
                      Aún no hay evaluaciones por tareas para este estudiante.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {competencias
                        .map((c) => {
                          const computed = taskCompetency.computedByCompetency.get(c.id);
                          if (!computed) return null;
                            const recentCount = taskEvidenceStats.recentCountByComp.get(c.id) || 0;
                            const conf = taskEvidenceStats.confidenceByComp.get(c.id) || 'Baja';
                            const confClass = conf === 'Alta'
                              ? 'bg-green-50 text-green-800 border-green-200'
                              : conf === 'Media'
                                ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                                : 'bg-gray-50 text-gray-800 border-gray-200';

                          const trendLabel =
                            computed.latestTrend === 'UP'
                              ? '↗ Mejora'
                              : computed.latestTrend === 'DOWN'
                                ? '↘ Baja'
                                : '→ Estable';
                          return (
                            <div key={c.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-gray-900">{c.code}: {c.name}</p>
                                  {c.description ? (
                                    <p className="text-xs text-gray-600 mt-0.5">{c.description}</p>
                                  ) : null}

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[computed.averageGradeKey]}`} />
                                    <span className="text-xs text-gray-700">
                                      {GRADE_LABEL_ES[computed.averageGradeKey]} ({computed.average.toFixed(1)})
                                    </span>
                                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${confClass}`}>
                                        Confianza: {conf} ({recentCount})
                                      </span>
                                    <span className="text-xs text-gray-600">· {computed.count} evid.</span>
                                    {computed.latestAt ? (
                                      <span className="text-xs text-gray-600">· Última: {formatDateEs(computed.latestAt)}</span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-gray-600">Tendencia</p>
                                  <p className="text-xs font-semibold text-gray-900">{trendLabel}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                        .filter(Boolean)}
                    </div>
                  )}
                </div>

                {SHOW_LEGACY_TRIANGULATION && (
                  <>
                {isOnline && (
                  <div>
                    <label htmlFor="project" className="block text-sm font-medium text-gray-700 mb-2">
                      Proyecto
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <select
                          id="project"
                          className="input-field"
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                          disabled={projects.length === 0}
                        >
                          {projects.length === 0 ? (
                            <option value="">Cargando proyectos...</option>
                          ) : (
                            projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!selectedProjectId}
                        onClick={() => {
                          if (!teacher.workspaceId || !selectedProjectId) return;
                          const p = projects.find(x => x.id === selectedProjectId);
                          const ok = confirm(`Eliminar el proyecto "${p?.name || ''}"? Se borrarán también sus registros.`);
                          if (!ok) return;
                          Promise.all([
                            deleteGradesForProject(teacher.workspaceId, selectedProjectId),
                            deleteTriangulationObservationsForProject(teacher.workspaceId, selectedProjectId),
                          ])
                            .then(() => deleteProject(teacher.workspaceId!, selectedProjectId))
                            .then(() => {
                              setSelectedProjectId('');
                            })
                            .catch(() => {
                              alert('No se pudo eliminar el proyecto.');
                            });
                        }}
                      >
                        <Trash2 className="w-5 h-5 inline-block mr-2" />
                        Eliminar
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        className="input-field md:col-span-2"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Nuevo proyecto (p. ej. Lectura, Problemas...)"
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          if (!teacher.workspaceId) return;
                          const name = newProjectName.trim();
                          if (!name) return;
                          createProject(teacher.workspaceId, name)
                            .then((pid) => {
                              setNewProjectName('');
                              setSelectedProjectId(pid);
                            })
                            .catch(() => alert('No se pudo crear el proyecto.'));
                        }}
                      >
                        <Plus className="w-5 h-5 inline-block mr-2" />
                        Crear
                      </button>
                    </div>
                  </div>
                )}

                <div ref={obsSectionRef} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-600">Registro breve (personalizable)</p>
                    <button
                      type="button"
                      className="text-sm text-gray-600 hover:text-gray-900 underline"
                      onClick={() => {
                        setTemplateDraft(obsTemplate);
                        setShowTemplateEditor(v => !v);
                      }}
                    >
                      {showTemplateEditor ? 'Ocultar plantilla' : 'Plantilla'}
                    </button>
                  </div>

                  {showTemplateEditor && (
                    <div className="border border-gray-200 rounded-lg p-3 bg-white">
                      <textarea
                        className="input-field"
                        rows={4}
                        value={templateDraft}
                        onChange={(e) => setTemplateDraft(e.target.value)}
                      />
                      <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setTemplateDraft(DEFAULT_OBS_TEMPLATE)}
                        >
                          Restablecer
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={saveTemplate}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}

                  {competencias.map((c) => {
                      const current = gradesByCompetenciaForProject.get(c.id)?.gradeKey ?? null;
                      const pending = pendingGradeByComp[c.id] ?? current;
                      const subs = c.subCompetencias || [];
                      const hasSubs = subs.length > 0;
                      const recentCount = evidenceStats.recentCountByComp.get(c.id) || 0;
                      const conf = evidenceStats.confidenceByComp.get(c.id) || 'Baja';
                      const needsReview = evidenceStats.needsReviewByComp.get(c.id) || false;
                      return (
                        <div key={c.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">{c.code}: {c.name}</p>
                              {c.description ? (
                                <p className="text-xs text-gray-600 mt-1">{c.description}</p>
                              ) : null}

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-gray-600">
                                  {recentCount} evid. ({TRI_EVIDENCE_WINDOW_DAYS}d)
                                </span>
                                <span className="text-xs text-gray-600">· Confianza: {conf}</span>
                                {needsReview && (
                                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
                                    Revisar
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <TrafficButton
                              value={pending}
                              disabled={isOnline && !selectedProjectId}
                              onChange={(next) => {
                                setPendingGradeByComp(prev => ({ ...prev, [c.id]: next }));
                              }}
                            />
                          </div>

                          {hasSubs && (
                            <div className="mt-3">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Sub-competencia (opcional)</label>
                              <select
                                className="input-field"
                                value={subByComp[c.id] || ''}
                                onChange={(e) => setSubByComp(prev => ({ ...prev, [c.id]: e.target.value }))}
                              >
                                <option value="">Sin sub-competencia</option>
                                {subs.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {(s.code ? s.code + ': ' : '') + s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="mt-3">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Registro</label>
                            <textarea
                              data-obs-input="true"
                              className="input-field"
                              rows={2}
                              value={obsTextByComp[c.id] || ''}
                              onChange={(e) => setObsTextByComp(prev => ({ ...prev, [c.id]: e.target.value }))}
                              onFocus={() => {
                                setObsTextByComp(prev => ({
                                  ...prev,
                                  [c.id]: applyTemplateIfEmpty(prev[c.id] || ''),
                                }));
                              }}
                              placeholder={obsTemplate}
                            />
                          </div>

                          <div className="mt-3 flex items-center justify-end">
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={(isOnline && !selectedProjectId) || !pending || !(obsTextByComp[c.id] || '').trim()}
                              onClick={() => {
                                if (!pending) return;
                                const observationText = (obsTextByComp[c.id] || '').trim();
                                if (!observationText) return;

                                handleSaveObservation({
                                  competenciaId: c.id,
                                  subCompetenciaId: subByComp[c.id] || undefined,
                                  gradeKey: pending,
                                  observationText: observationText,
                                });
                              }}
                            >
                              <Save className="w-5 h-5 inline-block mr-2" />
                              {justSavedCompId === c.id ? 'Guardado' : 'Registrar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  </>
                )}

                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Historial (todos los proyectos)</p>
                        <p className="text-xs text-gray-600">Evidencias con nivel y puntuación estimada.</p>
                      </div>
                    </div>

                    {allObsSorted.length === 0 ? (
                      <p className="text-sm text-gray-600 mt-3">Aún no hay observaciones trianguladas para este estudiante.</p>
                    ) : (
                      <div className="mt-3 space-y-4">
                        {Array.from(obsByProject.entries()).map(([pid, items]) => {
                          const proj = projects.find(p => p.id === pid);
                          const title = proj?.name || (pid === 'local' ? 'Offline' : pid === 'unknown' ? 'Sin proyecto' : 'Proyecto eliminado');
                          return (
                            <div key={pid} className="border border-gray-200 rounded-lg bg-white">
                              <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-sm font-semibold text-gray-900">{title}</p>
                                <p className="text-xs text-gray-600">{items.length} evidencia(s)</p>
                              </div>

                              {/* Mobile cards */}
                              <div className="block sm:hidden">
                                {items.slice(0, 25).map((o) => {
                                  const comp = competencias.find(x => x.id === o.competenciaId);
                                  const dt = o.createdAt instanceof Date ? formatDateEs(o.createdAt) : '-';
                                  const author = o.teacherName || o.teacherEmail || '—';
                                  return (
                                    <div key={o.id} className="px-4 py-3 border-t border-gray-100">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-xs text-gray-600">{dt}</p>
                                          <p className="text-sm font-semibold text-gray-900">{comp?.code || '-'} {comp?.name ? `· ${comp.name}` : ''}</p>
                                          <p className="text-xs text-gray-600 mt-0.5">Por: {author}</p>
                                        </div>
                                        <span className="inline-flex items-center gap-2 shrink-0">
                                          <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[o.gradeKey]}`} />
                                          <span className="text-xs text-gray-700">{GRADE_LABEL_ES[o.gradeKey]}</span>
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-600 mt-1">Puntuación: {Number(GRADE_VALUE[o.gradeKey]).toFixed(1)}</p>
                                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{o.observation}</p>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Desktop/tablet table */}
                              <div className="hidden sm:block overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-gray-600">
                                      <th className="py-2 px-4">Fecha</th>
                                      <th className="py-2 pr-4">Competencia</th>
                                      <th className="py-2 pr-4">Docente</th>
                                      <th className="py-2 pr-4">Nivel</th>
                                      <th className="py-2 pr-4">Puntuación</th>
                                      <th className="py-2 pr-4">Observación</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.slice(0, 25).map((o) => {
                                      const comp = competencias.find(x => x.id === o.competenciaId);
                                      const dt = o.createdAt instanceof Date ? formatDateEs(o.createdAt) : '-';
                                      const author = o.teacherName || o.teacherEmail || '—';
                                      return (
                                        <tr key={o.id} className="border-t border-gray-100">
                                          <td className="py-3 px-4 text-gray-700">{dt}</td>
                                          <td className="py-3 pr-4 text-gray-900 font-medium">{comp?.code || '-'} </td>
                                          <td className="py-3 pr-4 text-gray-700">{author}</td>
                                          <td className="py-3 pr-4">
                                            <span className="inline-flex items-center gap-2">
                                              <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[o.gradeKey]}`} />
                                              <span className="text-gray-700">{GRADE_LABEL_ES[o.gradeKey]}</span>
                                            </span>
                                          </td>
                                          <td className="py-3 pr-4 text-gray-700">{Number(GRADE_VALUE[o.gradeKey]).toFixed(1)}</td>
                                          <td className="py-3 pr-4 text-gray-700 whitespace-pre-wrap">{o.observation}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}

                        <p className="text-xs text-gray-500">
                          Mostrando hasta 25 evidencias por proyecto.
                        </p>
                      </div>
                    )}
                  </div>

              </div>
      </main>

      {showEditStudentModal && student ? (
        <CreateStudentModal
          onClose={() => setShowEditStudentModal(false)}
          onSubmit={handleEditStudent}
          initial={{ firstName: student.firstName, lastName: student.lastName, listNumber: student.listNumber }}
          title="Editar Estudiante"
          submitLabel="Guardar"
        />
      ) : null}
    </div>
  );
}
