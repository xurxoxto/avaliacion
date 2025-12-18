import { app } from '../config/firebase';
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { STORAGE_KEYS } from './storage';

type CloudPayload = {
  version: 1;
  updatedAt: number;
  classrooms: unknown[];
  students: unknown[];
  evaluations: unknown[];
};

let unsubscribeSnapshot: (() => void) | null = null;
let dataChangedHandler: ((evt: Event) => void) | null = null;
let activeWorkspaceId: string | null = null;
let lastAppliedUpdatedAt = 0;
let pushTimer: number | null = null;

function readJsonArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalPayload(): CloudPayload {
  const localUpdatedAt = Number(localStorage.getItem(STORAGE_KEYS.SYNC_UPDATED_AT) || '0') || 0;
  return {
    version: 1,
    updatedAt: localUpdatedAt,
    classrooms: readJsonArray(STORAGE_KEYS.CLASSROOMS),
    students: readJsonArray(STORAGE_KEYS.STUDENTS),
    evaluations: readJsonArray(STORAGE_KEYS.EVALUATIONS),
  };
}

function writeLocalFromRemote(remote: CloudPayload) {
  if (Array.isArray(remote.classrooms)) {
    localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(remote.classrooms));
  }
  if (Array.isArray(remote.students)) {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(remote.students));
  }
  if (Array.isArray(remote.evaluations)) {
    localStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(remote.evaluations));
  }

  const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
  if (remoteUpdatedAt > 0) {
    localStorage.setItem(STORAGE_KEYS.SYNC_UPDATED_AT, String(remoteUpdatedAt));
  }

  lastAppliedUpdatedAt = remoteUpdatedAt;
  window.dispatchEvent(new CustomEvent('avaliacion:data-changed', { detail: { source: 'remote' } }));
}

async function pushNow() {
  if (!activeWorkspaceId) return;

  const db = getFirestore(app);
  const ref = doc(db, 'workspaces', activeWorkspaceId);
  const payload = readLocalPayload();

  // If we don't have a local updatedAt yet, initialize it now.
  if (!payload.updatedAt || payload.updatedAt <= 0) {
    payload.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEYS.SYNC_UPDATED_AT, String(payload.updatedAt));
  }

  // Avoid re-pushing if we just applied the same remote version.
  if (payload.updatedAt <= lastAppliedUpdatedAt) {
    payload.updatedAt = lastAppliedUpdatedAt + 1;
  }

  await setDoc(ref, payload, { merge: true });
}

function schedulePush() {
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushNow().catch((err) => {
      console.error('Cloud push failed:', err);
    });
  }, 600);
}

export function stopCloudSync() {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  if (dataChangedHandler) {
    window.removeEventListener('avaliacion:data-changed', dataChangedHandler);
    dataChangedHandler = null;
  }
  if (pushTimer) {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }
  activeWorkspaceId = null;
  lastAppliedUpdatedAt = 0;
}

export async function startCloudSync(workspaceId: string) {
  if (!workspaceId) return;

  // Restart if teacher changes
  if (activeWorkspaceId && activeWorkspaceId !== workspaceId) {
    stopCloudSync();
  }
  if (activeWorkspaceId === workspaceId && unsubscribeSnapshot) return;

  activeWorkspaceId = workspaceId;

  const db = getFirestore(app);
  const ref = doc(db, 'workspaces', workspaceId);

  // Initial reconcile: if remote exists and is newer -> pull; else push local.
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const remote = snap.data() as Partial<CloudPayload>;
      const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
      const local = readLocalPayload();

      // IMPORTANT: local.updatedAt is persisted; a fresh device will have 0.
      // In that case, ALWAYS pull remote (if it has any timestamp).
      if (remoteUpdatedAt > 0 && remoteUpdatedAt >= (local.updatedAt || 0)) {
        writeLocalFromRemote(remote as CloudPayload);
      } else if (remoteUpdatedAt > 0 && (local.updatedAt || 0) === 0) {
        writeLocalFromRemote(remote as CloudPayload);
      } else {
        await setDoc(ref, local, { merge: true });
      }
    } else {
      await setDoc(ref, readLocalPayload(), { merge: true });
    }
  } catch (err) {
    console.error('Cloud initial sync failed:', err);
  }

  unsubscribeSnapshot = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data() as Partial<CloudPayload>;
      const remoteUpdatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;
      if (remoteUpdatedAt && remoteUpdatedAt > lastAppliedUpdatedAt) {
        writeLocalFromRemote(remote as CloudPayload);
      }
    },
    (err) => {
      console.error('Cloud snapshot error:', err);
    }
  );

  dataChangedHandler = (evt: Event) => {
    const custom = evt as CustomEvent<{ source?: string }>;
    if (custom.detail?.source === 'remote') return;
    schedulePush();
  };

  window.addEventListener('avaliacion:data-changed', dataChangedHandler);
}
