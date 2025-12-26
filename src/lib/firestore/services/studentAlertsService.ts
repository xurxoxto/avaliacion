import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../../config/firebase';

const COLLECTION = 'studentAlerts';

export interface StudentNoActivityAlertsPayload {
  studentId: string;
  /** e.g. ["STEM", "CCL"] */
  noActivityPrefixes: string[];
  /** epoch millis of last activity per prefix (null if none) */
  lastActivityMsByPrefix: Record<string, number | null>;

  /** Optional: DO codes with average < 2.0 (granular, e.g. STEM2). */
  lowDoCodes?: string[];
  /** Optional: minimum DO average across lowDoCodes. */
  lowDoMinAverage?: number | null;

  /** Optional: student has no evidence in N days (global, any source). */
  inactivityDaysSinceAny?: number | null;

  /** Optional: DO codes with (groupMean - student) > threshold. */
  deviationDoCodes?: string[];
  /** Optional: maximum deviation amount across deviationDoCodes. */
  deviationMax?: number | null;
}

export async function upsertStudentNoActivityAlerts(params: {
  workspaceId: string;
  items: StudentNoActivityAlertsPayload[];
}) {
  const { workspaceId, items } = params;
  if (!workspaceId) throw new Error('workspaceId is required');
  const cleaned = (items || []).filter((x) => Boolean(String(x?.studentId ?? '').trim()));
  if (cleaned.length === 0) return;

  const now = serverTimestamp();

  // Firestore batch limit is 500. Keep margin.
  const BATCH = 400;
  for (let i = 0; i < cleaned.length; i += BATCH) {
    const chunk = cleaned.slice(i, i + BATCH);
    const batch = writeBatch(db);

    for (const raw of chunk) {
      const studentId = String(raw.studentId).trim();
      const prefixes = Array.from(new Set((raw.noActivityPrefixes || []).map(String).map((s) => s.trim()).filter(Boolean)));
      const lastActivityMsByPrefix: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(raw.lastActivityMsByPrefix || {})) {
        const key = String(k || '').trim().toUpperCase();
        if (!key) continue;
        const num = typeof v === 'number' ? v : Number(v);
        lastActivityMsByPrefix[key] = Number.isFinite(num) ? num : null;
      }

      const ref = doc(db, 'workspaces', workspaceId, COLLECTION, studentId);

      const lowDoCodes = Array.from(
        new Set((raw.lowDoCodes || []).map(String).map((s) => s.trim().toUpperCase()).filter(Boolean))
      ).slice(0, 25);
      const lowDoMinAverageNum =
        typeof raw.lowDoMinAverage === 'number' ? raw.lowDoMinAverage : Number(raw.lowDoMinAverage ?? NaN);
      const lowDoMinAverage = Number.isFinite(lowDoMinAverageNum) ? lowDoMinAverageNum : null;

      const inactivityDaysNum =
        typeof raw.inactivityDaysSinceAny === 'number'
          ? raw.inactivityDaysSinceAny
          : Number(raw.inactivityDaysSinceAny ?? NaN);
      const inactivityDaysSinceAny = Number.isFinite(inactivityDaysNum) ? Math.max(0, inactivityDaysNum) : null;

      const deviationDoCodes = Array.from(
        new Set((raw.deviationDoCodes || []).map(String).map((s) => s.trim().toUpperCase()).filter(Boolean))
      ).slice(0, 25);
      const deviationMaxNum = typeof raw.deviationMax === 'number' ? raw.deviationMax : Number(raw.deviationMax ?? NaN);
      const deviationMax = Number.isFinite(deviationMaxNum) ? deviationMaxNum : null;

      batch.set(
        ref,
        {
          studentId,
          noActivityPrefixes: prefixes,
          lastActivityMsByPrefix,
          lowDoCodes,
          lowDoMinAverage,
          inactivityDaysSinceAny,
          deviationDoCodes,
          deviationMax,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    await batch.commit();
  }
}
