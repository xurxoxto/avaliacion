import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { GradeKey, TriangulationObservation } from '../../types';
import { GRADE_KEYS, GRADE_VALUE } from '../triangulation/gradeScale';

function isGradeKey(v: any): v is GradeKey {
  return typeof v === 'string' && (GRADE_KEYS as string[]).includes(v);
}

function fromDoc(id: string, workspaceId: string, data: any): TriangulationObservation {
  const rawKey = data?.gradeKey;
  const gradeKey: GradeKey = isGradeKey(rawKey) ? rawKey : 'YELLOW';
  return {
    id,
    workspaceId,
    studentId: data?.studentId,
    projectId: data?.projectId,
    competenciaId: data?.competenciaId,
    subCompetenciaId: data?.subCompetenciaId || undefined,
    gradeKey,
    numericValue: GRADE_VALUE[gradeKey],
    observation: data?.observation ?? '',
    teacherId: data?.teacherId || undefined,
    teacherName: data?.teacherName || undefined,
    teacherEmail: data?.teacherEmail || undefined,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  };
}

export function listenTriangulationObservationsForStudent(
  workspaceId: string,
  studentId: string,
  cb: (items: TriangulationObservation[]) => void
) {
  const col = collection(db, 'workspaces', workspaceId, 'triangulationObservations');
  const q = query(col, where('studentId', '==', studentId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => fromDoc(d.id, workspaceId, d.data())));
  });
}

export async function addTriangulationObservation(params: {
  workspaceId: string;
  studentId: string;
  projectId: string;
  competenciaId: string;
  subCompetenciaId?: string;
  gradeKey: GradeKey;
  observation: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
}) {
  const {
    workspaceId,
    studentId,
    projectId,
    competenciaId,
    subCompetenciaId,
    gradeKey,
    observation,
    teacherId,
    teacherName,
    teacherEmail,
  } = params;
  const col = collection(db, 'workspaces', workspaceId, 'triangulationObservations');
  const docRef = await addDoc(col, {
    studentId,
    projectId,
    competenciaId,
    subCompetenciaId: subCompetenciaId || null,
    gradeKey,
    numericValue: GRADE_VALUE[gradeKey],
    observation: observation.trim(),
    teacherId: teacherId || null,
    teacherName: teacherName || null,
    teacherEmail: teacherEmail || null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteTriangulationObservationsForStudent(workspaceId: string, studentId: string) {
  const col = collection(db, 'workspaces', workspaceId, 'triangulationObservations');
  const q = query(col, where('studentId', '==', studentId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function deleteTriangulationObservationsForStudents(workspaceId: string, studentIds: string[]) {
  if (studentIds.length === 0) return;
  // IN operator limited to 10.
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += 10) chunks.push(studentIds.slice(i, i + 10));

  for (const chunk of chunks) {
    const col = collection(db, 'workspaces', workspaceId, 'triangulationObservations');
    const q = query(col, where('studentId', 'in', chunk));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function deleteTriangulationObservationsForProject(workspaceId: string, projectId: string) {
  const col = collection(db, 'workspaces', workspaceId, 'triangulationObservations');
  const q = query(col, where('projectId', '==', projectId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
