import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Competencia } from '../../types';
import {
  getDefaultSubCompetenciasForCode,
  isLomloeKeyCompetenceCode,
  LOMLOE_COMPETENCE_CODES,
  normalizeCompetenceCode,
  withDefaultLomloeSubCompetencias,
} from '../../data/competencias';

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
  // Keep the same ordering everywhere (e.g. task creation chips): creation order.
  const q = query(col, orderBy('createdAt'));
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
  const payload = {
    code: competencia.code,
    name: competencia.name,
    description: competencia.description,
    weight: typeof competencia.weight === 'number' ? competencia.weight : 0,
    subCompetencias: Array.isArray(competencia.subCompetencias) ? competencia.subCompetencias : [],
    updatedAt: serverTimestamp(),
  };

  // Only set createdAt once (first creation). Needed to preserve creation ordering.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { ...payload, createdAt: serverTimestamp() } as any, { merge: true });
    } else {
      tx.set(ref, payload as any, { merge: true });
    }
  });
}

export async function deleteCompetencia(workspaceId: string, competenciaId: string) {
  const ref = doc(db, 'workspaces', workspaceId, 'competencias', competenciaId);
  await deleteDoc(ref);
}

export async function seedCompetenciasIfEmpty(workspaceId: string, competencias: Competencia[]) {
  const incoming = withDefaultLomloeSubCompetencias(competencias);
  const colRef = collection(db, 'workspaces', workspaceId, 'competencias');
  const snap = await getDocs(colRef);
  if (!snap.empty) {
    // If the workspace still contains the old default set (C1..C7), migrate it to the
    // current LOMLOE set passed in `competencias`. We only do this when the remote data
    // clearly matches the legacy defaults (to avoid overwriting customized catalogs).
    const existing = snap.docs.map(d => fromDoc(d.id, d.data()));
    const legacyCodes = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
    const legacyIds = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    const looksLikeLegacyDefaults =
      existing.length === 7 &&
      existing.every(c => legacyIds.has(c.id) && legacyCodes.has((c.code || '').trim().toUpperCase()));

    if (!looksLikeLegacyDefaults) {
      // Backfill DOG descriptor sub-competencias only if the workspace clearly contains the
      // full LOMLOE key set and none of them have sub-competencias yet.
      const codes = new Set(existing.map((c) => normalizeCompetenceCode(c.code)));
      const hasFullKeySet = LOMLOE_COMPETENCE_CODES.every((c) => codes.has(c));
      if (!hasFullKeySet) return false;

      const lomloeExisting = existing.filter((c) => isLomloeKeyCompetenceCode(c.code));
      const anyHasSub = lomloeExisting.some((c) => Array.isArray(c.subCompetencias) && c.subCompetencias.length > 0);
      if (anyHasSub) return false;

      const batch = writeBatch(db);
      for (const c of lomloeExisting) {
        const normalized = normalizeCompetenceCode(c.code);
        const defaults = getDefaultSubCompetenciasForCode(normalized);
        if (defaults.length === 0) continue;
        const ref = doc(db, 'workspaces', workspaceId, 'competencias', c.id);
        batch.set(
          ref,
          {
            subCompetencias: defaults,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      return true;
    }

    const batch = writeBatch(db);
    for (const c of incoming) {
      const ref = doc(db, 'workspaces', workspaceId, 'competencias', c.id);
      batch.set(
        ref,
        {
          code: c.code,
          name: c.name,
          description: c.description,
          weight: typeof c.weight === 'number' ? c.weight : 0,
          subCompetencias: Array.isArray(c.subCompetencias) ? c.subCompetencias : [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return true;
  }

  const batch = writeBatch(db);
  for (const c of incoming) {
    const ref = doc(db, 'workspaces', workspaceId, 'competencias', c.id);
    batch.set(ref, {
      code: c.code,
      name: c.name,
      description: c.description,
      weight: typeof c.weight === 'number' ? c.weight : 0,
      subCompetencias: Array.isArray(c.subCompetencias) ? c.subCompetencias : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return true;
}
