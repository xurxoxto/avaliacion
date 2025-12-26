import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { GradeKey, TaskCriteriaLink, TaskEvaluation, TaskEvaluationTeacherEntry } from '../../../types';
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

function normalizeLinks(value: any): TaskCriteriaLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x: any) => {
      const criteriaId = String(x?.criteriaId ?? '').trim();
      if (!criteriaId) return null;
      const weightNum = typeof x?.weight === 'number' ? x.weight : Number(x?.weight ?? 0);
      const weight = Number.isFinite(weightNum) ? Math.max(0, Math.min(100, weightNum)) : 0;
      return { criteriaId, weight } as TaskCriteriaLink;
    })
    .filter(Boolean) as TaskCriteriaLink[];
}

function normalizeTeacherEntries(value: any): Record<string, TaskEvaluationTeacherEntry> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, TaskEvaluationTeacherEntry> = {};
  for (const [rawTeacherId, raw] of Object.entries(value)) {
    const teacherIdKey = String(rawTeacherId ?? '').trim();
    if (!teacherIdKey) continue;
    const entry: any = raw;
    const rating = (entry?.rating as GradeKey) || undefined;
    if (!rating) continue;

    const numeric = typeof entry?.numericalValue === 'number' ? entry.numericalValue : RATING_NUMERIC_VALUE[rating] ?? 0;
    result[teacherIdKey] = {
      rating,
      numericalValue: numeric,
      observation: typeof entry?.observation === 'string' ? entry.observation : undefined,
      achievementTextSnapshot: typeof entry?.achievementTextSnapshot === 'string' ? entry.achievementTextSnapshot : undefined,
      teacherId: typeof entry?.teacherId === 'string' ? entry.teacherId : undefined,
      teacherName: typeof entry?.teacherName === 'string' ? entry.teacherName : undefined,
      teacherEmail: typeof entry?.teacherEmail === 'string' ? entry.teacherEmail : undefined,
      timestamp: entry?.timestamp?.toDate ? entry.timestamp.toDate() : new Date(),
      updatedAt: entry?.updatedAt?.toDate ? entry.updatedAt.toDate() : new Date(),
    };
  }
  return Object.keys(result).length ? result : undefined;
}

function fromDoc(id: string, data: any): TaskEvaluation {
  const rating = (data?.rating as GradeKey) || 'YELLOW';
  const numeric = typeof data?.numericalValue === 'number' ? data.numericalValue : RATING_NUMERIC_VALUE[rating] ?? 0;
  const byTeacher = normalizeTeacherEntries(data?.byTeacher);
  return {
    id,
    studentId: String(data?.studentId ?? ''),
    learningSituationId: String(data?.learningSituationId ?? ''),
    taskId: String(data?.taskId ?? ''),
    rating,
    numericalValue: numeric,
    links: normalizeLinks(data?.links),
    observation: typeof data?.observation === 'string' ? data.observation : undefined,
    achievementTextSnapshot: typeof data?.achievementTextSnapshot === 'string' ? data.achievementTextSnapshot : undefined,
    teacherId: typeof data?.teacherId === 'string' ? data.teacherId : undefined,
    teacherName: typeof data?.teacherName === 'string' ? data.teacherName : undefined,
    teacherEmail: typeof data?.teacherEmail === 'string' ? data.teacherEmail : undefined,
    byTeacher,
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

/**
 * Workspace-wide stream of task evaluations (MVP analytics / dashboards).
 * Note: for larger datasets, prefer server-side aggregation or chunked queries.
 */
export function listenAllTaskEvaluations(workspaceId: string, cb: (items: TaskEvaluation[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(d.id, d.data()))
        .filter((x) => Boolean(x.id) && Boolean(x.studentId) && Boolean(x.taskId))
    );
  });
}

export async function deleteTaskEvaluationsForLearningSituation(workspaceId: string, learningSituationId: string) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('learningSituationId', '==', learningSituationId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function deleteTaskEvaluationsForStudent(workspaceId: string, studentId: string) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('studentId', '==', studentId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function deleteTaskEvaluationsForStudents(workspaceId: string, studentIds: string[]) {
  if (studentIds.length === 0) return;
  // Firestore IN is limited to 10.
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += 10) chunks.push(studentIds.slice(i, i + 10));

  for (const chunk of chunks) {
    const col = collection(db, 'workspaces', workspaceId, COLLECTION);
    const q = query(col, where('studentId', 'in', chunk));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}

export async function upsertTaskEvaluation(params: {
  workspaceId: string;
  studentId: string;
  learningSituationId: string;
  taskId: string;
  rating: GradeKey;
  observation?: string;
  /** Optional: snapshot of the task achievement text (for the student's level) at save time. */
  achievementTextSnapshot?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  /** Optional snapshot of task.links to avoid an extra read per save (critical for <20s classroom flow). */
  linksSnapshot?: TaskCriteriaLink[];
}) {
  const {
    workspaceId,
    studentId,
    learningSituationId,
    taskId,
    rating,
    observation,
    achievementTextSnapshot,
    teacherId,
    teacherName,
    teacherEmail,
    linksSnapshot,
  } = params;

  // Business rule: copy competency links from the task at write time.
  // For fast classroom UX, allow passing a snapshot from the UI to avoid an extra read.
  let links: TaskCriteriaLink[] = [];
  if (Array.isArray(linksSnapshot)) {
    links = normalizeLinks(linksSnapshot);
  } else {
    const task = await getTask(workspaceId, learningSituationId, taskId);
    links = normalizeLinks(task?.links ?? []);
  }

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

  if (typeof achievementTextSnapshot === 'string') {
    const trimmed = achievementTextSnapshot.trim();
    if (trimmed) payload.achievementTextSnapshot = trimmed;
  }

  const teacherIdKey = typeof teacherId === 'string' ? teacherId.trim() : '';
  if (teacherIdKey) {
    const teacherEntry: Record<string, any> = {
      rating,
      numericalValue: RATING_NUMERIC_VALUE[rating],
      teacherId: teacherIdKey,
      teacherName: typeof teacherName === 'string' ? teacherName.trim() || null : null,
      teacherEmail: typeof teacherEmail === 'string' ? teacherEmail.trim().toLowerCase() || null : null,
      timestamp: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (typeof observation === 'string') {
      const trimmed = observation.trim();
      teacherEntry.observation = trimmed ? trimmed : null;
    }

    if (typeof achievementTextSnapshot === 'string') {
      const trimmed = achievementTextSnapshot.trim();
      if (trimmed) teacherEntry.achievementTextSnapshot = trimmed;
    }
    // Map merge is non-destructive with setDoc(..., { merge: true }) for other teacher keys.
    payload.byTeacher = {
      [teacherIdKey]: teacherEntry,
    };
  }

  await setDoc(ref, payload, { merge: true });

  return { evaluationId: id, links };
}
