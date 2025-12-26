import 'dotenv/config';
import admin from 'firebase-admin';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

async function parseServiceAccount() {
  const jsonRaw = env('FIREBASE_SERVICE_ACCOUNT_JSON', '');
  if (jsonRaw) return JSON.parse(jsonRaw);

  const saPath = env('FIREBASE_SERVICE_ACCOUNT_PATH', '');
  if (!saPath) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
  const abs = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
  const raw = await fs.readFile(abs, 'utf8');
  return JSON.parse(raw);
}

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).slice(0, 5);
  const semi = lines.reduce((acc, l) => acc + (l.includes(';') ? 1 : 0), 0);
  return semi > 0 ? ';' : ',';
}

function normalizeTrim(s) {
  return String(s ?? '').trim();
}

function normalizeHeader(s) {
  return normalizeTrim(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitDescriptorCodes(v) {
  const raw = normalizeTrim(v);
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => normalizeTrim(x).toUpperCase())
    .filter(Boolean);
}

function parseCourse(v) {
  const n = Number(normalizeTrim(v));
  return n === 5 || n === 6 ? n : null;
}

async function main() {
  const csvPathArg = process.argv[2];
  if (!csvPathArg) {
    console.error('CSV path required. Example: node logic/seed_criteria_from_csv.mjs data/criterios.csv');
    process.exit(1);
  }

  const workspaceId = env('FIREBASE_WORKSPACE_ID', 'edu.xunta.gal');

  const serviceAccount = await parseServiceAccount();
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const csvPath = path.isAbsolute(csvPathArg) ? csvPathArg : path.join(process.cwd(), csvPathArg);
  const csvText = await fs.readFile(csvPath, 'utf8');
  const delimiter = detectDelimiter(csvText);

  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter,
  });

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const col = db.collection('workspaces').doc(workspaceId).collection('criteria');

  let upserts = 0;
  let errors = 0;

  // Chunked batch writes (<= 500)
  const BATCH = 450;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const batch = db.batch();

    for (const r of chunk) {
      const keys = Object.keys(r);
      const map = new Map(keys.map((k) => [normalizeHeader(k), r[k]]));

      const course = parseCourse(map.get('curso'));
      const area = normalizeTrim(map.get('area'));
      const id = normalizeTrim(
        map.get('id criterio area curso bloque num') || map.get('id criterio') || map.get('id')
      );
      const text = normalizeTrim(map.get('criterio de evaluacion') || map.get('criterio') || map.get('criterio de evaluación'));
      const desc = map.get('descriptor operativo competencias clave') || map.get('descriptor operativo') || map.get('descriptores');
      const descriptorCodes = splitDescriptorCodes(desc);

      if (!course || !area || !id || !text) {
        errors += 1;
        continue;
      }

      const ref = col.doc(id);
      batch.set(
        ref,
        {
          id,
          course,
          area,
          text,
          descriptorCodes,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );
      upserts += 1;
    }

    await batch.commit();
  }

  console.log('Seeded criteria CSV into Firestore:');
  console.log({ workspaceId, upserts, errors, totalRows: records.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
