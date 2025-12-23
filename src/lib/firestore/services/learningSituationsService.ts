import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { LearningSituation, LearningSituationType } from '../../../types';
import { listTaskIds, deleteTask } from './learningTasksService';
import { deleteTaskEvaluationsForLearningSituation } from './taskEvaluationsService';
import { deleteEvaluationsForLearningSituation } from './evaluationsService';

const COLLECTION = 'learningSituations';
const LEGACY_PROJECTS_COLLECTION = 'projects';

function toType(v: any): LearningSituationType {
  if (v === 'PROJECT' || v === 'TASK' || v === 'CHALLENGE') return v;
  return 'TASK';
}

function fromDoc(id: string, data: any): LearningSituation {
  return {
    id,
    title: String(data?.title ?? ''),
    description: String(data?.description ?? ''),
    type: toType(data?.type),
    relatedCompetencyIds: Array.isArray(data?.relatedCompetencyIds)
      ? data.relatedCompetencyIds.map(String).filter(Boolean)
      : [],
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenLearningSituations(workspaceId: string, cb: (items: LearningSituation[]) => void) {
  const situationsCol = collection(db, 'workspaces', workspaceId, COLLECTION);
  const legacyProjectsCol = collection(db, 'workspaces', workspaceId, LEGACY_PROJECTS_COLLECTION);
  const situationsQuery = query(situationsCol, orderBy('title'));
  const legacyQuery = query(legacyProjectsCol, orderBy('createdAt', 'desc'));

  let situations: LearningSituation[] = [];
  let legacy: LearningSituation[] = [];

  const emit = () => {
    const byId = new Map<string, LearningSituation>();
    // Prefer explicit learningSituations over legacy projects if IDs collide.
    for (const x of legacy) byId.set(x.id, x);
    for (const x of situations) byId.set(x.id, x);

    const merged = Array.from(byId.values())
      .filter((x) => Boolean(x.id) && Boolean(x.title))
      .sort((a, b) => a.title.localeCompare(b.title));
    cb(merged);
  };

  const unsub1 = onSnapshot(situationsQuery, (snap) => {
    situations = snap.docs.map((d) => fromDoc(d.id, d.data()));
    emit();
  });

  const unsub2 = onSnapshot(legacyQuery, (snap) => {
    legacy = snap.docs
      .map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          title: String(data?.name ?? ''),
          description: '',
          type: 'TASK' as LearningSituationType,
          relatedCompetencyIds: [],
          createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        } satisfies LearningSituation;
      })
      .filter((x) => Boolean(x.id) && Boolean(x.title));
    emit();
  });

  return () => {
    unsub1();
    unsub2();
  };
}

export async function getLearningSituation(workspaceId: string, id: string): Promise<LearningSituation | null> {
  const ref = doc(db, 'workspaces', workspaceId, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return fromDoc(snap.id, snap.data());
}

export async function getLearningSituationWithLegacyFallback(
  workspaceId: string,
  id: string
): Promise<LearningSituation | null> {
  const primary = await getLearningSituation(workspaceId, id);
  if (primary) return primary;

  // Legacy projects fallback (minimal fields)
  const legacyRef = doc(db, 'workspaces', workspaceId, LEGACY_PROJECTS_COLLECTION, id);
  const legacySnap = await getDoc(legacyRef);
  if (!legacySnap.exists()) return null;
  const data: any = legacySnap.data();
  return {
    id: legacySnap.id,
    title: String(data?.name ?? ''),
    description: '',
    type: 'TASK',
    relatedCompetencyIds: [],
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export async function createLearningSituation(
  workspaceId: string,
  situation: Omit<LearningSituation, 'id' | 'createdAt' | 'updatedAt'>
) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const docRef = await addDoc(col, {
    title: situation.title,
    description: situation.description,
    type: situation.type,
    relatedCompetencyIds: Array.isArray(situation.relatedCompetencyIds) ? situation.relatedCompetencyIds : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteLearningSituationCascade(workspaceId: string, learningSituationId: string) {
  // Best-effort cascade for MVP: delete evaluations, delete task evaluations, delete tasks, delete situation doc(s).
  // Note: the UI lists both new `learningSituations` and legacy `projects` as "situations".
  // If we delete only from `learningSituations`, legacy items would remain visible.
  await deleteEvaluationsForLearningSituation(workspaceId, learningSituationId).catch(() => {
    // ignore
  });

  await deleteTaskEvaluationsForLearningSituation(workspaceId, learningSituationId).catch(() => {
    // ignore
  });

  const taskIds = await listTaskIds(workspaceId, learningSituationId).catch(() => [] as string[]);
  for (const tid of taskIds) {
    await deleteTask(workspaceId, learningSituationId, tid).catch(() => {
      // ignore
    });
  }

  const ref = doc(db, 'workspaces', workspaceId, COLLECTION, learningSituationId);
  await deleteDoc(ref);

  // Legacy projects fallback deletion (idempotent if it doesn't exist).
  const legacyRef = doc(db, 'workspaces', workspaceId, LEGACY_PROJECTS_COLLECTION, learningSituationId);
  await deleteDoc(legacyRef);
}

export async function upsertLearningSituation(workspaceId: string, situation: Omit<LearningSituation, 'createdAt' | 'updatedAt'>) {
  const ref = doc(db, 'workspaces', workspaceId, COLLECTION, situation.id);
  await setDoc(
    ref,
    {
      title: situation.title,
      description: situation.description,
      type: situation.type,
      relatedCompetencyIds: Array.isArray(situation.relatedCompetencyIds) ? situation.relatedCompetencyIds : [],
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function seedLearningSituationsIfEmpty(
  workspaceId: string,
  situations: Array<{
    id: string;
    title: string;
    description: string;
    type: LearningSituationType;
    relatedCompetencyIds: string[];
  }>
) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const snap = await getDocs(col);
  if (!snap.empty) return false;

  const batch = writeBatch(db);
  for (const s of situations) {
    const ref = doc(db, 'workspaces', workspaceId, COLLECTION, s.id);
    batch.set(
      ref,
      {
        title: s.title,
        description: s.description,
        type: s.type,
        relatedCompetencyIds: Array.isArray(s.relatedCompetencyIds) ? s.relatedCompetencyIds : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
  return true;
}
