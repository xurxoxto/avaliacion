import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { GradeKey, TaskCompetencyLink, TaskEvaluation } from '../../../types';
import { getTask } from './learningTasksService';

const COLLECTION = 'taskEvaluations';

// MVP numeric mapping (keep consistent with earlier service)
export const RATING_NUMERIC_VALUE: Record<GradeKey, number> = {
  BLUE: 9.5,
  GREEN: 7.5,
  YELLOW: 5.5,
  RED: 3.5,
};

export function taskEvaluationDocId(studentId: string, taskId: string) {
  return `${studentId}__${taskId}`;
}

function normalizeLinks(value: any): TaskCompetencyLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x: any) => {
      const competenciaId = String(x?.competenciaId ?? '').trim();
      if (!competenciaId) return null;
      const subCompetenciaId = String(x?.subCompetenciaId ?? '').trim();
      const weightNum = typeof x?.weight === 'number' ? x.weight : Number(x?.weight ?? 0);
      const weight = Number.isFinite(weightNum) ? Math.max(0, Math.min(100, weightNum)) : 0;
      return {
        competenciaId,
        subCompetenciaId: subCompetenciaId ? subCompetenciaId : undefined,
        weight,
      } as TaskCompetencyLink;
    })
    .filter(Boolean) as TaskCompetencyLink[];
}

function fromDoc(id: string, data: any): TaskEvaluation {
  const rating = (data?.rating as GradeKey) || 'YELLOW';
  const numeric = typeof data?.numericalValue === 'number' ? data.numericalValue : RATING_NUMERIC_VALUE[rating] ?? 0;
  return {
    id,
    studentId: String(data?.studentId ?? ''),
    learningSituationId: String(data?.learningSituationId ?? ''),
    taskId: String(data?.taskId ?? ''),
    rating,
    numericalValue: numeric,
    links: normalizeLinks(data?.links),
    observation: typeof data?.observation === 'string' ? data.observation : undefined,
    teacherId: typeof data?.teacherId === 'string' ? data.teacherId : undefined,
    teacherName: typeof data?.teacherName === 'string' ? data.teacherName : undefined,
    teacherEmail: typeof data?.teacherEmail === 'string' ? data.teacherEmail : undefined,
    timestamp: data?.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenTaskEvaluationsForStudent(workspaceId: string, studentId: string, cb: (items: TaskEvaluation[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('studentId', '==', studentId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => fromDoc(d.id, d.data())).filter((x) => Boolean(x.id) && Boolean(x.studentId) && Boolean(x.taskId)));
  });
}

export function listenTaskEvaluationsForTask(workspaceId: string, taskId: string, cb: (items: TaskEvaluation[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('taskId', '==', taskId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => fromDoc(d.id, d.data())).filter((x) => Boolean(x.id) && Boolean(x.studentId) && Boolean(x.taskId)));
  });
}

export async function deleteTaskEvaluationsForLearningSituation(workspaceId: string, learningSituationId: string) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('learningSituationId', '==', learningSituationId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function upsertTaskEvaluation(params: {
  workspaceId: string;
  studentId: string;
  learningSituationId: string;
  taskId: string;
  rating: GradeKey;
  observation?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
}) {
  const {
    workspaceId,
    studentId,
    learningSituationId,
    taskId,
    rating,
    observation,
    teacherId,
    teacherName,
    teacherEmail,
  } = params;

  // Business rule: copy competency links from the task at write time.
  const task = await getTask(workspaceId, learningSituationId, taskId);
  const links = task?.links ?? [];

  const id = taskEvaluationDocId(studentId, taskId);
  const ref = doc(db, 'workspaces', workspaceId, COLLECTION, id);

  const payload: Record<string, any> = {
    studentId,
    learningSituationId,
    taskId,
    rating,
    numericalValue: RATING_NUMERIC_VALUE[rating],
    links,
    timestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof teacherId === 'string') payload.teacherId = teacherId.trim() || null;
  if (typeof teacherName === 'string') payload.teacherName = teacherName.trim() || null;
  if (typeof teacherEmail === 'string') payload.teacherEmail = teacherEmail.trim().toLowerCase() || null;

  if (typeof observation === 'string') {
    const trimmed = observation.trim();
    payload.observation = trimmed ? trimmed : null;
  }

  await setDoc(ref, payload, { merge: true });

  return { evaluationId: id, links };
}
