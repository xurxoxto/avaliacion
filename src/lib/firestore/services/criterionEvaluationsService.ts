import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { CriterionEvaluation, GradeKey } from '../../../types';

const COLLECTION = 'criterionEvaluations';

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(4, Math.round(score)));
}

function gradeKeyFromScore(score: number): GradeKey | undefined {
  const s = clampScore(score);
  if (s === 1) return 'RED';
  if (s === 2) return 'YELLOW';
  if (s === 3) return 'GREEN';
  if (s === 4) return 'BLUE';
  return undefined;
}

function fromDoc(id: string, data: any): CriterionEvaluation {
  const scoreRaw = typeof data?.score === 'number' ? data.score : Number(data?.score ?? 0);
  const score = clampScore(scoreRaw);

  const gradeKey = (data?.gradeKey as GradeKey) || gradeKeyFromScore(score);

  return {
    id,
    studentId: String(data?.studentId ?? '').trim(),
    criterionId: String(data?.criterionId ?? '').trim(),
    score,
    gradeKey,
    teacherId: typeof data?.teacherId === 'string' ? data.teacherId : undefined,
    teacherName: typeof data?.teacherName === 'string' ? data.teacherName : undefined,
    teacherEmail: typeof data?.teacherEmail === 'string' ? data.teacherEmail : undefined,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenCriterionEvaluationsForStudent(
  workspaceId: string,
  studentId: string,
  cb: (items: CriterionEvaluation[]) => void
) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('studentId', '==', studentId), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(d.id, d.data()))
        .filter((x) => Boolean(x.id) && Boolean(x.studentId) && Boolean(x.criterionId) && x.score > 0)
    );
  });
}

/** Workspace-wide stream of criterion evaluations (dashboards / analytics). */
export function listenAllCriterionEvaluations(workspaceId: string, cb: (items: CriterionEvaluation[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(d.id, d.data()))
        .filter((x) => Boolean(x.id) && Boolean(x.studentId) && Boolean(x.criterionId) && x.score > 0)
    );
  });
}

export async function addCriterionEvaluation(params: {
  workspaceId: string;
  studentId: string;
  criterionId: string;
  /** 1..4 */
  score: number;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
}) {
  const { workspaceId, studentId, criterionId, score, teacherId, teacherName, teacherEmail } = params;
  const sId = String(studentId ?? '').trim();
  const cId = String(criterionId ?? '').trim();
  const s = clampScore(Number(score));

  if (!workspaceId) throw new Error('workspaceId is required');
  if (!sId) throw new Error('studentId is required');
  if (!cId) throw new Error('criterionId is required');
  if (!(s >= 1 && s <= 4)) throw new Error('score must be between 1 and 4');

  const col = collection(db, 'workspaces', workspaceId, COLLECTION);

  const payload: Record<string, any> = {
    workspaceId,
    studentId: sId,
    criterionId: cId,
    score: s,
    gradeKey: gradeKeyFromScore(s) ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof teacherId === 'string' && teacherId.trim()) payload.teacherId = teacherId.trim();
  if (typeof teacherName === 'string' && teacherName.trim()) payload.teacherName = teacherName.trim();
  if (typeof teacherEmail === 'string' && teacherEmail.trim()) payload.teacherEmail = teacherEmail.trim().toLowerCase();

  const ref = await addDoc(col, payload);
  return ref.id;
}

export async function deleteCriterionEvaluationsForStudent(workspaceId: string, studentId: string) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('studentId', '==', studentId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
