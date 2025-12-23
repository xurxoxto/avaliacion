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
  if (serviceAccount) return admin.credential.cert(serviceAccount);

  const gac = env('GOOGLE_APPLICATION_CREDENTIALS', '');
  if (gac) return admin.credential.applicationDefault();

  try {
    return admin.credential.applicationDefault();
  } catch {
    return null;
  }
}

const RATING_NUMERIC_VALUE = {
  BLUE: 9.5,
  GREEN: 7.5,
  YELLOW: 5.5,
  RED: 3.5,
};

function requireConfirm() {
  // This script is non-destructive, but still requires an explicit opt-in.
  const ok = env('CONFIRM_SEED', '').toUpperCase() === 'YES';
  if (!ok) {
    throw new Error('Refusing to seed demo evidence. Set CONFIRM_SEED=YES to proceed.');
  }
}

async function main() {
  requireConfirm();

  const projectId = env('FIREBASE_PROJECT_ID', env('GOOGLE_CLOUD_PROJECT', ''));
  const workspaceId = env('FIREBASE_WORKSPACE_ID', 'edu.xunta.gal');

  let serviceAccount = null;
  try {
    serviceAccount = await parseServiceAccount();
  } catch {
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
          '\nAlso, if you are using ADC, you may need to set FIREBASE_PROJECT_ID.\n'
      );
    }
    admin.initializeApp({
      credential,
      ...(projectId ? { projectId } : null),
    });
  }

  const db = admin.firestore();
  const wsRef = db.collection('workspaces').doc(workspaceId);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const updatedAt = Date.now();

  // Demo IDs (should match the reset script defaults)
  const classroomAId = env('FIREBASE_DEMO_CLASSROOM_A_ID', 'demo_6A');
  const classroomBId = env('FIREBASE_DEMO_CLASSROOM_B_ID', 'demo_6B');

  const students = [
    { id: env('FIREBASE_DEMO_STUDENT1_ID', 'demo_ana_lopez'), firstName: 'Ana', lastName: 'López', classroomId: classroomAId, listNumber: 1 },
    { id: env('FIREBASE_DEMO_STUDENT2_ID', 'demo_bruno_garcia'), firstName: 'Bruno', lastName: 'García', classroomId: classroomAId, listNumber: 2 },
    { id: env('FIREBASE_DEMO_STUDENT3_ID', 'demo_lucia_perez'), firstName: 'Lucía', lastName: 'Pérez', classroomId: classroomBId, listNumber: 1 },
    { id: env('FIREBASE_DEMO_STUDENT4_ID', 'demo_mateo_sanchez'), firstName: 'Mateo', lastName: 'Sánchez', classroomId: classroomBId, listNumber: 2 },
  ];

  const classrooms = [
    { id: classroomAId, name: '6º Primaria A (demo)', grade: '6º', studentCount: 2 },
    { id: classroomBId, name: '6º Primaria B (demo)', grade: '6º', studentCount: 2 },
  ];

  // 1) Ensure there is at least one project for triangulation views.
  const projectIdFixed = env('FIREBASE_DEMO_PROJECT_ID', 'demo_project_general');
  await wsRef.collection('projects').doc(projectIdFixed).set(
    {
      name: 'General',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // 2) Seed a small number of triangulation grades (drives Analytics + some student summaries).
  const gradeSeeds = [
    // Ana
    { studentId: students[0].id, competenciaId: 'c1', gradeKey: 'GREEN' },
    { studentId: students[0].id, competenciaId: 'c3', gradeKey: 'BLUE' },
    // Bruno
    { studentId: students[1].id, competenciaId: 'c1', gradeKey: 'YELLOW' },
    { studentId: students[1].id, competenciaId: 'c7', gradeKey: 'GREEN' },
    // Lucía
    { studentId: students[2].id, competenciaId: 'c5', gradeKey: 'BLUE' },
    { studentId: students[2].id, competenciaId: 'c2', gradeKey: 'GREEN' },
    // Mateo
    { studentId: students[3].id, competenciaId: 'c3', gradeKey: 'YELLOW' },
    { studentId: students[3].id, competenciaId: 'c6', gradeKey: 'RED' },
  ];

  const gradeBatch = db.batch();
  for (const g of gradeSeeds) {
    const id = `${g.studentId}__${g.competenciaId}__${projectIdFixed}`;
    const ref = wsRef.collection('grades').doc(id);
    gradeBatch.set(
      ref,
      {
        studentId: g.studentId,
        projectId: projectIdFixed,
        competenciaId: g.competenciaId,
        gradeKey: g.gradeKey,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  await gradeBatch.commit();

  // 3) Seed a few triangulation observations with teacher-friendly text.
  const obsSeeds = [
    {
      studentId: students[0].id,
      competenciaId: 'c3',
      gradeKey: 'BLUE',
      observation:
        'Evidencia: describiu con precisión 2 características e usou vocabulario científico básico.\n' +
        'Criterio: identifica, clasifica e xustifica con exemplos.\n' +
        'Decisión docente: mañá propoño ampliar a ficha con comparación (semellanzas/diferenzas).',
    },
    {
      studentId: students[1].id,
      competenciaId: 'c1',
      gradeKey: 'YELLOW',
      observation:
        'Evidencia: lectura correcta pero con pausas irregulares e baixa proxección.\n' +
        'Criterio: ritmo e entoación axeitados ao sentido.\n' +
        'Decisión docente: ensaio curto con marcas de pausas e lectura en parellas.',
    },
    {
      studentId: students[3].id,
      competenciaId: 'c6',
      gradeKey: 'RED',
      observation:
        'Evidencia: confunde 1/2 e 1/4 ao medir; necesita apoio para comprobar.\n' +
        'Criterio: usa fraccións e equivalencias en situacións reais.\n' +
        'Decisión docente: mañá farei unha base de orientación con exemplos e autocorrección.',
    },
  ];

  const obsBatch = db.batch();
  for (const o of obsSeeds) {
    const ref = wsRef
      .collection('triangulationObservations')
      .doc(`seed__${o.studentId}__${o.competenciaId}__${projectIdFixed}`);

    obsBatch.set(
      ref,
      {
        studentId: o.studentId,
        projectId: projectIdFixed,
        competenciaId: o.competenciaId,
        subCompetenciaId: null,
        gradeKey: o.gradeKey,
        numericValue: RATING_NUMERIC_VALUE[o.gradeKey] ?? 0,
        observation: o.observation,
        teacherId: null,
        teacherName: null,
        teacherEmail: null,
        createdAt: now,
      },
      { merge: true }
    );
  }
  await obsBatch.commit();

  // 4) Seed task evaluations so Student "por tareas" panel has data.
  // These tasks match the demo situations seeded by reset_demo_workspace.mjs.
  const taskEvalSeeds = [
    // Ana
    {
      studentId: students[0].id,
      learningSituationId: 'demo_ls_natureza',
      taskId: 'demo_task_obs_patio',
      rating: 'GREEN',
      links: [
        { competenciaId: 'c1', weight: 50 },
        { competenciaId: 'c3', weight: 50 },
      ],
      observation: 'Observación completa e rexistro claro.',
    },
    {
      studentId: students[0].id,
      learningSituationId: 'demo_ls_natureza',
      taskId: 'demo_task_ficha',
      rating: 'BLUE',
      links: [
        { competenciaId: 'c1', weight: 40 },
        { competenciaId: 'c3', weight: 30 },
        { competenciaId: 'c6', weight: 30 },
      ],
      observation: 'Ficha moi coidada, datos ben xustificados.',
    },
    // Bruno
    {
      studentId: students[1].id,
      learningSituationId: 'demo_ls_natureza',
      taskId: 'demo_task_obs_patio',
      rating: 'YELLOW',
      links: [
        { competenciaId: 'c1', weight: 50 },
        { competenciaId: 'c3', weight: 50 },
      ],
      observation: 'Anota pero necesita mellorar precisión e orde.',
    },
    {
      studentId: students[1].id,
      learningSituationId: 'demo_ls_teatro',
      taskId: 'demo_task_lectura',
      rating: 'GREEN',
      links: [
        { competenciaId: 'c1', weight: 70 },
        { competenciaId: 'c7', weight: 30 },
      ],
      observation: 'Boa lectura con mellora progresiva en entoación.',
    },
    // Lucía
    {
      studentId: students[2].id,
      learningSituationId: 'demo_ls_teatro',
      taskId: 'demo_task_representacion',
      rating: 'BLUE',
      links: [
        { competenciaId: 'c5', weight: 60 },
        { competenciaId: 'c1', weight: 40 },
      ],
      observation: 'Excelente cooperación e respecto de turnos.',
    },
    {
      studentId: students[2].id,
      learningSituationId: 'demo_ls_fraccions',
      taskId: 'demo_task_receita',
      rating: 'GREEN',
      links: [
        { competenciaId: 'c2', weight: 50 },
        { competenciaId: 'c3', weight: 20 },
        { competenciaId: 'c6', weight: 30 },
      ],
      observation: 'Aplicou medidas e comprobou resultados.',
    },
    // Mateo
    {
      studentId: students[3].id,
      learningSituationId: 'demo_ls_natureza',
      taskId: 'demo_task_ficha',
      rating: 'YELLOW',
      links: [
        { competenciaId: 'c1', weight: 40 },
        { competenciaId: 'c3', weight: 30 },
        { competenciaId: 'c6', weight: 30 },
      ],
      observation: 'Ficha correcta pero precisa apoio para organizar datos.',
    },
    {
      studentId: students[3].id,
      learningSituationId: 'demo_ls_fraccions',
      taskId: 'demo_task_receita',
      rating: 'RED',
      links: [
        { competenciaId: 'c2', weight: 50 },
        { competenciaId: 'c3', weight: 20 },
        { competenciaId: 'c6', weight: 30 },
      ],
      observation: 'Precisa reforzo en fraccións e equivalencias.',
    },
  ];

  const teBatch = db.batch();
  for (const e of taskEvalSeeds) {
    const id = `${e.studentId}__${e.taskId}`;
    const ref = wsRef.collection('taskEvaluations').doc(id);
    teBatch.set(
      ref,
      {
        studentId: e.studentId,
        learningSituationId: e.learningSituationId,
        taskId: e.taskId,
        rating: e.rating,
        numericalValue: RATING_NUMERIC_VALUE[e.rating] ?? 0,
        links: e.links,
        observation: e.observation,
        timestamp: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  await teBatch.commit();

  // 5) Seed cloud-sync "evaluations" so Analytics isn't empty even though it reads from localStorage.
  // This populates localStorage via startCloudSync() on login.
  const day = 24 * 60 * 60 * 1000;
  const demoEvalSpec = [
    // Ana
    { s: 0, c: 'c3', r: 9.0, d: 0, o: 'Describe e xustifica con exemplos claros.' },
    { s: 0, c: 'c1', r: 8.0, d: 5, o: 'Comunica con orde e vocabulario axeitado.' },
    { s: 0, c: 'c6', r: 7.5, d: 12, o: 'Organiza información e presenta conclusións sinxelas.' },
    // Bruno
    { s: 1, c: 'c1', r: 6.0, d: 3, o: 'Boa lectura, mellorar proxección e pausas.' },
    { s: 1, c: 'c7', r: 7.0, d: 9, o: 'Participa e acepta feedback; falta regular o ritmo.' },
    { s: 1, c: 'c3', r: 6.5, d: 14, o: 'Rexistro aceptable; precisa máis precisión nos datos.' },
    // Lucía
    { s: 2, c: 'c5', r: 9.5, d: 7, o: 'Coopera e regula ben a participación no grupo.' },
    { s: 2, c: 'c1', r: 8.5, d: 10, o: 'Expresión oral clara; usa exemplos para apoiar ideas.' },
    { s: 2, c: 'c2', r: 7.5, d: 16, o: 'Aplica procedementos con autonomía e comproba resultados.' },
    // Mateo
    { s: 3, c: 'c6', r: 4.0, d: 1, o: 'Precisa reforzo en fraccións; usar checklist de comprobación.' },
    { s: 3, c: 'c2', r: 5.5, d: 6, o: 'Avanza con apoio; erros por falta de revisión.' },
    { s: 3, c: 'c3', r: 6.0, d: 13, o: 'Identifica a idea principal; mellorar organización do rexistro.' },
  ];

  const cloudEvaluations = demoEvalSpec.map((e) => {
    const studentId = students[e.s].id;
    return {
      id: `demo_eval_${studentId}_${e.c}_${e.d}`,
      studentId,
      competenciaId: e.c,
      rating: e.r,
      observation: e.o,
      date: new Date(Date.now() - e.d * day).toISOString(),
      evidenceUrls: [],
    };
  });

  await wsRef.set(
    {
      version: 1,
      updatedAt,
      classrooms: classrooms.map((c) => ({
        ...c,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      students: students.map((s) => ({
        ...s,
        progress: 0,
        averageGrade: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      evaluations: cloudEvaluations,
    },
    { merge: true }
  );

  // eslint-disable-next-line no-console
  console.log('Demo evidence seeded:', {
    workspaceId,
    projectId: projectIdFixed,
    grades: gradeSeeds.length,
    observations: obsSeeds.length,
    taskEvaluations: taskEvalSeeds.length,
    cloudEvaluations: cloudEvaluations.length,
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
