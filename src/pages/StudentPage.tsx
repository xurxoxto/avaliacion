import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Clipboard, Plus } from 'lucide-react';
import { Teacher, Student, Project, TriangulationGrade, Classroom } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import TrafficButton from '../components/TrafficButton';
import { listenProjects, createProject, deleteProject } from '../utils/firestore/projects';
import { listenGradesForStudent, upsertGrade, deleteGradesForStudent } from '../utils/firestore/grades';
import { deleteGradesForProject } from '../utils/firestore/grades';
import { listenCompetencias, seedCompetenciasIfEmpty } from '../utils/firestore/competencias';
import { listenStudents, deleteStudent } from '../utils/firestore/students';
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
import { GRADE_LABEL_ES, GRADE_VALUE } from '../utils/triangulation/gradeScale';
import { useTriangulationGrades } from '../hooks/useTriangulationGrades';
import { buildAiReportPrompt, generateTermLearningReport, generateTriangulationReportFromObservations } from '../utils/triangulation/reportText';
import { GRADE_COLOR_CLASS } from '../utils/triangulation/gradeScale';

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
  const [student, setStudent] = useState<Student | null>(null);
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [competencias, setCompetencias] = useState(storage.getCompetencias());

  const [obsTemplate, setObsTemplate] = useState<string>(DEFAULT_OBS_TEMPLATE);
  const [templateDraft, setTemplateDraft] = useState<string>(DEFAULT_OBS_TEMPLATE);
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
  const [copied, setCopied] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string>('');
  const [reportMode, setReportMode] = useState<'qualitative' | 'term'>('term');
  const [reportFrom, setReportFrom] = useState<string>(() => {
    const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [reportTo, setReportTo] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
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
      map.set(g.competenciaId, g);
    }
    return map;
  }, [triGrades, selectedProjectId]);

  const tri = useTriangulationGrades({
    students: student ? [student] : [],
    competencias,
    grades: triGrades,
  });

  const allObsSorted = useMemo(() => {
    return triObs
      .slice()
      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  }, [triObs]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const evidenceStats = useMemo(() => {
    const now = Date.now();
    const cutoff = now - TRI_EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const byComp = new Map<string, TriangulationObservation[]>();
    for (const o of allObsSorted) {
      const arr = byComp.get(o.competenciaId);
      if (arr) arr.push(o);
      else byComp.set(o.competenciaId, [o]);
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
  }, [allObsSorted]);

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

  const reportRange = useMemo(() => {
    const from = (reportFrom || '').trim();
    const to = (reportTo || '').trim();

    const fromDate = from ? new Date(`${from}T00:00:00.000`) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : null;

    return {
      from: fromDate && Number.isFinite(fromDate.getTime()) ? fromDate : null,
      to: toDate && Number.isFinite(toDate.getTime()) ? toDate : null,
    };
  }, [reportFrom, reportTo]);

  const reportObs = useMemo(() => {
    const fromTs = reportRange.from ? reportRange.from.getTime() : null;
    const toTs = reportRange.to ? reportRange.to.getTime() : null;
    if (fromTs === null && toTs === null) return triObs;
    return triObs.filter(o => {
      const t = o.createdAt instanceof Date ? o.createdAt.getTime() : 0;
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t > toTs) return false;
      return true;
    });
  }, [triObs, reportRange]);

  const reportRangeLabel = useMemo(() => {
    const fmt = (d: Date) => {
      try {
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch {
        return '';
      }
    };
    if (reportRange.from && reportRange.to) return `${fmt(reportRange.from)}–${fmt(reportRange.to)}`;
    if (reportRange.from && !reportRange.to) return `Desde ${fmt(reportRange.from)}`;
    if (!reportRange.from && reportRange.to) return `Hasta ${fmt(reportRange.to)}`;
    return '';
  }, [reportRange]);

  const reportText = useMemo(() => {
    if (!student) return '';
    const studentName = `${student.firstName} ${student.lastName}`;

    if (reportMode === 'term') {
      return generateTermLearningReport({
        studentName,
        classroomGrade: classroom?.grade,
        competencias,
        observations: reportObs,
        projects,
        from: reportRange.from || undefined,
        to: reportRange.to || undefined,
        termLabel: reportRangeLabel || undefined,
      });
    }

    return generateTriangulationReportFromObservations({
      studentName,
      competencias,
      observations: reportObs,
      maxEvidencePerCompetencia: 2,
    });
  }, [student, classroom, competencias, reportObs, projects, reportMode, reportRange, reportRangeLabel]);

  const aiPromptText = useMemo(() => {
    if (!student) return '';
    const studentName = `${student.firstName} ${student.lastName}`;
    return buildAiReportPrompt({
      mode: reportMode,
      studentName,
      classroomGrade: classroom?.grade,
      termLabel: reportMode === 'term' ? (reportRangeLabel || undefined) : undefined,
      competencias,
      observations: reportObs,
      projects,
      from: reportMode === 'term' ? (reportRange.from || undefined) : undefined,
      to: reportMode === 'term' ? (reportRange.to || undefined) : undefined,
      maxObservations: 60,
    });
  }, [student, classroom, competencias, reportObs, projects, reportMode, reportRange, reportRangeLabel]);

  useEffect(() => {
    // If the user changes filters/mode, drop any AI-generated override to avoid confusion.
    setAiText('');
  }, [reportMode, reportFrom, reportTo, student?.id]);

  const finalKey = student ? tri.finalAvgKey.get(student.id) : undefined;
  const finalNumeric = student ? tri.finalAvgNumeric.get(student.id) : undefined;

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

          <button
            onClick={handleDeleteStudent}
            className="btn-secondary flex items-center justify-center gap-2"
            title="Eliminar estudiante"
          >
            <Trash2 className="w-5 h-5" />
            Eliminar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Info Card */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {student.firstName} {student.lastName}
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Número de Lista</p>
                  <p className="text-lg font-semibold text-gray-900">#{student.listNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Calificación Media</p>
                  <p className="text-lg font-semibold text-gray-900">{Number(student.averageGrade || 0).toFixed(1)}/10</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Progreso</p>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-primary-600 h-3 rounded-full transition-all"
                      style={{ width: `${Number(student.progress || 0)}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{Number(student.progress || 0)}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Observaciones</p>
                  <p className="text-lg font-semibold text-gray-900">{triObs.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Observation Form */}
          <div className="lg:col-span-2">
            {/* Triangulation (Teacher View) */}
            <div className="card mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                    <h3 className="text-xl font-bold text-gray-900">Registrar y Evaluar</h3>
                    <div className="relative mt-1 sm:mt-0">
                      <details className="group">
                        <summary className="cursor-pointer select-none text-xs font-semibold text-gray-700 hover:text-gray-900 underline">
                          Niveles
                        </summary>
                        <div className="absolute left-0 right-0 sm:left-auto sm:right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 z-10">
                          <div className="grid grid-cols-1 gap-2 text-xs text-gray-700">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.RED}`} />
                              <div>
                                <p className="font-semibold">{GRADE_LABEL_ES.RED} ({GRADE_VALUE.RED.toFixed(1)})</p>
                                <p className="text-gray-600">Discrepancia o dificultad relevante; necesita ayuda y ajuste de enseñanza.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.YELLOW}`} />
                              <div>
                                <p className="font-semibold">{GRADE_LABEL_ES.YELLOW} ({GRADE_VALUE.YELLOW.toFixed(1)})</p>
                                <p className="text-gray-600">Reproduce con apoyo/modelo; en proceso de consolidación.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.GREEN}`} />
                              <div>
                                <p className="font-semibold">{GRADE_LABEL_ES.GREEN} ({GRADE_VALUE.GREEN.toFixed(1)})</p>
                                <p className="text-gray-600">Actúa con autonomía; mantiene criterios y calidad.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS.BLUE}`} />
                              <div>
                                <p className="font-semibold">{GRADE_LABEL_ES.BLUE} ({GRADE_VALUE.BLUE.toFixed(1)})</p>
                                <p className="text-gray-600">Transfiere a contextos nuevos; aporta estrategias y ayuda a otros.</p>
                              </div>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] text-gray-500">Tip: pasa el ratón por los botones para ver el nivel.</p>
                        </div>
                      </details>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Marca el nivel y registra una evidencia breve. (Si estás online, selecciona un proyecto.)
                  </p>
                </div>
                {finalKey && (
                  <div className="text-right">
                    <p className="text-xs text-gray-600">Global (ponderado)</p>
                    <div className="inline-flex items-center gap-2">
                      <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[finalKey]}`} />
                      <span className="text-sm font-semibold text-gray-900">
                        {GRADE_LABEL_ES[finalKey]}
                        {typeof finalNumeric === 'number' ? ` (${finalNumeric.toFixed(1)})` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {!isOnline && (
                <p className="text-sm text-gray-600 mt-4">
                  Estás en modo offline. Los registros se guardarán en este dispositivo.
                </p>
              )}

              <div className="mt-4 space-y-4">
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

                <div className="space-y-4">
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

                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {reportMode === 'term' ? 'Informe de aprendizaje y progreso' : 'Informe cualitativo'}
                        </p>
                        <p className="text-xs text-gray-600">Texto listo para copiar (síntesis basada en evidencias).</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                          <button
                            type="button"
                            className={`px-3 py-1 text-xs font-semibold rounded-md ${reportMode === 'term' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                            onClick={() => setReportMode('term')}
                          >
                            Trimestral
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1 text-xs font-semibold rounded-md ${reportMode === 'qualitative' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                            onClick={() => setReportMode('qualitative')}
                          >
                            Cualitativo
                          </button>
                        </div>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-2"
                        disabled={aiBusy || !aiPromptText}
                        onClick={async () => {
                          if (!aiPromptText) return;
                          setAiBusy(true);
                          try {
                            const res = await fetch('/api/ai/report', {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({ prompt: aiPromptText }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok || !data?.text) {
                              const msg = data?.error || 'No se pudo generar el informe con IA.';
                              throw new Error(msg);
                            }
                            setAiText(String(data.text));
                          } catch (e: any) {
                            alert(e?.message || 'No se pudo generar el informe con IA.');
                          } finally {
                            setAiBusy(false);
                          }
                        }}
                      >
                        <Clipboard className="w-5 h-5" />
                        {aiBusy ? 'IA…' : 'IA'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-2"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(aiPromptText);
                            setAiCopied(true);
                            window.setTimeout(() => setAiCopied(false), 2000);
                          } catch {
                            alert('No se pudo copiar al portapapeles.');
                          }
                        }}
                      >
                        <Clipboard className="w-5 h-5" />
                        {aiCopied ? 'Prompt copiado' : 'Copiar Prompt'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-2"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(aiText || reportText);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 2000);
                          } catch {
                            alert('No se pudo copiar al portapapeles.');
                          }
                        }}
                      >
                        <Clipboard className="w-5 h-5" />
                        {copied ? 'Copiado' : 'Copiar Informe'}
                      </button>
                      </div>
                    </div>

                    {reportMode === 'term' && (
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">Desde</span>
                          <input
                            type="date"
                            className="input-field h-9 py-1"
                            value={reportFrom}
                            onChange={(e) => setReportFrom(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">Hasta</span>
                          <input
                            type="date"
                            className="input-field h-9 py-1"
                            value={reportTo}
                            onChange={(e) => setReportTo(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-gray-500 sm:ml-auto">{reportObs.length} evidencias en el rango</p>
                      </div>
                    )}
                    <textarea className="input-field mt-3" rows={reportMode === 'term' ? 12 : 6} readOnly value={aiText || reportText} />
                  </div>
                </div>
              </div>

            <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Resumen rápido por competencia</p>
                  <p className="text-xs text-gray-600">Última evidencia y confianza (últimos {TRI_EVIDENCE_WINDOW_DAYS} días).</p>
                </div>
              </div>

              {competencias.length === 0 ? (
                <p className="text-sm text-gray-600 mt-3">No hay competencias configuradas.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {competencias.map((c) => {
                    const latest = evidenceStats.latestByComp.get(c.id);
                    const recentCount = evidenceStats.recentCountByComp.get(c.id) || 0;
                    const conf = evidenceStats.confidenceByComp.get(c.id) || 'Baja';
                    const needsReview = evidenceStats.needsReviewByComp.get(c.id) || false;
                    const dt = latest?.createdAt instanceof Date ? formatDateEs(latest.createdAt) : '—';
                    const projName = latest?.projectId
                      ? (latest.projectId === 'local' ? 'Offline' : (projectNameById.get(latest.projectId) || 'Proyecto eliminado'))
                      : '—';
                    const author = latest?.teacherName || latest?.teacherEmail || '—';
                    const snippet = latest?.observation
                      ? String(latest.observation).replace(/\s+/g, ' ').trim().slice(0, 90)
                      : '';

                    const confClass = conf === 'Alta'
                      ? 'bg-green-50 text-green-800 border-green-200'
                      : conf === 'Media'
                        ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                        : 'bg-gray-50 text-gray-800 border-gray-200';

                    return (
                      <div key={c.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.code}: {c.name}</p>
                          <p className="text-xs text-gray-600 truncate">
                            {latest ? (
                              <>
                                {dt} · {projName} · {author}
                              </>
                            ) : (
                              <>Sin evidencias aún</>
                            )}
                          </p>
                          {snippet ? (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">“{snippet}{latest!.observation.length > 90 ? '…' : ''}”</p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${confClass}`}>
                            Confianza: {conf} ({recentCount})
                          </span>
                          {needsReview && (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
                              Revisar en equipo
                            </span>
                          )}
                          {latest && (
                            <span className="inline-flex items-center gap-2">
                              <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[latest.gradeKey]}`} />
                              <span className="text-xs text-gray-700">{GRADE_LABEL_ES[latest.gradeKey]}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
