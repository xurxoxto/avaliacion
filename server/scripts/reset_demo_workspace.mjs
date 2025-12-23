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
    } catch {
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

function getCredentialOrNull(serviceAccount) {
  if (serviceAccount) {
    return admin.credential.cert(serviceAccount);
  }

  // Fallback: Application Default Credentials (ADC)
  // Works with GOOGLE_APPLICATION_CREDENTIALS or gcloud application-default login.
  const gac = env('GOOGLE_APPLICATION_CREDENTIALS', '');
  if (gac) {
    // admin.credential.applicationDefault() will pick it up.
    return admin.credential.applicationDefault();
  }

  // Still try ADC in case the environment is already configured.
  try {
    return admin.credential.applicationDefault();
  } catch {
    return null;
  }
}

function requireConfirm() {
  const ok = env('CONFIRM_RESET', '').toUpperCase() === 'YES';
  if (!ok) {
    throw new Error(
      'Refusing to run destructive reset. Set CONFIRM_RESET=YES to proceed.\n' +
        'Tip: you can also set FIREBASE_WORKSPACE_ID=edu.xunta.gal and RESET_CLASSROOMS_STUDENTS=1.'
    );
  }
}

async function safeRecursiveDelete(db, ref, label) {
  if (typeof db.recursiveDelete !== 'function') {
    throw new Error(
      `firebase-admin Firestore recursiveDelete() not available; cannot safely delete ${label}. ` +
        'Upgrade firebase-admin or implement a manual recursive delete.'
    );
  }
  // eslint-disable-next-line no-console
  console.log(`Deleting ${label}…`);
  await db.recursiveDelete(ref);
}

async function main() {
  requireConfirm();

  const projectId = env('FIREBASE_PROJECT_ID', env('GOOGLE_CLOUD_PROJECT', ''));
  const workspaceId = env('FIREBASE_WORKSPACE_ID', 'edu.xunta.gal');
  const resetClassroomsStudents = env('RESET_CLASSROOMS_STUDENTS', '0') === '1';

  let serviceAccount = null;
  try {
    serviceAccount = await parseServiceAccount();
  } catch {
    // Allow ADC fallback.
    serviceAccount = null;
  }

  if (!admin.apps.length) {
    const credential = getCredentialOrNull(serviceAccount);
    if (!credential) {
      throw new Error(
        'Missing Firebase Admin credentials. Provide one of:\n' +
          '- FIREBASE_SERVICE_ACCOUNT_PATH=/abs/path/to/serviceAccount.json\n' +
          '- FIREBASE_SERVICE_ACCOUNT_JSON=\'{...}\'\n' +
          '- GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/serviceAccount.json (ADC)\n' +
          '\nAlso, if you are using ADC, you may need to set FIREBASE_PROJECT_ID (e.g. avaliacioncompetencias).\n'
      );
    }
    admin.initializeApp({
      credential,
      ...(projectId ? { projectId } : null),
    });
  }

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const wsRef = db.collection('workspaces').doc(workspaceId);

  // 1) Delete situations (both new model + legacy projects) so the UI truly shows only 3.
  await safeRecursiveDelete(db, wsRef.collection('learningSituations'), `workspaces/${workspaceId}/learningSituations`);
  await safeRecursiveDelete(db, wsRef.collection('projects'), `workspaces/${workspaceId}/projects (legacy situations)`);

  // 2) Delete evaluations tied to deleted situations/tasks (keeps workspace clean).
  await safeRecursiveDelete(db, wsRef.collection('taskEvaluations'), `workspaces/${workspaceId}/taskEvaluations`);
  await safeRecursiveDelete(db, wsRef.collection('evaluations'), `workspaces/${workspaceId}/evaluations`);

  // 3) Optionally reset classrooms/students.
  if (resetClassroomsStudents) {
    await safeRecursiveDelete(db, wsRef.collection('students'), `workspaces/${workspaceId}/students`);
    await safeRecursiveDelete(db, wsRef.collection('classrooms'), `workspaces/${workspaceId}/classrooms`);
  }

  // 4) Seed 2 classrooms + 4 students (2 per class).
  const classroomAId = env('FIREBASE_DEMO_CLASSROOM_A_ID', 'demo_6A');
  const classroomBId = env('FIREBASE_DEMO_CLASSROOM_B_ID', 'demo_6B');

  const classrooms = [
    {
      id: classroomAId,
      name: '6º Primaria A (demo)',
      grade: '6º',
      studentCount: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: classroomBId,
      name: '6º Primaria B (demo)',
      grade: '6º',
      studentCount: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const students = [
    {
      id: env('FIREBASE_DEMO_STUDENT1_ID', 'demo_ana_lopez'),
      firstName: 'Ana',
      lastName: 'López',
      classroomId: classroomAId,
      listNumber: 1,
    },
    {
      id: env('FIREBASE_DEMO_STUDENT2_ID', 'demo_bruno_garcia'),
      firstName: 'Bruno',
      lastName: 'García',
      classroomId: classroomAId,
      listNumber: 2,
    },
    {
      id: env('FIREBASE_DEMO_STUDENT3_ID', 'demo_lucia_perez'),
      firstName: 'Lucía',
      lastName: 'Pérez',
      classroomId: classroomBId,
      listNumber: 1,
    },
    {
      id: env('FIREBASE_DEMO_STUDENT4_ID', 'demo_mateo_sanchez'),
      firstName: 'Mateo',
      lastName: 'Sánchez',
      classroomId: classroomBId,
      listNumber: 2,
    },
  ].map((s) => ({
    ...s,
    progress: 0,
    averageGrade: 0,
    createdAt: now,
    updatedAt: now,
  }));

  await db.runTransaction(async (tx) => {
    for (const c of classrooms) {
      tx.set(wsRef.collection('classrooms').doc(c.id), c, { merge: true });
    }
    for (const s of students) {
      tx.set(wsRef.collection('students').doc(s.id), s, { merge: true });
    }
  });

  // 5) Seed 3 learning situations + some tasks.
  const situations = [
    {
      id: 'demo_ls_natureza',
      title: 'Fichas técnicas da natureza',
      description: 'Observación, rexistro e comunicación científica sinxela a partir do contorno próximo.',
      type: 'TASK',
      relatedCompetencyIds: ['c1', 'c3', 'c6'],
      tasks: [
        {
          id: 'demo_task_obs_patio',
          title: 'Tarefa 1: Observación no patio',
          description: 'Observar e anotar 3 elementos naturais (planta/animal/rocha) con vocabulario básico.',
          links: [
            { competenciaId: 'c1', weight: 50 },
            { competenciaId: 'c3', weight: 50 },
          ],
        },
        {
          id: 'demo_task_ficha',
          title: 'Tarefa 2: Ficha técnica',
          description: 'Crear unha ficha cun debuxo/foto e 5 datos (hábitat, alimentación, etc.).',
          links: [
            { competenciaId: 'c1', weight: 40 },
            { competenciaId: 'c3', weight: 30 },
            { competenciaId: 'c6', weight: 30 },
          ],
        },
      ],
    },
    {
      id: 'demo_ls_teatro',
      title: 'Teatro en galego',
      description: 'Preparar unha pequena escena: lectura expresiva, ensaio e representación.',
      type: 'PROJECT',
      relatedCompetencyIds: ['c1', 'c5', 'c7'],
      tasks: [
        {
          id: 'demo_task_lectura',
          title: 'Lectura expresiva',
          description: 'Entoación e ritmo, respecto de pausas, volume axeitado.',
          links: [
            { competenciaId: 'c1', weight: 70 },
            { competenciaId: 'c7', weight: 30 },
          ],
        },
        {
          id: 'demo_task_representacion',
          title: 'Representación en grupo',
          description: 'Cooperación, turnos de palabra e respecto aos compañeiros.',
          links: [
            { competenciaId: 'c5', weight: 60 },
            { competenciaId: 'c1', weight: 40 },
          ],
        },
      ],
    },
    {
      id: 'demo_ls_fraccions',
      title: 'Fraccións na cociña',
      description: 'Aplicar fraccións e medidas nunha receita sinxela con rexistro de resultados.',
      type: 'CHALLENGE',
      relatedCompetencyIds: ['c2', 'c3', 'c6'],
      tasks: [
        {
          id: 'demo_task_medidas',
          title: 'Medidas e fraccións',
          description: 'Resolver equivalencias (1/2, 1/4…) e rexistrar as cantidades.',
          links: [
            { competenciaId: 'c2', weight: 80 },
            { competenciaId: 'c3', weight: 20 },
          ],
        },
      ],
    },
  ];

  await db.runTransaction(async (tx) => {
    for (const s of situations) {
      const sRef = wsRef.collection('learningSituations').doc(s.id);
      tx.set(
        sRef,
        {
          title: s.title,
          description: s.description,
          type: s.type,
          relatedCompetencyIds: Array.isArray(s.relatedCompetencyIds) ? s.relatedCompetencyIds : [],
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      for (const t of s.tasks) {
        const tRef = sRef.collection('tasks').doc(t.id);
        tx.set(
          tRef,
          {
            learningSituationId: s.id,
            title: t.title,
            description: t.description,
            links: Array.isArray(t.links) ? t.links : [],
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
    }
  });

  // eslint-disable-next-line no-console
  console.log('Reset complete. Seeded:');
  // eslint-disable-next-line no-console
  console.log({
    workspaceId,
    situations: situations.map((s) => ({ id: s.id, title: s.title, taskCount: s.tasks.length })),
    classrooms: classrooms.map((c) => ({ id: c.id, name: c.name })),
    students: students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, classroomId: s.classroomId })),
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
