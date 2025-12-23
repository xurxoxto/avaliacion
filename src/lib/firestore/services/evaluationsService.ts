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
import type { GradeKey, SituationEvaluation } from '../../../types';
import { getLearningSituationWithLegacyFallback } from './learningSituationsService';

const COLLECTION = 'evaluations';

// MVP numeric mapping (explicitly requested)
export const RATING_NUMERIC_VALUE: Record<GradeKey, number> = {
  BLUE: 9.5,
  GREEN: 7.5,
  YELLOW: 5.5,
  RED: 3.5,
};

export function evaluationDocId(studentId: string, learningSituationId: string) {
  return `${studentId}__${learningSituationId}`;
}

function fromDoc(id: string, data: any): SituationEvaluation {
  const rating = (data?.rating as GradeKey) || 'YELLOW';
  const numeric = typeof data?.numericalValue === 'number' ? data.numericalValue : RATING_NUMERIC_VALUE[rating] ?? 0;
  return {
    id,
    studentId: String(data?.studentId ?? ''),
    learningSituationId: String(data?.learningSituationId ?? ''),
    rating,
    numericalValue: numeric,
    relatedCompetencyIds: Array.isArray(data?.relatedCompetencyIds)
      ? data.relatedCompetencyIds.map(String).filter(Boolean)
      : [],
    observation: typeof data?.observation === 'string' ? data.observation : undefined,
    timestamp: data?.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenEvaluationsForStudent(
  workspaceId: string,
  studentId: string,
  cb: (items: SituationEvaluation[]) => void
) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('studentId', '==', studentId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => fromDoc(d.id, d.data())).filter((x) => Boolean(x.id) && Boolean(x.studentId)));
  });
}

export function listenEvaluationsForLearningSituation(
  workspaceId: string,
  learningSituationId: string,
  cb: (items: SituationEvaluation[]) => void
) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('learningSituationId', '==', learningSituationId));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(d.id, d.data()))
        .filter((x) => Boolean(x.id) && Boolean(x.studentId) && Boolean(x.learningSituationId))
    );
  });
}

export async function deleteEvaluationsForLearningSituation(workspaceId: string, learningSituationId: string) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('learningSituationId', '==', learningSituationId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function getEvaluationsForStudent(workspaceId: string, studentId: string): Promise<SituationEvaluation[]> {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

export async function upsertEvaluation(params: {
  workspaceId: string;
  studentId: string;
  learningSituationId: string;
  rating: GradeKey;
  observation?: string;
}) {
  const { workspaceId, studentId, learningSituationId, rating, observation } = params;

  // Business rule: copy relatedCompetencyIds from the learning situation at write time.
  const situation = await getLearningSituationWithLegacyFallback(workspaceId, learningSituationId);
  const relatedCompetencyIds = situation?.relatedCompetencyIds ?? [];

  const id = evaluationDocId(studentId, learningSituationId);
  const ref = doc(db, 'workspaces', workspaceId, COLLECTION, id);

  const payload: Record<string, any> = {
    studentId,
    learningSituationId,
    rating,
    numericalValue: RATING_NUMERIC_VALUE[rating],
    relatedCompetencyIds,
    timestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof observation === 'string') {
    const trimmed = observation.trim();
    payload.observation = trimmed ? trimmed : null;
  }

  await setDoc(
    ref,
    payload,
    { merge: true }
  );

  return {
    evaluationId: id,
    relatedCompetencyIds,
  };
}
