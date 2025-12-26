import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';

export interface WorkspaceSettings {
  evolutiveWeights: { w5: number; w6: number };
  alerts: {
    performanceThreshold: number; // e.g. 1.8
    deviationThreshold: number; // e.g. 1.2
    inactivityDaysCritical: number; // e.g. 20
  };
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  evolutiveWeights: { w5: 0.4, w6: 0.6 },
  alerts: {
    performanceThreshold: 1.8,
    deviationThreshold: 1.2,
    inactivityDaysCritical: 20,
  },
};

function clampNumber(n: any, fallback: number, min: number, max: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export function normalizeWorkspaceSettings(raw: any): WorkspaceSettings {
  const w5 = clampNumber(raw?.evolutiveWeights?.w5, DEFAULT_WORKSPACE_SETTINGS.evolutiveWeights.w5, 0, 1);
  const w6 = clampNumber(raw?.evolutiveWeights?.w6, DEFAULT_WORKSPACE_SETTINGS.evolutiveWeights.w6, 0, 1);

  const performanceThreshold = clampNumber(
    raw?.alerts?.performanceThreshold,
    DEFAULT_WORKSPACE_SETTINGS.alerts.performanceThreshold,
    0,
    4
  );
  const deviationThreshold = clampNumber(
    raw?.alerts?.deviationThreshold,
    DEFAULT_WORKSPACE_SETTINGS.alerts.deviationThreshold,
    0,
    4
  );
  const inactivityDaysCritical = clampNumber(
    raw?.alerts?.inactivityDaysCritical,
    DEFAULT_WORKSPACE_SETTINGS.alerts.inactivityDaysCritical,
    1,
    365
  );

  return {
    evolutiveWeights: { w5, w6 },
    alerts: { performanceThreshold, deviationThreshold, inactivityDaysCritical },
  };
}

export function listenWorkspaceSettings(workspaceId: string, cb: (settings: WorkspaceSettings) => void) {
  const ref = doc(db, 'workspaces', workspaceId, 'meta', 'settings');
  return onSnapshot(ref, (snap) => {
    cb(normalizeWorkspaceSettings(snap.data() || {}));
  });
}

export async function upsertWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings) {
  const ref = doc(db, 'workspaces', workspaceId, 'meta', 'settings');
  const cleaned = normalizeWorkspaceSettings(settings);
  await setDoc(
    ref,
    {
      ...cleaned,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
