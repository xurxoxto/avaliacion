import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Project } from '../../types';

function fromDoc(id: string, data: any): Project {
  return {
    id,
    name: data?.name ?? 'Proyecto',
    createdAt: data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
  };
}

export function listenProjects(workspaceId: string, cb: (projects: Project[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, 'projects');
  const q = query(col, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => fromDoc(d.id, d.data())));
  });
}

export async function createProject(workspaceId: string, name: string) {
  const col = collection(db, 'workspaces', workspaceId, 'projects');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name required');
  const docRef = await addDoc(col, {
    name: trimmed,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteProject(workspaceId: string, projectId: string) {
  const ref = doc(db, 'workspaces', workspaceId, 'projects', projectId);
  await deleteDoc(ref);
}
