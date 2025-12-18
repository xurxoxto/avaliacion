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
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { GradeKey, TriangulationGrade } from '../../types';

function gradeDocId(studentId: string, competenciaId: string, projectId: string) {
  return `${studentId}__${competenciaId}__${projectId}`;
}

function fromDoc(id: string, workspaceId: string, data: any): TriangulationGrade {
  return {
    id,
    workspaceId,
    studentId: data?.studentId,
    projectId: data?.projectId,
    competenciaId: data?.competenciaId,
    gradeKey: data?.gradeKey,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenAllGrades(workspaceId: string, cb: (grades: TriangulationGrade[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, 'grades');
  return onSnapshot(col, (snap) => {
    cb(snap.docs.map(d => fromDoc(d.id, workspaceId, d.data())));
  });
}

export function listenGradesForStudent(workspaceId: string, studentId: string, cb: (grades: TriangulationGrade[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, 'grades');
  const q = query(col, where('studentId', '==', studentId));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => fromDoc(d.id, workspaceId, d.data())));
  });
}

export async function upsertGrade(params: {
  workspaceId: string;
  studentId: string;
  projectId: string;
  competenciaId: string;
  gradeKey: GradeKey;
}) {
  const { workspaceId, studentId, projectId, competenciaId, gradeKey } = params;
  const id = gradeDocId(studentId, competenciaId, projectId);
  const ref = doc(db, 'workspaces', workspaceId, 'grades', id);

  await setDoc(
    ref,
    {
      studentId,
      projectId,
      competenciaId,
      gradeKey,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteGrade(workspaceId: string, studentId: string, competenciaId: string, projectId: string) {
  const id = gradeDocId(studentId, competenciaId, projectId);
  const ref = doc(db, 'workspaces', workspaceId, 'grades', id);
  await deleteDoc(ref);
}

export async function deleteGradesForStudent(workspaceId: string, studentId: string) {
  const col = collection(db, 'workspaces', workspaceId, 'grades');
  const q = query(col, where('studentId', '==', studentId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function deleteGradesForStudents(workspaceId: string, studentIds: string[]) {
  if (studentIds.length === 0) return;
  // Firestore doesn't support IN with >10 values; chunk by 10.
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += 10) chunks.push(studentIds.slice(i, i + 10));

  for (const chunk of chunks) {
    const col = collection(db, 'workspaces', workspaceId, 'grades');
    const q = query(col, where('studentId', 'in', chunk));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function deleteGradesForProject(workspaceId: string, projectId: string) {
  const col = collection(db, 'workspaces', workspaceId, 'grades');
  const q = query(col, where('projectId', '==', projectId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
