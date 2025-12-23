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

function requireConfirm() {
  const ok = env('CONFIRM_SEED', '').toUpperCase() === 'YES';
  if (!ok) {
    throw new Error('Refusing to seed competencias. Set CONFIRM_SEED=YES to proceed.');
  }
}

async function loadDogDescriptorsFromRepo() {
  const repoRoot = process.cwd();
  const tsFile = path.join(repoRoot, 'src', 'data', 'lomloe_descriptores_operativos_galicia.ts');
  const raw = await fs.readFile(tsFile, 'utf8');

  const marker = 'export const LOMLOE_DESCRIPTORES_OPERATIVOS_GALICIA';
  const markerIdx = raw.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(`Cannot find ${marker} in ${tsFile}`);
  }

  const eqIdx = raw.indexOf('=', markerIdx);
  if (eqIdx === -1) {
    throw new Error(`Cannot find '=' after ${marker} in ${tsFile}`);
  }

  const startIdx = raw.indexOf('{', eqIdx);
  if (startIdx === -1) {
    throw new Error(`Cannot find '{' for descriptor object in ${tsFile}`);
  }

  const endIdx = raw.lastIndexOf('};');
  if (endIdx === -1) {
    throw new Error(`Cannot find closing '};' for descriptor object in ${tsFile}`);
  }

  const objectText = raw.slice(startIdx, endIdx + 1);
  try {
    return JSON.parse(objectText);
  } catch {
    throw new Error(
      `Failed to JSON.parse DOG descriptors from ${tsFile}. ` +
        'The file should contain a JSON-compatible object literal with double quotes.'
    );
  }
}

function subCompetenciasFor(code, descriptorsByCompetencia) {
  const list = descriptorsByCompetencia[String(code || '').toUpperCase()] || [];
  return list.map((d) => ({
    id: `dog-${String(d.code || '').toLowerCase()}`,
    code: d.code,
    name: d.primaria,
    description: d.eso || null,
    weight: 0,
  }));
}

async function main() {
  requireConfirm();

  let projectId = env('FIREBASE_PROJECT_ID', env('GOOGLE_CLOUD_PROJECT', ''));
  const workspaceId = env('FIREBASE_WORKSPACE_ID', 'edu.xunta.gal');
  const force = env('FORCE', '0') === '1';

  let serviceAccount = null;
  try {
    serviceAccount = await parseServiceAccount();
  } catch {
    serviceAccount = null;
  }

  if (!projectId && serviceAccount?.project_id) {
    projectId = serviceAccount.project_id;
  }

  if (!projectId) {
    throw new Error('Unable to determine FIREBASE_PROJECT_ID. Set FIREBASE_PROJECT_ID.');
  }

  if (!admin.apps.length) {
    const credential = getCredentialOrNull(serviceAccount);
    if (!credential) {
      throw new Error(
        'Missing Firebase Admin credentials. Provide one of:\n' +
          '- FIREBASE_SERVICE_ACCOUNT_PATH=/abs/path/to/serviceAccount.json\n' +
          '- FIREBASE_SERVICE_ACCOUNT_JSON=\'{...}\'\n' +
          '- GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/serviceAccount.json (ADC)\n'
      );
    }

    admin.initializeApp({
      credential,
      projectId,
    });
  }

  const descriptorsByCompetencia = await loadDogDescriptorsFromRepo();

  const db = admin.firestore();
  const wsRef = db.collection('workspaces').doc(workspaceId);
  const colRef = wsRef.collection('competencias');

  const snap = await colRef.limit(1).get();
  if (!force && !snap.empty) {
    // eslint-disable-next-line no-console
    console.log('Competencias already exist; skipping. Use FORCE=1 to overwrite.');
    return;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  const competencias = [
    {
      id: 'c1',
      code: 'CCL',
      name: 'Competencia en comunicación lingüística',
      description:
        'Comprender y expresar ideas, emociones y conocimientos de forma oral y escrita, en distintos contextos y con adecuación comunicativa.',
    },
    {
      id: 'cp',
      code: 'CP',
      name: 'Competencia plurilingüe',
      description:
        'Usar distintas lenguas y repertorios lingüísticos para comprender, interactuar y mediar, valorando la diversidad lingüística y cultural.',
    },
    {
      id: 'c2',
      code: 'STEM',
      name: 'Competencia matemática y competencia en ciencia, tecnología e ingeniería',
      description:
        'Razonar, modelizar y resolver problemas; aplicar el método científico y el pensamiento computacional en situaciones reales.',
    },
    {
      id: 'c3',
      code: 'CD',
      name: 'Competencia digital',
      description:
        'Buscar, crear y comunicar información de forma segura, crítica y responsable mediante tecnologías digitales.',
    },
    {
      id: 'c4',
      code: 'CPSAA',
      name: 'Competencia personal, social y de aprender a aprender',
      description:
        'Gestionar el aprendizaje, el bienestar y las relaciones; desarrollar autonomía, autorregulación y habilidades socioemocionales.',
    },
    {
      id: 'c5',
      code: 'CC',
      name: 'Competencia ciudadana',
      description:
        'Participar de forma responsable, democrática y solidaria, comprendiendo derechos, deberes y la convivencia en sociedad.',
    },
    {
      id: 'c6',
      code: 'CE',
      name: 'Competencia emprendedora',
      description:
        'Transformar ideas en acciones con creatividad, iniciativa, planificación y perseverancia, asumiendo riesgos de forma responsable.',
    },
    {
      id: 'c7',
      code: 'CCEC',
      name: 'Competencia en conciencia y expresión culturales',
      description:
        'Apreciar, interpretar y crear manifestaciones culturales y artísticas, desarrollando sensibilidad estética e identidad cultural.',
    },
  ];

  const batch = db.batch();
  for (const c of competencias) {
    const ref = colRef.doc(c.id);
    batch.set(
      ref,
      {
        code: c.code,
        name: c.name,
        description: c.description,
        weight: 1,
        subCompetencias: subCompetenciasFor(c.code, descriptorsByCompetencia),
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();

  // eslint-disable-next-line no-console
  console.log('Competencias seeded:', {
    workspaceId,
    count: competencias.length,
    subCounts: Object.fromEntries(
      competencias.map((c) => [c.code, subCompetenciasFor(c.code, descriptorsByCompetencia).length])
    ),
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
