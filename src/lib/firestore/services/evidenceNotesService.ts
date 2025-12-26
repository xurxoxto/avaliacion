import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { EvidenceNote, GradeKey } from '../../../types';
import { GRADE_VALUE } from '../../../utils/triangulation/gradeScale';

const SUBCOLLECTION = 'evidenceNotes';

function fromDoc(studentId: string, id: string, data: any): EvidenceNote {
  const gradeKey = (data?.gradeKey as GradeKey) || 'YELLOW';
  const numericValue = typeof data?.numericValue === 'number' ? data.numericValue : (GRADE_VALUE as any)[gradeKey] ?? 0;
  return {
    id,
    studentId,
    competenciaIds: Array.isArray(data?.competenciaIds) ? data.competenciaIds.map(String).filter(Boolean) : [],
    gradeKey,
    numericValue,
    text: String(data?.text ?? ''),
    teacherId: typeof data?.teacherId === 'string' ? data.teacherId : undefined,
    teacherName: typeof data?.teacherName === 'string' ? data.teacherName : undefined,
    teacherEmail: typeof data?.teacherEmail === 'string' ? data.teacherEmail : undefined,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenEvidenceNotesForStudent(
  workspaceId: string,
  studentId: string,
  cb: (items: EvidenceNote[]) => void
) {
  const col = collection(db, 'workspaces', workspaceId, 'students', studentId, SUBCOLLECTION);
  const q = query(col, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(studentId, d.id, d.data()))
        .filter((x) => Boolean(x.id) && Boolean(x.studentId) && x.competenciaIds.length > 0 && Boolean(x.text))
    );
  });
}

/** Workspace-wide stream of ad-hoc evidence notes (for analytics/dashboards). */
export function listenAllEvidenceNotes(workspaceId: string, cb: (items: EvidenceNote[]) => void) {
  const col = collectionGroup(db, SUBCOLLECTION);
  const q = query(col, where('workspaceId', '==', workspaceId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(String(d.data()?.studentId ?? ''), d.id, d.data()))
        .filter((x) => Boolean(x.id) && Boolean(x.studentId) && x.competenciaIds.length > 0 && Boolean(x.text))
    );
  });
}

export async function addEvidenceNote(params: {
  workspaceId: string;
  studentId: string;
  competenciaIds: string[];
  gradeKey: GradeKey;
  text: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
}) {
  const {
    workspaceId,
    studentId,
    competenciaIds,
    gradeKey,
    text,
    teacherId,
    teacherName,
    teacherEmail,
  } = params;

  const cleanedCompetenciaIds = Array.from(new Set((competenciaIds || []).map(String).map((s) => s.trim()).filter(Boolean)));
  const cleanedText = String(text ?? '').trim();

  if (!studentId) throw new Error('studentId is required');
  if (cleanedCompetenciaIds.length === 0) throw new Error('competenciaIds is required');
  if (!cleanedText) throw new Error('text is required');

  const col = collection(db, 'workspaces', workspaceId, 'students', studentId, SUBCOLLECTION);

  const payload: Record<string, any> = {
    workspaceId,
    studentId,
    competenciaIds: cleanedCompetenciaIds,
    gradeKey,
    numericValue: (GRADE_VALUE as any)[gradeKey] ?? 0,
    text: cleanedText,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof teacherId === 'string' && teacherId.trim()) payload.teacherId = teacherId.trim();
  if (typeof teacherName === 'string' && teacherName.trim()) payload.teacherName = teacherName.trim();
  if (typeof teacherEmail === 'string' && teacherEmail.trim()) payload.teacherEmail = teacherEmail.trim().toLowerCase();

  const ref = await addDoc(col, payload);
  return ref.id;
}

export async function deleteEvidenceNotesForStudent(workspaceId: string, studentId: string) {
  const col = collection(db, 'workspaces', workspaceId, 'students', studentId, SUBCOLLECTION);
  const snap = await getDocs(col);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function deleteEvidenceNotesForStudents(workspaceId: string, studentIds: string[]) {
  for (const studentId of studentIds) {
    if (!studentId) continue;
    await deleteEvidenceNotesForStudent(workspaceId, studentId);
  }
}
