import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, BarChart3, ListTree, BookOpen, Search, X, Save } from 'lucide-react';
import { Teacher, Classroom, Student, LearningSituation, LearningTask, TaskEvaluation, EvidenceNote, CriterionEvaluation } from '../types';
import type { Competencia, GradeKey } from '../types';
import { storage } from '../utils/storage';
import { listenClassrooms, createClassroom, deleteClassroom } from '../utils/firestore/classrooms';
import { listenStudents } from '../utils/firestore/students';
import { listenCompetencias } from '../utils/firestore/competencias';
import Header from '../components/Header';
import ClassroomCard from '../components/ClassroomCard';
import CreateClassroomModal from '../components/CreateClassroomModal';
import { seedMvpLearningSituations } from '../lib/firestore/seedData';
import { listenLearningSituations } from '../lib/firestore/services/learningSituationsService';
import { listTasks } from '../lib/firestore/services/learningTasksService';
import TrafficButton from '../components/TrafficButton';
import { addEvidenceNote, deleteEvidenceNotesForStudents, listenAllEvidenceNotes } from '../lib/firestore/services/evidenceNotesService';
import { deleteTaskEvaluationsForStudents, listenAllTaskEvaluations } from '../lib/firestore/services/taskEvaluationsService';
import { normalizeCompetenceCode } from '../data/competencias';
import { GRADE_COLOR_CLASS } from '../utils/triangulation/gradeScale';
import { upsertStudentNoActivityAlerts } from '../lib/firestore/services/studentAlertsService';
import { listenCriteria, buildCriteriaIndex } from '../lib/firestore/services/criteriaService';
import { listenAllCriterionEvaluations } from '../lib/firestore/services/criterionEvaluationsService';
import { computeDoScoresEvolutive } from '../logic/do/doCalculator';
import type { Criterion } from '../logic/criteria/types';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  listenWorkspaceSettings,
  normalizeWorkspaceSettings,
  upsertWorkspaceSettings,
  type WorkspaceSettings,
} from '../lib/firestore/services/workspaceSettingsService';

interface DashboardPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function DashboardPage({ teacher, onLogout }: DashboardPageProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [taskEvaluations, setTaskEvaluations] = useState<TaskEvaluation[]>([]);
  const [evidenceNotes, setEvidenceNotes] = useState<EvidenceNote[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [criterionEvaluations, setCriterionEvaluations] = useState<CriterionEvaluation[]>([]);

  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(() => {
    const local = storage.getWorkspaceSettings<WorkspaceSettings>();
    return normalizeWorkspaceSettings(local || DEFAULT_WORKSPACE_SETTINGS);
  });
  const [settingsDraft, setSettingsDraft] = useState<WorkspaceSettings>(() => {
    const local = storage.getWorkspaceSettings<WorkspaceSettings>();
    return normalizeWorkspaceSettings(local || DEFAULT_WORKSPACE_SETTINGS);
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const alertsSyncSigRef = useRef<string>('');

  const [quickQuery, setQuickQuery] = useState('');
  const [situations, setSituations] = useState<LearningSituation[]>([]);
  const [taskIndex, setTaskIndex] = useState<Array<{ situation: LearningSituation; task: LearningTask }>>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksLoadError, setTasksLoadError] = useState(false);
  const [tasksProgress, setTasksProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const [quickEvidenceOpen, setQuickEvidenceOpen] = useState(false);
  const [quickEvidenceStudentId, setQuickEvidenceStudentId] = useState('');
  const [quickEvidenceCompSearch, setQuickEvidenceCompSearch] = useState('');
  const [quickEvidenceCompetenciaIds, setQuickEvidenceCompetenciaIds] = useState<string[]>([]);
  const [quickEvidenceGradeKey, setQuickEvidenceGradeKey] = useState<GradeKey | null>(null);
  const [quickEvidenceText, setQuickEvidenceText] = useState('');
  const [quickEvidenceSaving, setQuickEvidenceSaving] = useState(false);

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

    const unsubCompetencias = listenCompetencias(teacher.workspaceId, (items) => {
      setCompetencias(items);
    });

    const unsubSituations = listenLearningSituations(teacher.workspaceId, setSituations);

    const unsubTaskEvaluations = listenAllTaskEvaluations(teacher.workspaceId, setTaskEvaluations);
    const unsubEvidenceNotes = listenAllEvidenceNotes(teacher.workspaceId, setEvidenceNotes);
    const unsubCriteria = listenCriteria(teacher.workspaceId, setCriteria);
    const unsubCriterionEvaluations = listenAllCriterionEvaluations(teacher.workspaceId, setCriterionEvaluations);
    const unsubSettings = listenWorkspaceSettings(teacher.workspaceId, (s) => {
      setWorkspaceSettings(s);
      setSettingsDraft(s);
      storage.saveWorkspaceSettings(s);
    });

    return () => {
      unsubClassrooms();
      unsubStudents();
      unsubCompetencias();
      unsubSituations();
      unsubTaskEvaluations();
      unsubEvidenceNotes();
      unsubCriteria();
      unsubCriterionEvaluations();
      unsubSettings();
    };
  }, [teacher.workspaceId]);

  const saveWorkspaceSettingsDraft = async () => {
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Inicia sesión para guardar configuración.');
      return;
    }
    setSettingsSaving(true);
    try {
      const cleaned = normalizeWorkspaceSettings(settingsDraft);
      await upsertWorkspaceSettings(workspaceId, cleaned);
      setWorkspaceSettings(cleaned);
      storage.saveWorkspaceSettings(cleaned);
    } catch (e) {
      console.error('upsertWorkspaceSettings failed', e);
      alert('No se pudo guardar la configuración.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const criteriaIndex = useMemo(() => {
    return buildCriteriaIndex(criteria);
  }, [criteria]);

  const doScoresByStudentId = useMemo(() => {
    const evaluations = (criterionEvaluations || []).map((e) => {
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
  }, [criterionEvaluations, criteriaIndex, workspaceSettings.evolutiveWeights.w5, workspaceSettings.evolutiveWeights.w6]);

  const lowDoSummaryByStudentId = useMemo(() => {
    const map = new Map<string, Array<{ code: string; average: number }>>();
    for (const [studentId, byDo] of doScoresByStudentId.entries()) {
      const lows: Array<{ code: string; average: number }> = [];
      for (const [code, v] of byDo.entries()) {
        const avg = typeof v.average === 'number' ? v.average : 0;
        if (Number.isFinite(avg) && avg > 0 && avg < workspaceSettings.alerts.performanceThreshold) {
          lows.push({ code: String(code), average: avg });
        }
      }
      lows.sort((a, b) => a.average - b.average);
      if (lows.length) map.set(studentId, lows);
    }
    return map;
  }, [doScoresByStudentId, workspaceSettings.alerts.performanceThreshold]);

  const includedStudents = useMemo(() => {
    const allowed = new Set((teacher.classroomIds || []).filter(Boolean));
    if (allowed.size === 0) return students;
    return students.filter((s) => allowed.has(s.classroomId));
  }, [students, teacher.classroomIds]);

  const groupMeanDoByClassroomId = useMemo(() => {
    const map = new Map<string, Map<string, { sum: number; count: number }>>();

    for (const s of includedStudents) {
      const byDo = doScoresByStudentId.get(s.id);
      if (!byDo) continue;
      const agg = map.get(s.classroomId) || new Map<string, { sum: number; count: number }>();
      for (const [code, v] of byDo.entries()) {
        const avg = typeof v.average === 'number' ? v.average : 0;
        if (!Number.isFinite(avg) || avg <= 0) continue;
        const entry = agg.get(code) || { sum: 0, count: 0 };
        entry.sum += avg;
        entry.count += 1;
        agg.set(code, entry);
      }
      map.set(s.classroomId, agg);
    }

    const out = new Map<string, Map<string, number>>();
    for (const [classroomId, agg] of map.entries()) {
      const means = new Map<string, number>();
      for (const [code, v] of agg.entries()) {
        means.set(code, v.count > 0 ? v.sum / v.count : 0);
      }
      out.set(classroomId, means);
    }
    return out;
  }, [includedStudents, doScoresByStudentId]);

  const deviationSummaryByStudentId = useMemo(() => {
    const out = new Map<string, Array<{ code: string; delta: number }>>();
    const thr = workspaceSettings.alerts.deviationThreshold;
    for (const s of includedStudents) {
      const byDo = doScoresByStudentId.get(s.id);
      const group = groupMeanDoByClassroomId.get(s.classroomId);
      if (!byDo || !group) continue;
      const deviations: Array<{ code: string; delta: number }> = [];
      for (const [code, v] of byDo.entries()) {
        const studentAvg = typeof v.average === 'number' ? v.average : 0;
        const groupAvg = group.get(code);
        if (!Number.isFinite(studentAvg) || studentAvg <= 0) continue;
        if (!Number.isFinite(groupAvg as any) || (groupAvg as any) <= 0) continue;
        const delta = (groupAvg as number) - studentAvg;
        if (delta > thr) deviations.push({ code: String(code), delta });
      }
      deviations.sort((a, b) => b.delta - a.delta);
      if (deviations.length) out.set(s.id, deviations);
    }
    return out;
  }, [includedStudents, doScoresByStudentId, groupMeanDoByClassroomId, workspaceSettings.alerts.deviationThreshold]);

  const lastActivityMsByStudentId = useMemo(() => {
    const map = new Map<string, number>();
    const includedIds = new Set(includedStudents.map((s) => s.id));

    const consider = (studentId: string, ms: number | null | undefined) => {
      if (!includedIds.has(studentId)) return;
      if (!ms || !Number.isFinite(ms)) return;
      const prev = map.get(studentId);
      if (!prev || ms > prev) map.set(studentId, ms);
    };

    for (const e of taskEvaluations) {
      const ms = Math.max(
        e.updatedAt instanceof Date ? e.updatedAt.getTime() : 0,
        e.timestamp instanceof Date ? e.timestamp.getTime() : 0
      );
      consider(e.studentId, ms || null);
    }

    for (const n of evidenceNotes) {
      const ms = Math.max(
        n.updatedAt instanceof Date ? n.updatedAt.getTime() : 0,
        n.createdAt instanceof Date ? n.createdAt.getTime() : 0
      );
      consider(n.studentId, ms || null);
    }

    for (const e of criterionEvaluations) {
      const ms = Math.max(
        e.updatedAt instanceof Date ? e.updatedAt.getTime() : 0,
        e.createdAt instanceof Date ? e.createdAt.getTime() : 0
      );
      consider(e.studentId, ms || null);
    }

    return map;
  }, [includedStudents, taskEvaluations, evidenceNotes, criterionEvaluations]);

  const DO_PREFIXES = useMemo(() => ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE'] as const, []);

  const lastActivityMsByStudentPrefix = useMemo(() => {
    const includedIds = new Set(includedStudents.map((s) => s.id));

    const competenciaCodeById = new Map<string, string>();
    for (const c of competencias) {
      const id = String((c as any)?.id ?? '').trim();
      if (!id) continue;
      const code = normalizeCompetenceCode(String((c as any)?.code ?? '')).toUpperCase();
      if (code) competenciaCodeById.set(id, code);
    }

    const prefixFromCode = (code: string): string | null => {
      const raw = String(code || '').toUpperCase();
      if (!raw) return null;
      for (const p of DO_PREFIXES) {
        if (raw.startsWith(p)) return p;
      }
      return null;
    };

    const map = new Map<string, Map<string, number>>();
    const consider = (studentId: string, prefix: string | null, ms: number) => {
      if (!includedIds.has(studentId)) return;
      if (!prefix) return;
      if (!Number.isFinite(ms) || ms <= 0) return;
      const byPrefix = map.get(studentId) || new Map<string, number>();
      const prev = byPrefix.get(prefix);
      if (!prev || ms > prev) byPrefix.set(prefix, ms);
      map.set(studentId, byPrefix);
    };

    for (const e of taskEvaluations) {
      const ms = Math.max(
        e.updatedAt instanceof Date ? e.updatedAt.getTime() : 0,
        e.timestamp instanceof Date ? e.timestamp.getTime() : 0
      );
      const links = Array.isArray(e.links) ? e.links : [];
      for (const l of links) {
        const competenciaId = String((l as any)?.competenciaId ?? '').trim();
        if (!competenciaId) continue;
        const code = competenciaCodeById.get(competenciaId) || '';
        consider(e.studentId, prefixFromCode(code), ms);
      }
    }

    for (const n of evidenceNotes) {
      const ms = Math.max(
        n.updatedAt instanceof Date ? n.updatedAt.getTime() : 0,
        n.createdAt instanceof Date ? n.createdAt.getTime() : 0
      );
      const ids = Array.isArray(n.competenciaIds) ? n.competenciaIds : [];
      for (const competenciaIdRaw of ids) {
        const competenciaId = String(competenciaIdRaw ?? '').trim();
        if (!competenciaId) continue;
        const code = competenciaCodeById.get(competenciaId) || '';
        consider(n.studentId, prefixFromCode(code), ms);
      }
    }

    for (const ev of criterionEvaluations) {
      const ms = Math.max(
        ev.updatedAt instanceof Date ? ev.updatedAt.getTime() : 0,
        ev.createdAt instanceof Date ? ev.createdAt.getTime() : 0
      );
      const crit = criteriaIndex.get(String(ev.criterionId || '').trim());
      const codes = Array.isArray(crit?.descriptorCodes) ? crit!.descriptorCodes : [];
      for (const raw of codes) {
        const code = String(raw ?? '').trim().toUpperCase();
        consider(ev.studentId, prefixFromCode(code), ms);
      }
    }

    return map;
  }, [includedStudents, taskEvaluations, evidenceNotes, criterionEvaluations, competencias, DO_PREFIXES, criteriaIndex]);

  const studentNoActivityAlerts = useMemo(() => {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    const thresholdMs = workspaceSettings.alerts.inactivityDaysCritical * msDay;

    const byStudent = new Map<
      string,
      {
        student: Student;
        noActivityPrefixes: string[];
        lastActivityMsByPrefix: Record<string, number | null>;
        lowDoCodes: string[];
        lowDoMinAverage: number | null;
        deviationDoCodes: string[];
        deviationMax: number | null;
        inactivityDaysSinceAny: number | null;
      }
    >();

    for (const s of includedStudents) {
      const byPrefix = lastActivityMsByStudentPrefix.get(s.id) || new Map<string, number>();
      const noActivity: string[] = [];
      const lastActivityMsByPrefix: Record<string, number | null> = {};

      for (const p of DO_PREFIXES) {
        const lastMs = byPrefix.get(p) || null;
        lastActivityMsByPrefix[p] = lastMs;
        if (!lastMs) {
          noActivity.push(p);
          continue;
        }
        if (now - lastMs > thresholdMs) noActivity.push(p);
      }

      const lows = lowDoSummaryByStudentId.get(s.id) || [];
      const lowDoCodes = lows.map((x) => x.code).slice(0, 25);
      const lowDoMinAverage = lows.length ? lows[0].average : null;

      const devs = deviationSummaryByStudentId.get(s.id) || [];
      const deviationDoCodes = devs.map((x) => x.code).slice(0, 25);
      const deviationMax = devs.length ? devs[0].delta : null;

      const lastAny = lastActivityMsByStudentId.get(s.id) || null;
      const inactivityDaysSinceAny = lastAny ? Math.floor((now - lastAny) / msDay) : null;
      const isInactive = !lastAny || (now - lastAny > thresholdMs);

      if (noActivity.length > 0 || lowDoCodes.length > 0 || deviationDoCodes.length > 0 || isInactive) {
        byStudent.set(s.id, {
          student: s,
          noActivityPrefixes: noActivity,
          lastActivityMsByPrefix,
          lowDoCodes,
          lowDoMinAverage,
          deviationDoCodes,
          deviationMax,
          inactivityDaysSinceAny: isInactive ? inactivityDaysSinceAny : null,
        });
      }
    }

    return {
      totalStudentsWithAlerts: byStudent.size,
      items: Array.from(byStudent.values()).sort((a, b) => {
        const aKey = `${a.student.classroomId}:${a.student.listNumber || 0}:${a.student.lastName} ${a.student.firstName}`;
        const bKey = `${b.student.classroomId}:${b.student.listNumber || 0}:${b.student.lastName} ${b.student.firstName}`;
        return aKey.localeCompare(bKey);
      }),
    };
  }, [
    includedStudents,
    lastActivityMsByStudentPrefix,
    DO_PREFIXES,
    lowDoSummaryByStudentId,
    deviationSummaryByStudentId,
    lastActivityMsByStudentId,
    workspaceSettings.alerts.inactivityDaysCritical,
  ]);

  useEffect(() => {
    // Persist derived alerts locally.
    storage.saveAlerts({
      version: 1,
      updatedAtMs: Date.now(),
      noActivity: studentNoActivityAlerts.items.map((x) => ({
        studentId: x.student.id,
        classroomId: x.student.classroomId,
        noActivityPrefixes: x.noActivityPrefixes,
        lastActivityMsByPrefix: x.lastActivityMsByPrefix,
        lowDoCodes: x.lowDoCodes,
        lowDoMinAverage: x.lowDoMinAverage,
        deviationDoCodes: x.deviationDoCodes,
        deviationMax: x.deviationMax,
        inactivityDaysSinceAny: x.inactivityDaysSinceAny,
      })),
    });
  }, [studentNoActivityAlerts.items]);

  useEffect(() => {
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) return;

    // Sync to Firestore, but avoid spamming identical payloads.
    const payload = studentNoActivityAlerts.items.map((x) => ({
      studentId: x.student.id,
      noActivityPrefixes: x.noActivityPrefixes,
      lastActivityMsByPrefix: x.lastActivityMsByPrefix,
      lowDoCodes: x.lowDoCodes,
      lowDoMinAverage: x.lowDoMinAverage,
      deviationDoCodes: x.deviationDoCodes,
      deviationMax: x.deviationMax,
      inactivityDaysSinceAny: x.inactivityDaysSinceAny,
    }));
    const sig = JSON.stringify(payload);
    if (alertsSyncSigRef.current === sig) return;
    alertsSyncSigRef.current = sig;

    void upsertStudentNoActivityAlerts({ workspaceId, items: payload }).catch(() => {
      // ignore (offline / permissions)
    });
  }, [teacher.workspaceId, studentNoActivityAlerts.items]);

  const activitySummary = useMemo(() => {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    let green = 0;
    let yellow = 0;
    let red = 0;
    let none = 0;

    for (const s of includedStudents) {
      const ms = lastActivityMsByStudentId.get(s.id);
      if (!ms) {
        none += 1;
        continue;
      }
      const days = (now - ms) / msDay;
      if (days <= 7) green += 1;
      else if (days <= 30) yellow += 1;
      else red += 1;
    }

    return { green, yellow, red, none, total: includedStudents.length };
  }, [includedStudents, lastActivityMsByStudentId]);

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

  const quickEvidenceStudent = useMemo(() => {
    if (!quickEvidenceStudentId) return null;
    return students.find((s) => s.id === quickEvidenceStudentId) || null;
  }, [students, quickEvidenceStudentId]);

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

  const openQuickEvidenceForStudent = (studentId: string) => {
    setQuickEvidenceStudentId(studentId);
    setQuickEvidenceOpen(true);
    setQuickEvidenceCompSearch('');
    setQuickEvidenceCompetenciaIds([]);
    setQuickEvidenceGradeKey(null);
    setQuickEvidenceText('');
    setQuickEvidenceSaving(false);
  };

  const closeQuickEvidence = () => {
    setQuickEvidenceOpen(false);
    setQuickEvidenceSaving(false);
  };

  const saveQuickEvidence = async () => {
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) {
      alert('Inicia sesión para guardar y sincronizar.');
      return;
    }
    if (!quickEvidenceStudentId) return;
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
        studentId: quickEvidenceStudentId,
        competenciaIds: quickEvidenceCompetenciaIds,
        gradeKey: quickEvidenceGradeKey,
        text,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
      });
      // Prefer "limpio": dejar todo reseteado (aunque el modal ya se cierre).
      setQuickEvidenceCompSearch('');
      setQuickEvidenceCompetenciaIds([]);
      setQuickEvidenceGradeKey(null);
      setQuickEvidenceText('');
      closeQuickEvidence();
    } catch (err) {
      console.error('addEvidenceNote failed', err);
      alert('No se pudo guardar la evidencia rápida.');
      setQuickEvidenceSaving(false);
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
            deleteTaskEvaluationsForStudents(teacher.workspaceId, removedStudentIds),
            deleteEvidenceNotesForStudents(teacher.workspaceId, removedStudentIds),
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

                          const assignedTasksForStudent = (() => {
                            const level = (s as any)?.level;
                            const hasLevel = level === 5 || level === 6;

                            const matchesAudience = (t: LearningTask) => {
                              const raw = Array.isArray((t as any)?.audienceLevels) ? (t as any).audienceLevels : [];
                              const levels = raw.map((x: any) => Number(x)).filter((n: any) => n === 5 || n === 6) as Array<5 | 6>;
                              const uniq = Array.from(new Set(levels));
                              if (uniq.length !== 1) return true; // both / unspecified
                              if (!hasLevel) return true; // if student.level missing, keep visible
                              return uniq[0] === level;
                            };

                            const matchesAssignment = (t: LearningTask) => {
                              const ids = Array.isArray((t as any)?.assignedStudentIds)
                                ? (t as any).assignedStudentIds.map(String).filter(Boolean)
                                : [];
                              if (ids.length === 0) return true; // applies to all
                              return ids.includes(s.id);
                            };

                            const explicit: Array<{ situation: LearningSituation; task: LearningTask }> = [];
                            const general: Array<{ situation: LearningSituation; task: LearningTask }> = [];

                            for (const x of taskIndex) {
                              const ids = Array.isArray((x.task as any)?.assignedStudentIds)
                                ? (x.task as any).assignedStudentIds.map(String).filter(Boolean)
                                : [];
                              if (!matchesAudience(x.task)) continue;
                              if (ids.length > 0) {
                                if (ids.includes(s.id)) explicit.push(x);
                              } else {
                                if (matchesAssignment(x.task)) general.push(x);
                              }
                            }

                            const combined = [...explicit, ...general];
                            return {
                              total: combined.length,
                              items: combined.slice(0, 12),
                            };
                          })();

                          return (
                            <div key={s.id} className="border border-gray-200 rounded-lg bg-white p-3">
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  className="text-left min-w-0"
                                  onClick={() => {
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

                                <button
                                  type="button"
                                  className="btn-secondary shrink-0"
                                  onClick={() => {
                                    openQuickEvidenceForStudent(s.id);
                                  }}
                                  title="Evidencia rápida"
                                >
                                  Evidencia
                                </button>
                              </div>

                              <div className="mt-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-gray-600">Tareas asignadas</p>
                                  <p className="text-xs text-gray-500">{assignedTasksForStudent.total}</p>
                                </div>

                                {assignedTasksForStudent.items.length > 0 ? (
                                  <div className="mt-2 max-h-40 overflow-y-auto grid grid-cols-1 gap-2">
                                    {assignedTasksForStudent.items.map((x) => {
                                      const key = `${x.situation.id}:${x.task.id}:${s.id}`;
                                      return (
                                        <button
                                          key={key}
                                          type="button"
                                          className="btn-secondary text-left"
                                          onClick={() => {
                                            navigate(
                                              `/learning-situations/${encodeURIComponent(x.situation.id)}/evaluate?taskId=${encodeURIComponent(x.task.id)}&studentId=${encodeURIComponent(s.id)}`
                                            );
                                          }}
                                          title="Evaluar esta tarea"
                                        >
                                          <div className="min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{x.task.title}</p>
                                            <p className="text-xs text-gray-600 truncate">{x.situation.title}</p>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-gray-600">
                                    No hay tareas asignadas (o no hay tareas aún).
                                  </p>
                                )}
                              </div>
                            </div>
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

        <div className="mb-6">
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">Mapa de actividad</p>
                <p className="text-xs text-gray-600">Cuenta todo: tareas evaluadas + evidencias rápidas.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-sm ${GRADE_COLOR_CLASS.GREEN}`} />
                  ≤ 7 días ({activitySummary.green})
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-sm ${GRADE_COLOR_CLASS.YELLOW}`} />
                  7–30 días ({activitySummary.yellow})
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-sm ${GRADE_COLOR_CLASS.RED}`} />
                  &gt; 30 días ({activitySummary.red})
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-gray-200" />
                  Sin registros ({activitySummary.none})
                </span>
              </div>
            </div>

            {includedStudents.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No hay estudiantes aún.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {classrooms
                  .filter((c) => {
                    const allowed = new Set((teacher.classroomIds || []).filter(Boolean));
                    return allowed.size === 0 ? true : allowed.has(c.id);
                  })
                  .map((c) => {
                    const items = includedStudents
                      .filter((s) => s.classroomId === c.id)
                      .slice()
                      .sort((a, b) => (a.listNumber || 0) - (b.listNumber || 0) || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
                    if (items.length === 0) return null;

                    return (
                      <div key={c.id}>
                        <p className="text-xs font-medium text-gray-700">{c.name}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {items.map((s) => {
                            const ms = lastActivityMsByStudentId.get(s.id);
                            const now = Date.now();
                            const msDay = 24 * 60 * 60 * 1000;
                            const days = ms ? (now - ms) / msDay : null;
                            const lows = lowDoSummaryByStudentId.get(s.id) || [];
                            const hasLowDo = lows.length > 0;

                            const colorClass = (() => {
                              if (hasLowDo) return GRADE_COLOR_CLASS.RED;
                              if (!ms || days === null) return 'bg-gray-200';
                              if (days <= 7) return GRADE_COLOR_CLASS.GREEN;
                              if (days <= 30) return GRADE_COLOR_CLASS.YELLOW;
                              return GRADE_COLOR_CLASS.RED;
                            })();

                            const title = (() => {
                              const name = `${s.listNumber ? `${s.listNumber}. ` : ''}${s.lastName} ${s.firstName}`;
                              if (!ms) return `${name}\nSin registros.`;
                              const d = new Date(ms);
                              const fmt = new Intl.DateTimeFormat('es-ES', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              });
                              const age = days !== null ? `${Math.floor(days)}d` : '';
                              const lowLabel = hasLowDo
                                ? `\nDO < ${workspaceSettings.alerts.performanceThreshold.toFixed(2)}: ${lows
                                    .slice(0, 3)
                                    .map((x) => `${x.code}(${x.average.toFixed(2)})`)
                                    .join(', ')}${lows.length > 3 ? '…' : ''}`
                                : '';
                              return `${name}\nÚltima actividad: ${fmt.format(d)}${age ? ` (${age})` : ''}${lowLabel}`;
                            })();

                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`w-4 h-4 rounded-sm border border-gray-200 ${colorClass}`}
                                title={title}
                                aria-label={title}
                                onClick={() => {
                                  navigate(`/classroom/${encodeURIComponent(s.classroomId)}/student/${encodeURIComponent(s.id)}`);
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {studentNoActivityAlerts.totalStudentsWithAlerts > 0 ? (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-700">Alertas (inactividad &gt; {workspaceSettings.alerts.inactivityDaysCritical} días)</p>
                <p className="mt-1 text-[11px] text-gray-600">
                  Umbrales: crítica &lt; {workspaceSettings.alerts.performanceThreshold.toFixed(2)} · desviación &gt; {workspaceSettings.alerts.deviationThreshold.toFixed(2)} · inactividad &gt; {workspaceSettings.alerts.inactivityDaysCritical} días.
                </p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {studentNoActivityAlerts.items.slice(0, 18).map((x) => (
                    <button
                      key={x.student.id}
                      type="button"
                      className="btn-secondary text-left"
                      onClick={() => {
                        navigate(`/classroom/${encodeURIComponent(x.student.classroomId)}/student/${encodeURIComponent(x.student.id)}`);
                      }}
                      title="Ver estudiante"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {x.student.listNumber ? `${x.student.listNumber}. ` : ''}{x.student.lastName} {x.student.firstName}
                        </p>
                        {x.noActivityPrefixes.length ? (
                          <p className="text-xs text-gray-600 truncate">Sin: {x.noActivityPrefixes.join(', ')}</p>
                        ) : null}
                        {x.lowDoCodes.length ? (
                          <p className="text-xs text-gray-600 truncate">DO&lt;2: {x.lowDoCodes.slice(0, 6).join(', ')}{x.lowDoCodes.length > 6 ? '…' : ''}</p>
                        ) : null}
                        {x.deviationDoCodes.length ? (
                          <p className="text-xs text-gray-600 truncate">Desviación: {x.deviationDoCodes.slice(0, 6).join(', ')}{x.deviationDoCodes.length > 6 ? '…' : ''}</p>
                        ) : null}
                        {typeof x.inactivityDaysSinceAny === 'number' ? (
                          <p className="text-xs text-gray-600 truncate">Inactividad: {x.inactivityDaysSinceAny} días</p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
                {studentNoActivityAlerts.items.length > 18 ? (
                  <p className="mt-2 text-xs text-gray-600">
                    Mostrando 18 de {studentNoActivityAlerts.items.length}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-6">
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Configuración</p>
                <p className="text-xs text-gray-600">Pesos evolutivos y umbrales de alertas (workspace).</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSettingsDraft(workspaceSettings)}
                  disabled={settingsSaving}
                >
                  Revertir
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={saveWorkspaceSettingsDraft}
                  disabled={!teacher.workspaceId || settingsSaving}
                >
                  {settingsSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-700">Pesos evolutivos</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-600">
                    5º (w5)
                    <input
                      className="mt-1 input-field"
                      value={String(settingsDraft.evolutiveWeights.w5)}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          evolutiveWeights: { ...prev.evolutiveWeights, w5: Number(e.target.value) },
                        }))
                      }
                      inputMode="decimal"
                      disabled={settingsSaving}
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    6º (w6)
                    <input
                      className="mt-1 input-field"
                      value={String(settingsDraft.evolutiveWeights.w6)}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({
                          ...prev,
                          evolutiveWeights: { ...prev.evolutiveWeights, w6: Number(e.target.value) },
                        }))
                      }
                      inputMode="decimal"
                      disabled={settingsSaving}
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-gray-600">
                  Se normaliza automáticamente (w5+w6).
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-700">Umbral crítico</p>
                <label className="text-xs text-gray-600">
                  Rendimiento (CRÍTICA)
                  <input
                    className="mt-1 input-field"
                    value={String(settingsDraft.alerts.performanceThreshold)}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        alerts: { ...prev.alerts, performanceThreshold: Number(e.target.value) },
                      }))
                    }
                    inputMode="decimal"
                    disabled={settingsSaving}
                  />
                </label>
                <p className="mt-2 text-[11px] text-gray-600">Por debajo de este valor (1–4) marca alerta crítica.</p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-700">Desviación e inactividad</p>
                <label className="text-xs text-gray-600">
                  Desviación (DESVIACIÓN)
                  <input
                    className="mt-1 input-field"
                    value={String(settingsDraft.alerts.deviationThreshold)}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        alerts: { ...prev.alerts, deviationThreshold: Number(e.target.value) },
                      }))
                    }
                    inputMode="decimal"
                    disabled={settingsSaving}
                  />
                </label>
                <label className="mt-2 block text-xs text-gray-600">
                  Días sin evidencias (INACTIVIDAD)
                  <input
                    className="mt-1 input-field"
                    value={String(settingsDraft.alerts.inactivityDaysCritical)}
                    onChange={(e) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        alerts: { ...prev.alerts, inactivityDaysCritical: Number(e.target.value) },
                      }))
                    }
                    inputMode="numeric"
                    disabled={settingsSaving}
                  />
                </label>
              </div>
            </div>
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

        {quickEvidenceOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={closeQuickEvidence} />
            <div className="relative w-full max-w-2xl rounded-lg bg-white border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">Evidencia rápida (no planificada)</h2>
                  <p className="text-xs text-gray-600 truncate">
                    {quickEvidenceStudent
                      ? `${quickEvidenceStudent.lastName} ${quickEvidenceStudent.firstName}`
                      : 'Selecciona un estudiante'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeQuickEvidence}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-700">Color</p>
                  <div className="mt-2">
                    <TrafficButton value={quickEvidenceGradeKey} onChange={(v) => setQuickEvidenceGradeKey(v)} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-700">Competencias (código)</p>
                  <input
                    value={quickEvidenceCompSearch}
                    onChange={(e) => setQuickEvidenceCompSearch(e.target.value)}
                    placeholder="Buscar código (p.ej. CCL, STEM, CPSAA…)"
                    className="mt-2 w-full input"
                  />

                  {selectedQuickEvidenceCompetencias.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedQuickEvidenceCompetencias.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setQuickEvidenceCompetenciaIds((prev) => prev.filter((id) => id !== c.id))
                          }
                          title="Quitar"
                        >
                          {normalizeCompetenceCode(c.code)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {filteredQuickEvidenceCompetencias.length ? (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredQuickEvidenceCompetencias.slice(0, 12).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="btn-secondary text-left"
                          onClick={() =>
                            setQuickEvidenceCompetenciaIds((prev) =>
                              prev.includes(c.id) ? prev : [...prev, c.id]
                            )
                          }
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{normalizeCompetenceCode(c.code)}</p>
                            <p className="text-xs text-gray-600 truncate">{c.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-700">Texto</p>
                  <textarea
                    value={quickEvidenceText}
                    onChange={(e) => setQuickEvidenceText(e.target.value)}
                    rows={4}
                    className="mt-2 w-full textarea"
                    placeholder="Describe la evidencia…"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeQuickEvidence}
                  disabled={quickEvidenceSaving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={saveQuickEvidence}
                  disabled={quickEvidenceSaving}
                >
                  <span className="inline-flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Guardar
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
