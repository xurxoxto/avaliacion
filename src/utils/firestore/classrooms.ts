import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Classroom } from '../../types';

const CLASSROOMS_COLLECTION = 'classrooms';

function fromDoc(id: string, data: any): Classroom {
  return {
    id,
    name: data?.name ?? 'Aula',
    grade: data?.grade ?? '',
    studentCount: typeof data?.studentCount === 'number' ? data.studentCount : 0,
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenClassrooms(workspaceId: string, onUpdate: (classrooms: Classroom[]) => void): () => void {
  const q = query(collection(db, 'workspaces', workspaceId, CLASSROOMS_COLLECTION));
  
  return onSnapshot(q, (snapshot) => {
    const classrooms = snapshot.docs.map(d => fromDoc(d.id, d.data()));
    onUpdate(classrooms);
  });
}

export async function createClassroom(
  workspaceId: string,
  classroomData: Omit<Classroom, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const newClassroomRef = doc(collection(db, 'workspaces', workspaceId, CLASSROOMS_COLLECTION));
  await setDoc(newClassroomRef, {
    ...classroomData,
    id: newClassroomRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newClassroomRef.id;
}

export async function updateClassroom(
  workspaceId: string,
  classroomId: string,
  patch: Partial<Pick<Classroom, 'name' | 'grade' | 'studentCount'>>
): Promise<void> {
  const classroomRef = doc(db, 'workspaces', workspaceId, CLASSROOMS_COLLECTION, classroomId);
  await updateDoc(classroomRef, {
    ...patch,
    updatedAt: serverTimestamp(),
  } as any);
}

export async function deleteClassroom(workspaceId: string, classroomId: string): Promise<void> {
  // First, delete all students in the classroom
  const studentsRef = collection(db, 'workspaces', workspaceId, 'students');
  const q = query(studentsRef, where('classroomId', '==', classroomId));
  const studentsSnapshot = await getDocs(q);
  
  // Firestore batch limit is 500 operations.
  const docs = studentsSnapshot.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Then, delete the classroom itself
  const classroomRef = doc(db, 'workspaces', workspaceId, CLASSROOMS_COLLECTION, classroomId);
  await deleteDoc(classroomRef);
}
