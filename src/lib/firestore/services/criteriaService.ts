import { collection, onSnapshot, orderBy, query, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { Criterion, DoCode } from '../../../logic/criteria/types';

const COLLECTION = 'criteria';

function fromDoc(id: string, data: any): Criterion {
  const courseNum = typeof data?.course === 'number' ? data.course : Number(data?.course ?? NaN);
  const course: 5 | 6 = courseNum === 6 ? 6 : 5;

  const descriptorCodes = Array.isArray(data?.descriptorCodes)
    ? data.descriptorCodes.map((x: any) => String(x).trim().toUpperCase()).filter(Boolean)
    : [];

  return {
    id: String(data?.id ?? id ?? '').trim(),
    course,
    area: String(data?.area ?? '').trim(),
    text: String(data?.text ?? '').trim(),
    descriptorCodes,
  };
}

/** Workspace-wide stream of curriculum criteria (criterionId -> DO codes). */
export function listenCriteria(workspaceId: string, cb: (items: Criterion[]) => void) {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  // Keep ordering/index requirements minimal: order by id.
  const q = query(col, orderBy('id', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => fromDoc(d.id, d.data()))
        .filter((c) => Boolean(c.id) && Boolean(c.area) && Boolean(c.text))
    );
  });
}

export type CriteriaIndex = Map<string, { descriptorCodes: DoCode[]; course: 5 | 6; weight?: number }>;

export function buildCriteriaIndex(criteria: Criterion[]): CriteriaIndex {
  const map: CriteriaIndex = new Map();
  for (const c of criteria) {
    const id = String(c.id ?? '').trim();
    if (!id) continue;
    map.set(id, {
      descriptorCodes: Array.isArray(c.descriptorCodes)
        ? c.descriptorCodes.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
        : [],
      course: c.course,
    });
  }
  return map;
}

export async function upsertCriterion(workspaceId: string, criterion: Criterion): Promise<void> {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const docRef = doc(col, criterion.id);
  await setDoc(docRef, {
    id: criterion.id,
    course: criterion.course,
    area: criterion.area,
    text: criterion.text,
    descriptorCodes: criterion.descriptorCodes,
  });
}

export async function deleteCriterion(workspaceId: string, criterionId: string): Promise<void> {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const docRef = doc(col, criterionId);
  await deleteDoc(docRef);
}

export async function seedCriteriaFromCSV(workspaceId: string): Promise<void> {
  // Import here to avoid circular dependencies
  const { getCriteriosPuenteTerminal } = await import('../../../data/criteriosPuenteTerminal');
  
  const csvCriteria = getCriteriosPuenteTerminal();
  
  for (const csvCriterion of csvCriteria) {
    // Convert CriterioPuenteTerminal to Criterion format
      // Since puente/terminal criteria may have multiple courses, we need to create separate entries
    for (const courseStr of csvCriterion.cursos) {
      const courseNum = Number(courseStr);
      if (courseNum !== 5 && courseNum !== 6) continue;
      const course = courseNum as 5 | 6;
      const criterion: Criterion = {
        id: csvCriterion.id,
        course,
        area: csvCriterion.area,
        text: csvCriterion.criterio,
        descriptorCodes: csvCriterion.descriptores,
      };
      
      try {
        await upsertCriterion(workspaceId, criterion);
      } catch (error) {
        // Criterion might already exist, continue
        console.log(`Criterion ${criterion.id} for course ${course} already exists or failed to create`);
      }
    }
  }
}
