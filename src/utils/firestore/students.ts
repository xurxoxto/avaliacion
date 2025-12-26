import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  writeBatch,
  deleteDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Student } from '../../types';

const STUDENTS_COLLECTION = 'students';

function fromDoc(id: string, data: any): Student {
  const levelNum = typeof data?.level === 'number' ? data.level : Number(data?.level ?? 0);
  const level = levelNum === 5 || levelNum === 6 ? (levelNum as 5 | 6) : undefined;
  return {
    id,
    nia: typeof data?.nia === 'string' ? data.nia : undefined,
    firstName: data?.firstName ?? '',
    lastName: data?.lastName ?? '',
    classroomId: data?.classroomId ?? '',
    listNumber: typeof data?.listNumber === 'number' ? data.listNumber : 0,
    level,
    progress: typeof data?.progress === 'number' ? data.progress : 0,
    averageGrade: typeof data?.averageGrade === 'number' ? data.averageGrade : 0,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenStudents(workspaceId: string, onUpdate: (students: Student[]) => void): () => void {
  const q = query(collection(db, 'workspaces', workspaceId, STUDENTS_COLLECTION));
  
  return onSnapshot(q, (snapshot) => {
    const students = snapshot.docs.map(d => fromDoc(d.id, d.data()));
    onUpdate(students);
  });
}

export function listenStudentsByClassroom(
  workspaceId: string,
  classroomId: string,
  onUpdate: (students: Student[]) => void
): () => void {
  const q = query(
    collection(db, 'workspaces', workspaceId, STUDENTS_COLLECTION),
    where('classroomId', '==', classroomId)
  );

  return onSnapshot(q, (snapshot) => {
    const students = snapshot.docs.map(d => fromDoc(d.id, d.data()));
    onUpdate(students);
  });
}

export async function createStudent(
  workspaceId: string,
  studentData: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const newStudentRef = doc(collection(db, 'workspaces', workspaceId, STUDENTS_COLLECTION));
  await setDoc(newStudentRef, {
    ...studentData,
    id: newStudentRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newStudentRef.id;
}

export async function createStudentsBulk(
  workspaceId: string,
  students: Array<Omit<Student, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<number> {
  if (students.length === 0) return 0;

  const collectionRef = collection(db, 'workspaces', workspaceId, STUDENTS_COLLECTION);
  const MAX_BATCH = 500;

  let created = 0;
  for (let i = 0; i < students.length; i += MAX_BATCH) {
    const chunk = students.slice(i, i + MAX_BATCH);
    const batch = writeBatch(db);
    chunk.forEach((studentData) => {
      const newStudentRef = doc(collectionRef);
      batch.set(newStudentRef, {
        ...studentData,
        id: newStudentRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    created += chunk.length;
  }

  return created;
}

export async function updateStudent(
  workspaceId: string,
  studentId: string,
  patch: Partial<Pick<Student, 'firstName' | 'lastName' | 'listNumber' | 'classroomId' | 'level' | 'progress' | 'averageGrade'>>
): Promise<void> {
  const studentRef = doc(db, 'workspaces', workspaceId, STUDENTS_COLLECTION, studentId);
  await updateDoc(studentRef, {
    ...patch,
    updatedAt: serverTimestamp(),
  } as any);
}

export async function deleteStudent(workspaceId: string, studentId: string): Promise<void> {
  const studentRef = doc(db, 'workspaces', workspaceId, STUDENTS_COLLECTION, studentId);
  await deleteDoc(studentRef);
}
