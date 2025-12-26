import { useMemo, useRef, useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, X, Plus } from 'lucide-react';
import { Teacher, Student, Classroom, EvidenceNote, CriterionEvaluation, TaskEvaluation, SituationEvaluation, LearningSituation } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import TrafficButton from '../components/TrafficButton';
import CreateStudentModal from '../components/CreateStudentModal';
import AIReportGenerator from '../components/AIReportGenerator';
import { useCompetencyCalculator } from '../hooks/useCompetencyCalculator';
import { listenCompetencias, seedCompetenciasIfEmpty } from '../utils/firestore/competencias';
import { listenStudents, deleteStudent, updateStudent } from '../utils/firestore/students';
import { listenClassrooms } from '../utils/firestore/classrooms';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { GradeKey } from '../types';
import { GRADE_LABEL_ES, GRADE_VALUE, gradeKeyFromNumeric } from '../utils/triangulation/gradeScale';
import { GRADE_COLOR_CLASS } from '../utils/triangulation/gradeScale';
import { normalizeCompetenceCode } from '../data/competencias';
import { getCriteriosPuenteTerminal } from '../data/criteriosPuenteTerminal';
import { addEvidenceNote, deleteEvidenceNotesForStudent, listenEvidenceNotesForStudent } from '../lib/firestore/services/evidenceNotesService';
import { deleteTaskEvaluationsForStudent } from '../lib/firestore/services/taskEvaluationsService';
import type { Criterion } from '../logic/criteria/types';
import { buildCriteriaIndex, listenCriteria } from '../lib/firestore/services/criteriaService';
import { addCriterionEvaluation, listenAllCriterionEvaluations, listenCriterionEvaluationsForStudent } from '../lib/firestore/services/criterionEvaluationsService';
import { listenTaskEvaluationsForStudent } from '../lib/firestore/services/taskEvaluationsService';
import { listenEvaluationsForStudent } from '../lib/firestore/services/evaluationsService';
import { listenLearningSituations } from '../lib/firestore/services/learningSituationsService';
import { computeDoScoresEvolutive } from '../logic/do/doCalculator';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  listenWorkspaceSettings,
  normalizeWorkspaceSettings,
  type WorkspaceSettings,
} from '../lib/firestore/services/workspaceSettingsService';

const RadarCompetencyChart = lazy(() => import('../components/RadarCompetencyChart'));

const TRI_EVIDENCE_WINDOW_DAYS = 45;
const TRI_DISAGREE_LAST_N = 4;
const GRADE_ORDER: Record<GradeKey, number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
  BLUE: 3,
};

const SCORE_BY_GRADE: Record<GradeKey, number> = {
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  BLUE: 4,
};

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
  const [students, setStudents] = useState<Student[]>(storage.getStudents());
  const [competencias, setCompetencias] = useState(storage.getCompetencias());
  const criterios = useMemo(() => getCriteriosPuenteTerminal(), []);
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

      // If it's a criteriaId, resolve to its DO competencies
      const crit = criterios.find(c => c.id === v);
      if (crit) {
        // Return the first DO as competency (simplified)
        const firstDo = crit.descriptores[0];
        if (firstDo) {
          const normalized = normalizeCompetenceCode(firstDo);
          const mapped = competenciaIdByCode.get(normalized);
          if (mapped) return mapped;
        }
      }

      const normalized = normalizeCompetenceCode(v);
      const mapped = competenciaIdByCode.get(normalized);
      if (mapped) return mapped;

      // Legacy fallback (pre-LOMLOE defaults used codes like C1..C7)
      const legacy = /^C([1-7])$/i.exec(v);
      if (legacy) return `c${legacy[1]}`;

      return null;
    };
  }, [competenciaIdByCode, competenciaIdSet, criterios]);

  const obsSectionRef = useRef<HTMLDivElement | null>(null);
  const didAutoFocusObsRef = useRef(false);

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
      const quick = el.querySelector<HTMLTextAreaElement>('textarea[data-quick-evidence-input="true"]');
      if (quick) {
        quick.focus();
        return;
      }
    }, 60);
  }, [focusObs, competencias.length]);

  const [evidenceNotes, setEvidenceNotes] = useState<EvidenceNote[]>([]);
  const [quickEvidenceCompSearch, setQuickEvidenceCompSearch] = useState('');
  const [quickEvidenceCompetenciaIds, setQuickEvidenceCompetenciaIds] = useState<string[]>([]);
  const [quickEvidenceGradeKey, setQuickEvidenceGradeKey] = useState<GradeKey | null>(null);
  const [quickEvidenceText, setQuickEvidenceText] = useState('');
  const [quickEvidenceSaving, setQuickEvidenceSaving] = useState(false);

  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [criterionEvaluations, setCriterionEvaluations] = useState<CriterionEvaluation[]>([]);
  const [allCriterionEvaluations, setAllCriterionEvaluations] = useState<CriterionEvaluation[]>([]);

  // Estados para el generador de informes con IA
  const [taskEvaluations, setTaskEvaluations] = useState<TaskEvaluation[]>([]);
  const [situationEvaluations, setSituationEvaluations] = useState<SituationEvaluation[]>([]);
  const [learningSituations, setLearningSituations] = useState<LearningSituation[]>([]);

  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(() => {
    const local = storage.getWorkspaceSettings<WorkspaceSettings>();
    return normalizeWorkspaceSettings(local || DEFAULT_WORKSPACE_SETTINGS);
  });

  const [criterionModalOpen, setCriterionModalOpen] = useState(false);
  const [criterionQuery, setCriterionQuery] = useState('');
  const [selectedCriterionId, setSelectedCriterionId] = useState('');
  const [criterionGradeKey, setCriterionGradeKey] = useState<GradeKey | null>(null);
  const [criterionSaving, setCriterionSaving] = useState(false);

  useEffect(() => {
    if (!teacher.workspaceId || !id) return;

    const unsubStudents = listenStudents(teacher.workspaceId, (remoteStudents) => {
      storage.saveStudents(remoteStudents);
      setStudents(remoteStudents);
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
    if (!teacher.workspaceId) return;
    const unsub = listenCriteria(teacher.workspaceId, (items) => setCriteria(items));
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    const unsub = listenWorkspaceSettings(teacher.workspaceId, (s) => {
      setWorkspaceSettings(s);
      storage.saveWorkspaceSettings(s);
    });
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    if (!teacher.workspaceId || !id) return;
    const unsub = listenCriterionEvaluationsForStudent(teacher.workspaceId, id, (items) => setCriterionEvaluations(items));
    return () => unsub();
  }, [teacher.workspaceId, id]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    const unsub = listenAllCriterionEvaluations(teacher.workspaceId, (items) => setAllCriterionEvaluations(items));
    return () => unsub();
  }, [teacher.workspaceId]);

  // Listeners para el generador de informes con IA
  useEffect(() => {
    if (!teacher.workspaceId || !id) return;
    const unsub = listenTaskEvaluationsForStudent(teacher.workspaceId, id, (items) => setTaskEvaluations(items));
    return () => unsub();
  }, [teacher.workspaceId, id]);

  useEffect(() => {
    if (!teacher.workspaceId || !id) return;
    const unsub = listenEvaluationsForStudent(teacher.workspaceId, id, (items) => setSituationEvaluations(items));
    return () => unsub();
  }, [teacher.workspaceId, id]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    const unsub = listenLearningSituations(teacher.workspaceId, (items) => setLearningSituations(items));
    return () => unsub();
  }, [teacher.workspaceId]);

  const resolvedClassroomId = useMemo(() => {
    return String(classroomId || student?.classroomId || '').trim();
  }, [classroomId, student?.classroomId]);

  const classroomStudents = useMemo(() => {
    if (!resolvedClassroomId) return [];
    return students.filter((s) => s.classroomId === resolvedClassroomId);
  }, [students, resolvedClassroomId]);

  const criteriaIndex = useMemo(() => buildCriteriaIndex(criteria), [criteria]);

  const doScoresByStudentId = useMemo(() => {
    const evaluations = (allCriterionEvaluations || []).map((e) => {
      const at = (e.updatedAt instanceof Date ? e.updatedAt : null) || (e.createdAt instanceof Date ? e.createdAt : null) || new Date();
      return {
        studentId: e.studentId,
        criterionId: e.criterionId,
        score: e.score,
        at,
      };
    });
    const w5 = workspaceSettings.evolutiveWeights.w5;
    const w6 = workspaceSettings.evolutiveWeights.w6;
    return computeDoScoresEvolutive({ evaluations, criteriaIndex, courseWeights: { 5: w5, 6: w6 } });
  }, [allCriterionEvaluations, criteriaIndex, workspaceSettings.evolutiveWeights.w5, workspaceSettings.evolutiveWeights.w6]);

  const radarLabels = useMemo(() => ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE', 'CCEC'] as const, []);

  const radarStudent = useMemo(() => {
    if (!id) return {} as Record<(typeof radarLabels)[number], number>;
    const byDo = doScoresByStudentId.get(id);
    if (!byDo) return {} as Record<(typeof radarLabels)[number], number>;

    const out: Partial<Record<(typeof radarLabels)[number], { sum: number; count: number }>> = {};
    for (const [code, v] of byDo.entries()) {
      const avg = typeof v.average === 'number' ? v.average : 0;
      if (!Number.isFinite(avg) || avg <= 0) continue;
      for (const p of radarLabels) {
        if (!String(code).toUpperCase().startsWith(p)) continue;
        const prev = out[p] || { sum: 0, count: 0 };
        prev.sum += avg;
        prev.count += 1;
        out[p] = prev;
      }
    }

    const final: Partial<Record<(typeof radarLabels)[number], number>> = {};
    for (const p of radarLabels) {
      const v = out[p];
      final[p] = v && v.count > 0 ? v.sum / v.count : 0;
    }
    return final;
  }, [id, doScoresByStudentId, radarLabels]);

  const radarGroup = useMemo(() => {
    const out: Partial<Record<(typeof radarLabels)[number], { sum: number; count: number }>> = {};
    const ids = new Set(classroomStudents.map((s) => s.id));
    if (ids.size === 0) return {} as Partial<Record<(typeof radarLabels)[number], number>>;

    for (const studentId of ids) {
      const byDo = doScoresByStudentId.get(studentId);
      if (!byDo) continue;
      for (const [code, v] of byDo.entries()) {
        const avg = typeof v.average === 'number' ? v.average : 0;
        if (!Number.isFinite(avg) || avg <= 0) continue;
        const upper = String(code).toUpperCase();
        for (const p of radarLabels) {
          if (!upper.startsWith(p)) continue;
          const prev = out[p] || { sum: 0, count: 0 };
          prev.sum += avg;
          prev.count += 1;
          out[p] = prev;
        }
      }
    }

    const final: Partial<Record<(typeof radarLabels)[number], number>> = {};
    for (const p of radarLabels) {
      const v = out[p];
      final[p] = v && v.count > 0 ? v.sum / v.count : 0;
    }
    return final;
  }, [classroomStudents, doScoresByStudentId, radarLabels]);

  useEffect(() => {
    if (!teacher.workspaceId || !id) return;

    const unsubEvidenceNotes = listenEvidenceNotesForStudent(teacher.workspaceId, id, (items) => {
      setEvidenceNotes(items);
    });

    return () => {
      unsubEvidenceNotes();
    };
  }, [teacher.workspaceId, id]);

  const filteredQuickEvidenceCompetencias = useMemo(() => {
    const q = normalizeCompetenceCode(quickEvidenceCompSearch);
    if (!q) return [];
    return competencias
      .filter((c) => {
        const hay = normalizeCompetenceCode(`${c.code} ${c.name} ${c.description || ''}`);
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [competencias, quickEvidenceCompSearch]);

  const selectedQuickEvidenceCompetencias = useMemo(() => {
    const set = new Set(quickEvidenceCompetenciaIds);
    return competencias.filter((c) => set.has(c.id));
  }, [competencias, quickEvidenceCompetenciaIds]);

  const saveQuickEvidence = async () => {
    if (!student) return;
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Inicia sesión para guardar y sincronizar.');
      return;
    }

    const text = String(quickEvidenceText || '').trim();
    if (!text) {
      alert('Escribe una evidencia breve.');
      return;
    }
    if (!quickEvidenceGradeKey) {
      alert('Selecciona un nivel (color).');
      return;
    }
    if (quickEvidenceCompetenciaIds.length === 0) {
      alert('Selecciona al menos una competencia.');
      return;
    }

    setQuickEvidenceSaving(true);
    try {
      await addEvidenceNote({
        workspaceId,
        studentId: student.id,
        competenciaIds: quickEvidenceCompetenciaIds,
        gradeKey: quickEvidenceGradeKey,
        text,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
      });
      // Prefer "limpio": no tener que borrar manualmente.
      setQuickEvidenceText('');
      setQuickEvidenceCompSearch('');
      setQuickEvidenceCompetenciaIds([]);
      setQuickEvidenceGradeKey(null);
    } catch (err) {
      console.error('addEvidenceNote failed', err);
      alert('No se pudo guardar la evidencia rápida.');
    } finally {
      setQuickEvidenceSaving(false);
    }
  };

  const selectedCriterion = useMemo(() => {
    if (!selectedCriterionId) return null;
    return criteria.find((c) => c.id === selectedCriterionId) || null;
  }, [criteria, selectedCriterionId]);

  const filteredCriteria = useMemo(() => {
    const q = String(criterionQuery || '').trim().toLowerCase();
    const course = (student as any)?.level;
    const hasCourse = course === 5 || course === 6;

    const pool = hasCourse ? criteria.filter((c) => c.course === course) : criteria;
    if (!q) return pool.slice(0, 20);

    return pool
      .filter((c) => {
        const hay = `${c.id} ${c.area} ${c.text} ${(c.descriptorCodes || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [criteria, criterionQuery, student]);

  const resetCriterionModal = () => {
    setCriterionQuery('');
    setSelectedCriterionId('');
    setCriterionGradeKey(null);
    setCriterionSaving(false);
  };

  const openCriterionModal = () => {
    resetCriterionModal();
    setCriterionModalOpen(true);
  };

  const closeCriterionModal = () => {
    setCriterionModalOpen(false);
    setCriterionSaving(false);
  };

  const saveCriterionEvaluation = async () => {
    if (!student) return;
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Inicia sesión para guardar y sincronizar.');
      return;
    }
    if (!selectedCriterionId) {
      alert('Selecciona un criterio.');
      return;
    }
    if (!criterionGradeKey) {
      alert('Selecciona un nivel (color).');
      return;
    }

    setCriterionSaving(true);
    try {
      await addCriterionEvaluation({
        workspaceId,
        studentId: student.id,
        criterionId: selectedCriterionId,
        score: SCORE_BY_GRADE[criterionGradeKey],
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
      });
      closeCriterionModal();
    } catch (e) {
      console.error('addCriterionEvaluation failed', e);
      alert('No se pudo guardar la evaluación por criterio.');
      setCriterionSaving(false);
    }
  };

  const breadcrumbItems = useMemo(() => {
    if (!classroom || !student) return [];
    return [
      { label: classroom.name, path: `/classroom/${classroom.id}` },
      { label: `${student.firstName} ${student.lastName}`, path: `/classroom/${classroom.id}/student/${student.id}` },
    ];
  }, [classroom, student]);

  const handleDeleteStudent = () => {
    if (!student) return;
    const ok = confirm(`Eliminar a ${student.firstName} ${student.lastName}? Esta acción no se puede deshacer.`);
    if (!ok) return;

    const workspaceId = teacher.workspaceId;
    if (!workspaceId) return;

    const studentId = student.id;
    Promise.all([
      deleteTaskEvaluationsForStudent(workspaceId, studentId),
      deleteEvidenceNotesForStudent(workspaceId, studentId),
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

  const handleEditStudent = async (form: Pick<Student, 'firstName' | 'lastName' | 'listNumber' | 'level'>) => {
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
        level: form.level,
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

  const taskCompetency = useCompetencyCalculator({
    workspaceId: teacher.workspaceId,
    studentId: id,
    resolveCompetenciaId,
  });

  const taskGlobal = useMemo(() => {
    const items = Array.from(taskCompetency.computedByCompetency.values());
    if (items.length === 0) return null;
    const totalCount = items.reduce((acc, x) => acc + (typeof x.count === 'number' ? x.count : 0), 0);

    const totalWeight = items.reduce(
      (acc, x) => acc + (typeof (x as any).weightTotal === 'number' ? Math.max(0, (x as any).weightTotal) : 0),
      0
    );
    const sumWeighted = items.reduce((acc, x) => {
      const w = typeof (x as any).weightTotal === 'number' ? Math.max(0, (x as any).weightTotal) : 0;
      const v = typeof x.average === 'number' ? x.average : 0;
      return acc + v * w;
    }, 0);

    // If weights are missing/0 (older data), fallback to the previous behavior: weight by count.
    const sumByCount = items.reduce(
      (acc, x) => acc + (typeof x.average === 'number' ? x.average : 0) * (typeof x.count === 'number' ? x.count : 0),
      0
    );

    const avg =
      totalWeight > 0
        ? sumWeighted / totalWeight
        : totalCount > 0
          ? sumByCount / totalCount
          : items.reduce((a, x) => a + x.average, 0) / items.length;
    const safeAvg = Number.isFinite(avg) ? avg : 0;
    return {
      average: safeAvg,
      gradeKey: gradeKeyFromNumeric(safeAvg),
      competencyCount: items.length,
      evidenceCount: totalCount,
    };
  }, [taskCompetency.computedByCompetency]);

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
        const compId = resolveCompetenciaId((l as any)?.criteriaId);
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

    for (const n of taskCompetency.evidenceNotes) {
      const at = n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt);
      if (!Number.isFinite(at.getTime())) continue;
      const ids = Array.from(new Set((n.competenciaIds || []).map(String).map((s) => s.trim()).filter(Boolean)));
      for (const compRaw of ids) {
        const compId = resolveCompetenciaId(compRaw);
        if (!compId) continue;
        const arr = byComp.get(compId);
        const item: TaskEv = {
          at,
          rating: n.gradeKey,
          numericalValue: typeof n.numericValue === 'number' ? n.numericValue : (GRADE_VALUE as any)[n.gradeKey] ?? 0,
          observation: typeof n.text === 'string' ? n.text : '',
          teacherName: typeof n.teacherName === 'string' ? n.teacherName : undefined,
          teacherEmail: typeof n.teacherEmail === 'string' ? n.teacherEmail : undefined,
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
  }, [taskCompetency.evaluations, taskCompetency.evidenceNotes, resolveCompetenciaId]);

  const taskHistoryItems = useMemo(() => {
    type TaskHistoryItem = {
      key: string;
      at: Date;
      competencyCodes: string;
      teacherLabel: string;
      rating: GradeKey;
      score: number;
      observation: string;
      taskId: string;
      learningSituationId: string;
    };

    const codeByCompetenciaId = new Map<string, string>();
    for (const c of competencias) codeByCompetenciaId.set(c.id, c.code);

    const items: TaskHistoryItem[] = [];
    for (const ev of taskCompetency.evaluations) {
      const links = Array.isArray(ev.links) ? ev.links : [];
      const codes = Array.from(
        new Set(
          links
            .map((l) => resolveCompetenciaId((l as any)?.criteriaId))
            .filter(Boolean)
            .map((cid) => codeByCompetenciaId.get(String(cid)) || String(cid))
            .filter(Boolean)
        )
      );
      const competencyCodes = codes.length ? codes.join(', ') : '-';

      const base = {
        competencyCodes,
        taskId: String(ev.taskId || ''),
        learningSituationId: String(ev.learningSituationId || ''),
      };

      const byTeacher = (ev as any)?.byTeacher;
      const teacherEntries = byTeacher && typeof byTeacher === 'object' && !Array.isArray(byTeacher)
        ? Object.entries(byTeacher as Record<string, any>)
        : [];

      if (teacherEntries.length > 0) {
        for (const [teacherKey, entry] of teacherEntries) {
          const at = entry?.timestamp instanceof Date ? entry.timestamp : (ev.timestamp instanceof Date ? ev.timestamp : new Date(ev.timestamp));
          if (!Number.isFinite(at.getTime())) continue;
          const rating = (entry?.rating as GradeKey) || ev.rating;
          const score = typeof entry?.numericalValue === 'number' ? entry.numericalValue : (typeof ev.numericalValue === 'number' ? ev.numericalValue : GRADE_VALUE[rating]);
          const teacherLabel = entry?.teacherName || entry?.teacherEmail || ev.teacherName || ev.teacherEmail || '—';
          const observation = typeof entry?.observation === 'string' ? entry.observation : (typeof ev.observation === 'string' ? ev.observation : '');
          items.push({
            key: `${ev.id}__${teacherKey}`,
            at,
            rating,
            score: Number.isFinite(score) ? score : 0,
            teacherLabel: String(teacherLabel),
            observation,
            ...base,
          });
        }
      } else {
        const at = ev.timestamp instanceof Date ? ev.timestamp : new Date(ev.timestamp);
        if (!Number.isFinite(at.getTime())) continue;
        const rating = ev.rating;
        const score = typeof ev.numericalValue === 'number' ? ev.numericalValue : GRADE_VALUE[rating];
        const teacherLabel = ev.teacherName || ev.teacherEmail || '—';
        const observation = typeof ev.observation === 'string' ? ev.observation : '';
        items.push({
          key: ev.id,
          at,
          rating,
          score: Number.isFinite(score) ? score : 0,
          teacherLabel: String(teacherLabel),
          observation,
          ...base,
        });
      }
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return items;
  }, [competencias, resolveCompetenciaId, taskCompetency.evaluations]);

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

        <div ref={obsSectionRef} className="mb-4">
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Evidencia rápida (no planificada)</p>
                <p className="text-xs text-gray-600">La forma más rápida de registrar: texto + color + competencias (código). Se guarda independiente de tareas.</p>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Competencias</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedQuickEvidenceCompetencias.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setQuickEvidenceCompetenciaIds((prev) => prev.filter((cid) => cid !== c.id))
                    }
                    title="Quitar"
                  >
                    {c.code} ×
                  </button>
                ))}
                {selectedQuickEvidenceCompetencias.length === 0 ? (
                  <span className="text-xs text-gray-500">Añade al menos una competencia.</span>
                ) : null}
              </div>

              <input
                className="input-field"
                value={quickEvidenceCompSearch}
                onChange={(e) => setQuickEvidenceCompSearch(e.target.value)}
                placeholder="Escribe código o nombre (p. ej. CCL, STEM, …)"
              />

              {filteredQuickEvidenceCompetencias.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {filteredQuickEvidenceCompetencias.map((c) => {
                    const selected = quickEvidenceCompetenciaIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={selected ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => {
                          setQuickEvidenceCompetenciaIds((prev) => {
                            if (prev.includes(c.id)) return prev;
                            return [...prev, c.id];
                          });
                        }}
                        title={c.name}
                      >
                        {c.code}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nivel (color)</label>
              <TrafficButton value={quickEvidenceGradeKey} onChange={(v) => setQuickEvidenceGradeKey(v)} disabled={!isOnline} />
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Texto</label>
              <textarea
                autoFocus
                data-quick-evidence-input="true"
                className="input-field"
                rows={3}
                value={quickEvidenceText}
                onChange={(e) => setQuickEvidenceText(e.target.value)}
                placeholder="Qué hizo/dijo (evidencia observable)…"
                disabled={!isOnline || quickEvidenceSaving}
              />
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="btn-primary"
                onClick={saveQuickEvidence}
                disabled={!isOnline || quickEvidenceSaving}
              >
                <Save className="w-5 h-5 inline-block mr-2" />
                {quickEvidenceSaving ? 'Guardando…' : 'Guardar evidencia'}
              </button>
            </div>

            {!isOnline ? (
              <p className="text-xs text-gray-600 mt-2">Inicia sesión para guardar evidencias rápidas.</p>
            ) : null}
          </div>
        </div>

        <div className="mb-4">
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Evaluación por criterio (DO)</p>
                <p className="text-xs text-gray-600">Registra una valoración 1–4 ligada a criterios y descriptores operativos.</p>
              </div>
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={openCriterionModal}
                disabled={!isOnline}
              >
                <Plus className="w-4 h-4" />
                Evaluar
              </button>
            </div>

            {!isOnline ? (
              <p className="text-xs text-gray-600 mt-2">Inicia sesión para guardar evaluaciones por criterio.</p>
            ) : null}

            {isOnline && criteria.length === 0 ? (
              <p className="text-xs text-gray-600 mt-2">No hay criterios cargados en el workspace.</p>
            ) : null}

            {isOnline ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-700">Últimos registros</p>
                {criterionEvaluations.length === 0 ? (
                  <p className="text-xs text-gray-600 mt-1">Aún no hay evaluaciones por criterio para este estudiante.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {criterionEvaluations.slice(0, 6).map((ev) => {
                      const c = criteria.find((x) => x.id === ev.criterionId);
                      const label = c ? `${c.id} · ${c.area}` : ev.criterionId;
                      const when = formatDateEs(ev.updatedAt || ev.createdAt);
                      return (
                        <div key={ev.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{label}</p>
                              <p className="text-[11px] text-gray-600 truncate">{c?.text || ''}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-semibold text-gray-900">{ev.score}/4</p>
                              <p className="text-[11px] text-gray-600">{when}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-4">
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div>
              <p className="text-sm font-semibold text-gray-900">Perfil de salida (radar)</p>
              <p className="text-xs text-gray-600">Compara progreso individual vs media del grupo (por competencias clave).</p>
            </div>

            {!isOnline ? (
              <p className="text-xs text-gray-600 mt-2">Inicia sesión para cargar datos del grupo y mostrar el gráfico.</p>
            ) : (
              <div className="mt-3">
                <Suspense fallback={<p className="text-sm text-gray-600">Cargando gráfico…</p>}>
                  <RadarCompetencyChart
                    studentData={radarStudent}
                    groupData={radarGroup}
                    groupLabel={`Media del grupo (${classroomStudents.length} alumnos)`}
                  />
                </Suspense>
              </div>
            )}
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
                  Fuente: evidencias en tareas y evidencias rápidas (no planificadas).
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
                  <span className="text-gray-600">
                    · {taskGlobal.evidenceCount} evidencias (tareas: {taskCompetency.evaluations.length} · rápidas: {taskCompetency.evidenceNotes.length})
                  </span>
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

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Historial</p>
                <p className="text-xs text-gray-600">Evidencias con nivel y puntuación estimada.</p>
              </div>
            </div>

            <div className="mt-3 border border-gray-200 rounded-lg bg-white">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">Evidencias rápidas (no planificadas)</p>
                <p className="text-xs text-gray-600">{evidenceNotes.length} evidencia(s)</p>
              </div>

              {evidenceNotes.length === 0 ? (
                <div className="px-4 py-3">
                  <p className="text-sm text-gray-600">Aún no hay evidencias rápidas.</p>
                </div>
              ) : (
                <div className="px-4 py-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-600">
                        <th className="py-2 pr-4 text-left font-medium">Fecha</th>
                        <th className="py-2 pr-4 text-left font-medium">Competencias</th>
                        <th className="py-2 pr-4 text-left font-medium">Nivel</th>
                        <th className="py-2 pr-4 text-left font-medium">Observación</th>
                        <th className="py-2 text-left font-medium">Autor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidenceNotes.slice(0, 25).map((n) => {
                        const dt = n.createdAt instanceof Date ? formatDateEs(n.createdAt) : '-';
                        const codes = n.competenciaIds
                          .map((cid) => competencias.find((c) => c.id === cid)?.code || cid)
                          .filter(Boolean)
                          .join(', ');
                        const author = n.teacherName || n.teacherEmail || '—';
                        return (
                          <tr key={n.id} className="border-t border-gray-100 align-top">
                            <td className="py-2 pr-4 whitespace-nowrap text-gray-700">{dt}</td>
                            <td className="py-2 pr-4 text-gray-700">{codes || '—'}</td>
                            <td className="py-2 pr-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-2">
                                <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[n.gradeKey]}`} />
                                <span className="text-gray-700">{GRADE_LABEL_ES[n.gradeKey]}</span>
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-gray-700 whitespace-pre-wrap">{n.text}</td>
                            <td className="py-2 text-gray-600">{author}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-500 mt-2">Mostrando hasta 25 evidencias.</p>
                </div>
              )}
            </div>

            {evidenceNotes.length === 0 && taskHistoryItems.length === 0 ? (
              <p className="text-sm text-gray-600 mt-3">Aún no hay evidencias registradas para este estudiante.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {taskHistoryItems.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg bg-white">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">Tareas (Situaciones)</p>
                      <p className="text-xs text-gray-600">{taskHistoryItems.length} evidencia(s)</p>
                    </div>

                    <div className="block sm:hidden">
                      {taskHistoryItems.slice(0, 25).map((it) => {
                        const dt = it.at instanceof Date ? formatDateEs(it.at) : '-';
                        const taskLabel = it.taskId ? `Tarea: ${it.taskId}` : (it.learningSituationId ? `Situación: ${it.learningSituationId}` : '');
                        return (
                          <div key={it.key} className="px-4 py-3 border-t border-gray-100">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-gray-600">{dt}</p>
                                <p className="text-sm font-semibold text-gray-900">{it.competencyCodes}</p>
                                {taskLabel ? <p className="text-xs text-gray-600 mt-0.5">{taskLabel}</p> : null}
                                <p className="text-xs text-gray-600 mt-0.5">Por: {it.teacherLabel}</p>
                              </div>
                              <span className="inline-flex items-center gap-2 shrink-0">
                                <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[it.rating]}`} />
                                <span className="text-xs text-gray-700">{GRADE_LABEL_ES[it.rating]}</span>
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">Puntuación: {Number(it.score).toFixed(1)}</p>
                            {it.observation ? (
                              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{it.observation}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

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
                          {taskHistoryItems.slice(0, 25).map((it) => {
                            const dt = it.at instanceof Date ? formatDateEs(it.at) : '-';
                            const taskLabel = it.taskId ? `Tarea: ${it.taskId}` : (it.learningSituationId ? `Situación: ${it.learningSituationId}` : '');
                            return (
                              <tr key={it.key} className="border-t border-gray-100">
                                <td className="py-3 px-4 text-gray-700">{dt}</td>
                                <td className="py-3 pr-4 text-gray-900 font-medium">
                                  {it.competencyCodes}
                                  {taskLabel ? <div className="text-xs text-gray-500 mt-0.5">{taskLabel}</div> : null}
                                </td>
                                <td className="py-3 pr-4 text-gray-700">{it.teacherLabel}</td>
                                <td className="py-3 pr-4">
                                  <span className="inline-flex items-center gap-2">
                                    <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[it.rating]}`} />
                                    <span className="text-gray-700">{GRADE_LABEL_ES[it.rating]}</span>
                                  </span>
                                </td>
                                <td className="py-3 pr-4 text-gray-700">{Number(it.score).toFixed(1)}</td>
                                <td className="py-3 pr-4 text-gray-700 whitespace-pre-wrap">{it.observation || ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <p className="text-xs text-gray-500">Mostrando hasta 25 evidencias por bloque.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Generador de informes con IA */}
      {student && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AIReportGenerator
            studentData={{
              student,
              taskEvaluations,
              situationEvaluations,
              criterionEvaluations,
              evidenceNotes,
              learningSituations,
              learningTasks: [], // TODO: Implementar cuando tengamos la función para obtener todas las tareas
              competencias,
            }}
            student={student}
          />
        </div>
      )}

      {showEditStudentModal && student ? (
        <CreateStudentModal
          onClose={() => setShowEditStudentModal(false)}
          onSubmit={handleEditStudent}
          initial={{ firstName: student.firstName, lastName: student.lastName, listNumber: student.listNumber, level: student.level }}
          title="Editar Estudiante"
          submitLabel="Guardar"
        />
      ) : null}

      {criterionModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCriterionModal} />
          <div className="relative w-full max-w-3xl rounded-lg bg-white border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate">Evaluar criterio</h2>
                <p className="text-xs text-gray-600 truncate">
                  {student ? `${student.lastName} ${student.firstName}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCriterionModal}
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-700">Buscar criterio</p>
                <input
                  value={criterionQuery}
                  onChange={(e) => setCriterionQuery(e.target.value)}
                  placeholder="Buscar por ID, área, texto o DO (p.ej. STEM2)…"
                  className="mt-2 w-full input"
                  disabled={!isOnline || criterionSaving}
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  {((student as any)?.level === 5 || (student as any)?.level === 6)
                    ? `Filtrado por curso ${(student as any).level}º (internivel).`
                    : 'Mostrando criterios de 5º y 6º.'}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-700">Resultados</p>
                  {criteria.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">No hay criterios cargados en el workspace.</p>
                  ) : filteredCriteria.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">Sin resultados.</p>
                  ) : (
                    <div className="mt-2 max-h-64 overflow-y-auto grid grid-cols-1 gap-2">
                      {filteredCriteria.map((c) => {
                        const selected = selectedCriterionId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={selected ? 'btn-primary text-left' : 'btn-secondary text-left'}
                            onClick={() => setSelectedCriterionId(c.id)}
                            disabled={!isOnline || criterionSaving}
                            title={c.text}
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{c.id}</p>
                              <p className="text-xs text-gray-600 truncate">{c.area} · {(c.descriptorCodes || []).join(', ')}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-700">Selección</p>
                  {selectedCriterion ? (
                    <div className="mt-2 border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-900">{selectedCriterion.id}</p>
                      <p className="text-[11px] text-gray-600 mt-1">{selectedCriterion.area}</p>
                      <p className="text-sm text-gray-700 mt-2">{selectedCriterion.text}</p>
                      <p className="text-xs text-gray-600 mt-2">
                        DO: {(selectedCriterion.descriptorCodes || []).length ? (selectedCriterion.descriptorCodes || []).join(', ') : '—'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-600">Selecciona un criterio de la lista.</p>
                  )}

                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-700">Nivel (1–4)</p>
                    <div className="mt-2">
                      <TrafficButton value={criterionGradeKey} onChange={(v) => setCriterionGradeKey(v)} disabled={!isOnline || criterionSaving} />
                    </div>
                    {criterionGradeKey ? (
                      <p className="mt-2 text-xs text-gray-600">
                        Guardará: {SCORE_BY_GRADE[criterionGradeKey]}/4 ({GRADE_LABEL_ES[criterionGradeKey]})
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCriterionModal}
                disabled={criterionSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={saveCriterionEvaluation}
                disabled={!isOnline || criterionSaving}
              >
                <span className="inline-flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {criterionSaving ? 'Guardando…' : 'Guardar'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
