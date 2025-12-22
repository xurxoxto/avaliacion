import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Student } from '../../types';

const STUDENTS_COLLECTION = 'students';

function fromDoc(id: string, data: any): Student {
  return {
    id,
    firstName: data?.firstName ?? '',
    lastName: data?.lastName ?? '',
    classroomId: data?.classroomId ?? '',
    listNumber: typeof data?.listNumber === 'number' ? data.listNumber : 0,
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

export async function deleteStudent(workspaceId: string, studentId: string): Promise<void> {
  const studentRef = doc(db, 'workspaces', workspaceId, STUDENTS_COLLECTION, studentId);
  await deleteDoc(studentRef);
}
