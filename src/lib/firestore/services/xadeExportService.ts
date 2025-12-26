import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { CriterionEvaluation } from '../../../types';

const CRITERION_EVALS_COLLECTION = 'criterionEvaluations';

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(4, Math.round(score)));
}

function fromDoc(id: string, data: any): CriterionEvaluation {
  const scoreRaw = typeof data?.score === 'number' ? data.score : Number(data?.score ?? 0);
  const score = clampScore(scoreRaw);
  return {
    id,
    studentId: String(data?.studentId ?? '').trim(),
    criterionId: String(data?.criterionId ?? '').trim(),
    score,
    gradeKey: (data?.gradeKey as any) || undefined,
    teacherId: typeof data?.teacherId === 'string' ? data.teacherId : undefined,
    teacherName: typeof data?.teacherName === 'string' ? data.teacherName : undefined,
    teacherEmail: typeof data?.teacherEmail === 'string' ? data.teacherEmail : undefined,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export async function fetchCriterionEvaluationsForStudents(params: { workspaceId: string; studentIds: string[] }) {
  const { workspaceId } = params;
  const ids = Array.from(new Set((params.studentIds || []).map((x) => String(x || '').trim()).filter(Boolean)));
  if (!workspaceId) throw new Error('workspaceId is required');
  if (ids.length === 0) return [] as CriterionEvaluation[];

  // Firestore IN queries are limited to 10 values.
  const BATCH = 10;
  const out: CriterionEvaluation[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const col = collection(db, 'workspaces', workspaceId, CRITERION_EVALS_COLLECTION);
    const q = query(col, where('studentId', 'in', chunk));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const ev = fromDoc(d.id, d.data());
      if (ev.studentId && ev.criterionId && ev.score > 0) out.push(ev);
    }
  }
  return out;
}
