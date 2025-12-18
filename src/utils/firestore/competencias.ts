import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Competencia } from '../../types';

function fromDoc(id: string, data: any): Competencia {
  return {
    id,
    code: String(data?.code ?? ''),
    name: String(data?.name ?? ''),
    description: String(data?.description ?? ''),
    weight: typeof data?.weight === 'number' ? data.weight : (data?.weight != null ? Number(data.weight) : 0),
    subCompetencias: Array.isArray(data?.subCompetencias) ? data.subCompetencias : [],
  } as Competencia;
}

export function listenCompetencias(workspaceId: string, cb: (items: Competencia[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, 'competencias');
  const q = query(col, orderBy('code'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map(d => fromDoc(d.id, d.data()))
        .filter(c => Boolean(c.id) && Boolean(c.code) && Boolean(c.name))
    );
  });
}

export async function upsertCompetencia(workspaceId: string, competencia: Competencia) {
  const ref = doc(db, 'workspaces', workspaceId, 'competencias', competencia.id);
  await setDoc(ref, {
    code: competencia.code,
    name: competencia.name,
    description: competencia.description,
    weight: typeof competencia.weight === 'number' ? competencia.weight : 0,
    subCompetencias: Array.isArray(competencia.subCompetencias) ? competencia.subCompetencias : [],
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deleteCompetencia(workspaceId: string, competenciaId: string) {
  const ref = doc(db, 'workspaces', workspaceId, 'competencias', competenciaId);
  await deleteDoc(ref);
}

export async function seedCompetenciasIfEmpty(workspaceId: string, competencias: Competencia[]) {
  const colRef = collection(db, 'workspaces', workspaceId, 'competencias');
  const snap = await getDocs(colRef);
  if (!snap.empty) return false;

  const batch = writeBatch(db);
  for (const c of competencias) {
    const ref = doc(db, 'workspaces', workspaceId, 'competencias', c.id);
    batch.set(ref, {
      code: c.code,
      name: c.name,
      description: c.description,
      weight: typeof c.weight === 'number' ? c.weight : 0,
      subCompetencias: Array.isArray(c.subCompetencias) ? c.subCompetencias : [],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return true;
}
