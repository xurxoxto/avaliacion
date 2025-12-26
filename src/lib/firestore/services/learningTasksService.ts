import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { AudienceLevel, LearningTask, TaskCompetencyLink } from '../../../types';

const SUBCOLLECTION = 'tasks';

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
        ...(subCompetenciaId ? { subCompetenciaId } : null),
        weight,
      } as TaskCompetencyLink;
    })
    .filter(Boolean) as TaskCompetencyLink[];
}

function normalizeAudienceLevels(value: any): AudienceLevel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const levels = value
    .map((x: any) => Number(x))
    .filter((n: any) => n === 5 || n === 6) as AudienceLevel[];
  const uniq = Array.from(new Set(levels));
  if (uniq.length === 0 || uniq.length === 2) return undefined;
  return uniq;
}

function normalizeAchievementTextByLevel(value: any): Partial<Record<AudienceLevel, string>> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const t5 = typeof (value as any)[5] === 'string' ? String((value as any)[5]).trim() : '';
  const t6 = typeof (value as any)[6] === 'string' ? String((value as any)[6]).trim() : '';
  const out: Partial<Record<AudienceLevel, string>> = {};
  if (t5) out[5] = t5;
  if (t6) out[6] = t6;
  return Object.keys(out).length > 0 ? out : undefined;
}

function fromDoc(learningSituationId: string, id: string, data: any): LearningTask {
  const assignedStudentIds = Array.isArray(data?.assignedStudentIds)
    ? data.assignedStudentIds.map(String).filter(Boolean)
    : undefined;
  const audienceLevels = normalizeAudienceLevels(data?.audienceLevels);
  const achievementTextByLevel = normalizeAchievementTextByLevel(data?.achievementTextByLevel);
  return {
    id,
    learningSituationId,
    title: String(data?.title ?? ''),
    description: String(data?.description ?? ''),
    links: normalizeLinks(data?.links),
    ...(audienceLevels ? { audienceLevels } : null),
    ...(achievementTextByLevel ? { achievementTextByLevel } : null),
    ...(assignedStudentIds && assignedStudentIds.length > 0 ? { assignedStudentIds } : null),
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenTasks(workspaceId: string, learningSituationId: string, cb: (items: LearningTask[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, 'learningSituations', learningSituationId, SUBCOLLECTION);
  const q = query(col, orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => fromDoc(learningSituationId, d.id, d.data())).filter((x) => Boolean(x.id) && Boolean(x.title)));
  });
}

export async function listTasks(workspaceId: string, learningSituationId: string): Promise<LearningTask[]> {
  const col = collection(db, 'workspaces', workspaceId, 'learningSituations', learningSituationId, SUBCOLLECTION);
  const q = query(col, orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromDoc(learningSituationId, d.id, d.data()))
    .filter((x) => Boolean(x.id) && Boolean(x.title));
}

export async function getTask(workspaceId: string, learningSituationId: string, taskId: string): Promise<LearningTask | null> {
  const ref = doc(db, 'workspaces', workspaceId, 'learningSituations', learningSituationId, SUBCOLLECTION, taskId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return fromDoc(learningSituationId, snap.id, snap.data());
}

export async function upsertTask(
  workspaceId: string,
  task: Omit<LearningTask, 'createdAt' | 'updatedAt'>
): Promise<void> {
  const ref = doc(db, 'workspaces', workspaceId, 'learningSituations', task.learningSituationId, SUBCOLLECTION, task.id);

  // Ensure `createdAt` exists for stable ordering and UI.
  const existing = await getDoc(ref);

  await setDoc(
    ref,
    {
      title: task.title,
      description: task.description,
      links: Array.isArray(task.links) ? task.links : [],
      audienceLevels:
        Array.isArray((task as any).audienceLevels) && (task as any).audienceLevels.length === 1
          ? (task as any).audienceLevels
          : deleteField(),
      achievementTextByLevel: (() => {
        const raw = (task as any).achievementTextByLevel;
        if (!raw || typeof raw !== 'object') return deleteField();
        const t5 = typeof raw[5] === 'string' ? String(raw[5]).trim() : '';
        const t6 = typeof raw[6] === 'string' ? String(raw[6]).trim() : '';
        const out: any = {};
        if (t5) out[5] = t5;
        if (t6) out[6] = t6;
        return Object.keys(out).length > 0 ? out : deleteField();
      })(),
      assignedStudentIds:
        Array.isArray((task as any).assignedStudentIds) && (task as any).assignedStudentIds.length > 0
          ? (task as any).assignedStudentIds
          : deleteField(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteTask(workspaceId: string, learningSituationId: string, taskId: string): Promise<void> {
  const ref = doc(db, 'workspaces', workspaceId, 'learningSituations', learningSituationId, SUBCOLLECTION, taskId);
  await deleteDoc(ref);
}

export async function listTaskIds(workspaceId: string, learningSituationId: string): Promise<string[]> {
  const col = collection(db, 'workspaces', workspaceId, 'learningSituations', learningSituationId, SUBCOLLECTION);
  const snap = await getDocs(col);
  return snap.docs.map((d) => d.id);
}
