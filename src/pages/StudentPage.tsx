import { useMemo, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, FileText, Calendar, Trash2, Clipboard, Plus } from 'lucide-react';
import { Teacher, Student, EvaluationEntry, Project, TriangulationGrade } from '../types';
import { storage } from '../utils/storage';
import { useRemoteRefresh } from '../utils/useRemoteRefresh';
import Header from '../components/Header';
import TrafficButton from '../components/TrafficButton';
import { listenProjects, createProject, deleteProject } from '../utils/firestore/projects';
import { listenGradesForStudent, upsertGrade, deleteGradesForStudent } from '../utils/firestore/grades';
import { deleteGradesForProject } from '../utils/firestore/grades';
import { listenCompetencias } from '../utils/firestore/competencias';
import {
  addTriangulationObservation,
  deleteTriangulationObservationsForProject,
  deleteTriangulationObservationsForStudent,
  listenTriangulationObservationsForStudent,
} from '../utils/firestore/triangulationObservations';
import type { GradeKey, TriangulationObservation } from '../types';
import { GRADE_LABEL_ES, GRADE_VALUE } from '../utils/triangulation/gradeScale';
import { useTriangulationGrades } from '../hooks/useTriangulationGrades';
import { generateTriangulationReportFromObservations } from '../utils/triangulation/reportText';
import { GRADE_COLOR_CLASS } from '../utils/triangulation/gradeScale';

const TRI_EVIDENCE_WINDOW_DAYS = 45;
const TRI_DISAGREE_LAST_N = 4;
const GRADE_ORDER: Record<GradeKey, number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
  BLUE: 3,
};

const DEFAULT_OBS_TEMPLATE = `Evidencia (qué se vio):
Interpretación (qué significa):
Siguiente paso (qué haremos):`;

interface StudentPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function StudentPage({ teacher, onLogout }: StudentPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationEntry[]>([]);
  const [selectedCompetencia, setSelectedCompetencia] = useState('');
  const [selectedSubCompetencia, setSelectedSubCompetencia] = useState('');
  const [rating, setRating] = useState(5);
  const [observation, setObservation] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<FileList | null>(null);
  const [competencias, setCompetencias] = useState(storage.getCompetencias());

  const [obsTemplate, setObsTemplate] = useState<string>(DEFAULT_OBS_TEMPLATE);
  const [templateDraft, setTemplateDraft] = useState<string>(DEFAULT_OBS_TEMPLATE);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [triGrades, setTriGrades] = useState<TriangulationGrade[]>([]);
  const [triObs, setTriObs] = useState<TriangulationObservation[]>([]);
  const [pendingGradeByComp, setPendingGradeByComp] = useState<Record<string, GradeKey | null>>({});
  const [obsTextByComp, setObsTextByComp] = useState<Record<string, string>>({});
  const [subByComp, setSubByComp] = useState<Record<string, string>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [copied, setCopied] = useState(false);
  const creatingDefaultProject = useRef(false);

  useEffect(() => {
    if (id) {
      loadStudent(id);
      loadEvaluations(id);
    }
  }, [id]);

  useEffect(() => {
    if (!teacher.workspaceId) {
      setCompetencias(storage.getCompetencias());
      return;
    }
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

  useRemoteRefresh(() => {
    if (id) {
      loadStudent(id);
      loadEvaluations(id);
    }
    if (!teacher.workspaceId) setCompetencias(storage.getCompetencias());
  });

  useEffect(() => {
    if (!teacher.workspaceId) {
      // Ensure we always reflect the latest editable competencias (offline/local mode)
      setCompetencias(storage.getCompetencias());
    }
  }, []);

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

  const loadStudent = (studentId: string) => {
    const allStudents = storage.getStudents();
    const found = allStudents.find(s => s.id === studentId);
    setStudent(found || null);
  };

  const loadEvaluations = (studentId: string) => {
    const allEvaluations = storage.getEvaluations();
    const studentEvaluations = allEvaluations.filter(e => e.studentId === studentId);
    setEvaluations(studentEvaluations);
  };

  const handleDeleteStudent = () => {
    if (!student) return;
    const ok = confirm(`Eliminar a ${student.firstName} ${student.lastName} y todas sus observaciones? Esta acción no se puede deshacer.`);
    if (!ok) return;

    // Remove triangulation grades (Firestore)
    if (teacher.workspaceId) {
      deleteGradesForStudent(teacher.workspaceId, student.id).catch(() => {
        // Continue local delete even if remote delete fails
      });

      deleteTriangulationObservationsForStudent(teacher.workspaceId, student.id).catch(() => {
        // Continue local delete even if remote delete fails
      });
    }

    // Remove student (local)
    const remainingStudents = storage.getStudents().filter(s => s.id !== student.id);
    storage.saveStudents(remainingStudents);

    // Remove evaluations for that student
    const remainingEvaluations = storage.getEvaluations().filter(e => e.studentId !== student.id);
    storage.saveEvaluations(remainingEvaluations);

    // Update classroom count
    const allClassrooms = storage.getClassrooms();
    const count = remainingStudents.filter(s => s.classroomId === student.classroomId).length;
    const updatedClassrooms = allClassrooms.map(c =>
      c.id === student.classroomId ? { ...c, studentCount: count, updatedAt: new Date() } : c
    );
    storage.saveClassrooms(updatedClassrooms);

    navigate(`/classroom/${student.classroomId}`);
  };

  const handleSaveObservation = () => {
    if (!student || !selectedCompetencia || !observation.trim()) {
      alert('Por favor completa todos los campos');
      return;
    }

    const newEvaluation: EvaluationEntry = {
      id: `eval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      studentId: student.id,
      competenciaId: selectedCompetencia,
      subCompetenciaId: selectedSubCompetencia || undefined,
      rating,
      observation: observation.trim(),
      date: new Date(),
      evidenceUrls: evidenceFiles ? Array.from(evidenceFiles).map(f => f.name) : [],
    };

    const allEvaluations = storage.getEvaluations();
    const updatedEvaluations = [...allEvaluations, newEvaluation];
    storage.saveEvaluations(updatedEvaluations);
    setEvaluations([...evaluations, newEvaluation]);

    // Update student average grade
    const studentEvals = updatedEvaluations.filter(e => e.studentId === student.id);
    const avgGrade = studentEvals.reduce((sum, e) => sum + e.rating, 0) / studentEvals.length;
    const progress = Math.min(100, (studentEvals.length / 20) * 100);

    const allStudents = storage.getStudents();
    const updatedStudents = allStudents.map(s =>
      s.id === student.id
        ? { ...s, averageGrade: avgGrade, progress, updatedAt: new Date() }
        : s
    );
    storage.saveStudents(updatedStudents);
    setStudent({ ...student, averageGrade: avgGrade, progress });

    // Reset form
    setObservation('');
    setRating(5);
    setEvidenceFiles(null);
    setSelectedSubCompetencia('');
    alert('Observación guardada correctamente');
  };

  const getRatingLabel = (rating: number) => {
    if (rating >= 9) return 'Excelente';
    if (rating >= 7) return 'Bueno';
    if (rating >= 5) return 'Suficiente';
    return 'Insuficiente';
  };

  const selectedCompetenciaObj = competencias.find(c => c.id === selectedCompetencia);
  const subCompetencias = selectedCompetenciaObj?.subCompetencias || [];

  const clampRating = (value: number) => Math.max(1, Math.min(10, value));

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

  const reportText = useMemo(() => {
    if (!student) return '';
    return generateTriangulationReportFromObservations({
      studentName: `${student.firstName} ${student.lastName}`,
      competencias,
      observations: triObs,
      maxEvidencePerCompetencia: 2,
    });
  }, [student, competencias, triObs]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
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
                  <p className="text-lg font-semibold text-gray-900">{evaluations.length}</p>
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
                  <h3 className="text-xl font-bold text-gray-900">Triangulación</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Selecciona un proyecto, marca el nivel y registra una observación.
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

              {!teacher.workspaceId ? (
                <p className="text-sm text-gray-600 mt-4">Inicia sesión para usar triangulación en tiempo real.</p>
              ) : (
                <div className="mt-4 space-y-4">
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

                  <div className="space-y-4">
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Plantilla de observación (personal)</p>
                          <p className="text-xs text-gray-600">Se inserta automáticamente cuando el campo está vacío.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              setTemplateDraft(obsTemplate);
                              setShowTemplateEditor(v => !v);
                            }}
                          >
                            {showTemplateEditor ? 'Cerrar' : 'Editar plantilla'}
                          </button>
                        </div>
                      </div>

                      {showTemplateEditor && (
                        <div className="mt-3">
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
                              Guardar plantilla
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

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
                                  Evidencias {TRI_EVIDENCE_WINDOW_DAYS}d: <span className="font-semibold text-gray-800">{recentCount}</span>
                                </span>
                                <span className="text-xs text-gray-600">
                                  · Confianza: <span className="font-semibold text-gray-800">{conf}</span>
                                </span>
                                {needsReview && (
                                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
                                    Revisar en equipo
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3">
                            <TrafficButton
                              value={pending}
                              disabled={!selectedProjectId}
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
                            <label className="block text-xs font-medium text-gray-700 mb-1">Observación</label>
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
                            <p className="text-xs text-gray-500 mt-1">Con 1–2 frases basta: evidencia + siguiente paso. (Interpretación opcional)</p>
                          </div>

                          <div className="mt-3 flex items-center justify-end">
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={!selectedProjectId || !pending || !(obsTextByComp[c.id] || '').trim()}
                              onClick={() => {
                                if (!teacher.workspaceId || !selectedProjectId || !pending) return;
                                const txt = (obsTextByComp[c.id] || '').trim();
                                if (!txt) return;

                                // Persist the current level for the project/competencia
                                upsertGrade({
                                  workspaceId: teacher.workspaceId,
                                  studentId: student.id,
                                  projectId: selectedProjectId,
                                  competenciaId: c.id,
                                  gradeKey: pending,
                                }).catch(() => {
                                  // non-fatal; keep trying to record observation anyway
                                });

                                addTriangulationObservation({
                                  workspaceId: teacher.workspaceId,
                                  studentId: student.id,
                                  projectId: selectedProjectId,
                                  competenciaId: c.id,
                                  subCompetenciaId: (subByComp[c.id] || '') || undefined,
                                  gradeKey: pending,
                                  observation: txt,
                                  teacherId: teacher.id,
                                  teacherName: teacher.name,
                                  teacherEmail: teacher.email,
                                })
                                  .then(() => {
                                    setObsTextByComp(prev => ({ ...prev, [c.id]: '' }));
                                  })
                                  .catch(() => {
                                    alert('No se pudo guardar la observación.');
                                  });
                              }}
                            >
                              <Save className="w-5 h-5 inline-block mr-2" />
                              Registrar
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
                          const title = proj?.name || (pid === 'unknown' ? 'Proyecto' : 'Proyecto eliminado');
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
                                      <p className="text-xs text-gray-600 mt-1">Puntuación: {Number(o.numericValue ?? GRADE_VALUE[o.gradeKey]).toFixed(1)}</p>
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
                                          <td className="py-3 pr-4 text-gray-700">{Number(o.numericValue ?? GRADE_VALUE[o.gradeKey]).toFixed(1)}</td>
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
                        <p className="text-sm font-semibold text-gray-900">Informe triangulado</p>
                        <p className="text-xs text-gray-600">Texto listo para copiar (basado en evidencias).</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-2"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(reportText);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1200);
                          } catch {
                            alert('No se pudo copiar al portapapeles.');
                          }
                        }}
                      >
                        <Clipboard className="w-5 h-5" />
                        {copied ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <textarea className="input-field mt-3" rows={6} readOnly value={reportText} />
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Nueva Observación</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="competencia" className="block text-sm font-medium text-gray-700 mb-2">
                    Competencia Clave
                  </label>
                  <select
                    id="competencia"
                    value={selectedCompetencia}
                    onChange={(e) => {
                      setSelectedCompetencia(e.target.value);
                      setSelectedSubCompetencia('');
                    }}
                    className="input-field"
                  >
                    <option value="">Seleccionar competencia...</option>
                    {competencias.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.code}: {comp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCompetenciaObj && subCompetencias.length > 0 && (
                  <div>
                    <label htmlFor="subcompetencia" className="block text-sm font-medium text-gray-700 mb-2">
                      Sub-competencia (opcional)
                    </label>
                    <select
                      id="subcompetencia"
                      value={selectedSubCompetencia}
                      onChange={(e) => setSelectedSubCompetencia(e.target.value)}
                      className="input-field"
                    >
                      <option value="">Sin sub-competencia</option>
                      {subCompetencias.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {(sub.code ? sub.code + ': ' : '') + sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-2">
                    Valoración: {rating}/10 - {getRatingLabel(rating)}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="btn-secondary px-4"
                      onClick={() => setRating(r => clampRating(r - 1))}
                      aria-label="Bajar valoración"
                    >
                      -
                    </button>
                    <div className="flex-1 border border-gray-200 rounded-lg px-4 py-3 bg-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-600">Valoración</p>
                          <p className="text-2xl font-bold text-gray-900">{rating}/10</p>
                        </div>
                        <p className="text-sm font-semibold text-gray-700">{getRatingLabel(rating)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary px-4"
                      onClick={() => setRating(r => clampRating(r + 1))}
                      aria-label="Subir valoración"
                    >
                      +
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <button type="button" className="btn-secondary" onClick={() => setRating(4)}>
                      Insuficiente (4)
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setRating(6)}>
                      Suficiente (6)
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setRating(8)}>
                      Bueno (8)
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setRating(10)}>
                      Excelente (10)
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="observation" className="block text-sm font-medium text-gray-700 mb-2">
                    Observación
                  </label>
                  <textarea
                    id="observation"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    className="input-field"
                    rows={4}
                    onFocus={() => setObservation(prev => applyTemplateIfEmpty(prev))}
                    placeholder={obsTemplate}
                  />
                  <p className="text-xs text-gray-500 mt-1">Estructura recomendada para que el informe final sea rápido y coherente.</p>
                </div>

                <div>
                  <label htmlFor="evidence" className="block text-sm font-medium text-gray-700 mb-2">
                    Evidencias (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="evidence"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => setEvidenceFiles(e.target.files)}
                      className="hidden"
                    />
                    <label
                      htmlFor="evidence"
                      className="btn-secondary cursor-pointer flex items-center gap-2"
                    >
                      <Upload className="w-5 h-5" />
                      Subir archivos
                    </label>
                    {evidenceFiles && evidenceFiles.length > 0 && (
                      <span className="text-sm text-gray-600">
                        {evidenceFiles.length} archivo(s) seleccionado(s)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSaveObservation}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Guardar Observación
                </button>
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
                    const projName = latest?.projectId ? (projectNameById.get(latest.projectId) || 'Proyecto eliminado') : '—';
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

            {/* Evaluations History */}
            <div className="card mt-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Historial de Observaciones</h3>

              {evaluations.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No hay observaciones registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {evaluations
                    .sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime())
                    .map((evaluation) => {
                      const competencia = competencias.find(c => c.id === evaluation.competenciaId);
                      const sub = competencia?.subCompetencias?.find(s => s.id === evaluation.subCompetenciaId);
                      return (
                        <div key={evaluation.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {competencia?.code}: {competencia?.name}
                              </h4>
                              {sub && (
                                <p className="text-sm text-gray-700 mt-1">
                                  {(sub.code ? sub.code + ': ' : '') + sub.name}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-600">
                                  {formatDateEs(evaluation.date)}
                                </span>
                              </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              evaluation.rating >= 9 ? 'bg-green-100 text-green-800' :
                              evaluation.rating >= 7 ? 'bg-yellow-100 text-yellow-800' :
                              evaluation.rating >= 5 ? 'bg-blue-100 text-blue-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {evaluation.rating}/10
                            </span>
                          </div>
                          <p className="text-gray-700 mt-2">{evaluation.observation}</p>
                          {evaluation.evidenceUrls && evaluation.evidenceUrls.length > 0 && (
                            <div className="mt-2 text-sm text-gray-600">
                              📎 {evaluation.evidenceUrls.length} archivo(s) adjunto(s)
                            </div>
                          )}
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
