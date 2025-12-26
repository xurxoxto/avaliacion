import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { Criterion } from '../../../logic/criteria/types';

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

export async function fetchCriteria(workspaceId: string): Promise<Criterion[]> {
  const col = collection(db, 'workspaces', workspaceId, COLLECTION);
  const q = query(col, orderBy('id', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data())).filter((c) => Boolean(c.id));
}
