import 'dotenv/config';
import admin from 'firebase-admin';
import fs from 'node:fs/promises';
import path from 'node:path';

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

async function parseServiceAccount() {
  const jsonRaw = env('FIREBASE_SERVICE_ACCOUNT_JSON', '');
  if (jsonRaw) {
    try {
      return JSON.parse(jsonRaw);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON');
    }
  }

  const saPath = env('FIREBASE_SERVICE_ACCOUNT_PATH', '');
  if (saPath) {
    const abs = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
    const raw = await fs.readFile(abs, 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH does not point to valid JSON');
    }
  }

  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
}

async function main() {
  const workspaceId = env('FIREBASE_WORKSPACE_ID', 'edu.xunta.gal');

  const serviceAccount = await parseServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();

  const now = admin.firestore.FieldValue.serverTimestamp();

  // Deterministic IDs (safe to re-run)
  const classroomId = env('FIREBASE_DEMO_CLASSROOM_ID', 'demo_6A');
  const student1Id = env('FIREBASE_DEMO_STUDENT1_ID', 'demo_lucia_perez');
  const student2Id = env('FIREBASE_DEMO_STUDENT2_ID', 'demo_mateo_garcia');

  const classroomRef = db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('classrooms')
    .doc(classroomId);

  const studentCol = db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('students');

  const classroom = {
    id: classroomId,
    name: '6º Primaria A (demo)',
    grade: '6º',
    studentCount: 2,
    createdAt: now,
    updatedAt: now,
  };

  const lucia = {
    id: student1Id,
    firstName: 'Lucía',
    lastName: 'Pérez',
    classroomId,
    listNumber: 1,
    progress: 0,
    averageGrade: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mateo = {
    id: student2Id,
    firstName: 'Mateo',
    lastName: 'García',
    classroomId,
    listNumber: 2,
    progress: 0,
    averageGrade: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (tx) => {
    tx.set(classroomRef, classroom, { merge: true });
    tx.set(studentCol.doc(student1Id), lucia, { merge: true });
    tx.set(studentCol.doc(student2Id), mateo, { merge: true });
  });

  // Print what we created for quick navigation in console
  // eslint-disable-next-line no-console
  console.log('Seeded Firestore demo data:');
  // eslint-disable-next-line no-console
  console.log({ workspaceId, classroomId, studentIds: [student1Id, student2Id] });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
