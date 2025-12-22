#!/usr/bin/env node
/**
 * Seed LOMLOE master tables from the official CSV.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db \
 *   node server/database/seed_lomloe_from_csv.mjs server/database/seed_data/reglas-negocio.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { parse } from 'csv-parse/sync';

const { Pool } = pg;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function normalizeTrim(s) {
  return String(s ?? '').trim();
}

function splitVinculaciones(v) {
  const raw = normalizeTrim(v);
  if (!raw) return [];
  return raw.split(',').map(x => x.trim()).filter(Boolean);
}

function competenceCodeFromDescriptor(descriptorCode) {
  // STEM1 -> STEM, CCL2 -> CCL, CCEC4 -> CCEC, CPSAA5 -> CPSAA
  const m = /^([A-ZÁÉÍÓÚÑ]+)\d+$/i.exec(descriptorCode);
  if (!m) return null;
  return m[1].toUpperCase();
}

async function main() {
  const csvPathArg = process.argv[2];
  if (!csvPathArg) {
    console.error('CSV path required. Example: node server/database/seed_lomloe_from_csv.mjs server/database/seed_data/reglas-negocio.csv');
    process.exit(1);
  }

  const cwd = process.cwd();
  const csvPath = path.isAbsolute(csvPathArg) ? csvPathArg : path.join(cwd, csvPathArg);

  const csvText = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const pool = new Pool({
    connectionString: requireEnv('DATABASE_URL'),
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Small cache maps to avoid repeated selects.
    const cache = {
      asignaturaByNombre: new Map(),
      compClaveByCodigo: new Map(),
      descriptorByCodigo: new Map(),
      compEspByCodigo: new Map(),
    };

    const getOrCreateAsignatura = async (nombre) => {
      const key = normalizeTrim(nombre);
      if (!key) throw new Error('ASIGNATURA is empty');
      if (cache.asignaturaByNombre.has(key)) return cache.asignaturaByNombre.get(key);

      const sel = await client.query('SELECT id FROM asignaturas WHERE nombre = $1', [key]);
      if (sel.rows[0]) {
        cache.asignaturaByNombre.set(key, sel.rows[0].id);
        return sel.rows[0].id;
      }

      const ins = await client.query(
        'INSERT INTO asignaturas (nombre) VALUES ($1) RETURNING id',
        [key]
      );
      cache.asignaturaByNombre.set(key, ins.rows[0].id);
      return ins.rows[0].id;
    };

    const getOrCreateCompetenciaClave = async (codigo) => {
      const code = normalizeTrim(codigo).toUpperCase();
      if (!code) throw new Error('Competencia clave code empty');
      if (cache.compClaveByCodigo.has(code)) return cache.compClaveByCodigo.get(code);

      const sel = await client.query('SELECT id FROM competencias_clave WHERE codigo = $1', [code]);
      if (sel.rows[0]) {
        cache.compClaveByCodigo.set(code, sel.rows[0].id);
        return sel.rows[0].id;
      }

      const ins = await client.query(
        'INSERT INTO competencias_clave (codigo, nombre) VALUES ($1, $2) RETURNING id',
        [code, code]
      );
      cache.compClaveByCodigo.set(code, ins.rows[0].id);
      return ins.rows[0].id;
    };

    const getOrCreateDescriptor = async (descriptorCodigo) => {
      const code = normalizeTrim(descriptorCodigo).toUpperCase();
      if (!code) throw new Error('Descriptor code empty');
      if (cache.descriptorByCodigo.has(code)) return cache.descriptorByCodigo.get(code);

      const sel = await client.query('SELECT id FROM descriptores_operativos WHERE codigo = $1', [code]);
      if (sel.rows[0]) {
        cache.descriptorByCodigo.set(code, sel.rows[0].id);
        return sel.rows[0].id;
      }

      const compClaveCode = competenceCodeFromDescriptor(code);
      if (!compClaveCode) throw new Error(`Cannot infer competencia_clave from descriptor: ${code}`);
      const compClaveId = await getOrCreateCompetenciaClave(compClaveCode);

      const ins = await client.query(
        'INSERT INTO descriptores_operativos (codigo, competencia_clave_id) VALUES ($1, $2) RETURNING id',
        [code, compClaveId]
      );
      cache.descriptorByCodigo.set(code, ins.rows[0].id);
      return ins.rows[0].id;
    };

    const getOrCreateCompetenciaEspecifica = async ({ asignaturaId, codigo, tituloCorto, descripcion, vinculacionesString }) => {
      const code = normalizeTrim(codigo);
      if (!code) throw new Error('CODIGO_CE is empty');

      if (cache.compEspByCodigo.has(code)) return cache.compEspByCodigo.get(code);

      const sel = await client.query('SELECT id FROM competencias_especificas WHERE codigo = $1', [code]);
      if (sel.rows[0]) {
        cache.compEspByCodigo.set(code, sel.rows[0].id);
        return sel.rows[0].id;
      }

      const ins = await client.query(
        `INSERT INTO competencias_especificas (
          asignatura_id, codigo, titulo_corto, descripcion, vinculaciones_string
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [
          asignaturaId,
          code,
          normalizeTrim(tituloCorto) || null,
          normalizeTrim(descripcion),
          normalizeTrim(vinculacionesString),
        ]
      );
      cache.compEspByCodigo.set(code, ins.rows[0].id);
      return ins.rows[0].id;
    };

    let insertedCE = 0;
    let insertedLinks = 0;

    for (const r of records) {
      const asignatura = normalizeTrim(r.ASIGNATURA);
      const codigo = normalizeTrim(r.CODIGO_CE);
      const tituloCorto = normalizeTrim(r.TITULO_CORTO);
      const descripcion = normalizeTrim(r.DESCRIPCION);
      const vinculaciones = normalizeTrim(r.VINCULACIONES);

      const asignaturaId = await getOrCreateAsignatura(asignatura);

      const before = cache.compEspByCodigo.has(codigo);
      const ceId = await getOrCreateCompetenciaEspecifica({
        asignaturaId,
        codigo,
        tituloCorto,
        descripcion,
        vinculacionesString: vinculaciones,
      });
      if (!before) insertedCE += 1;

      const descriptorCodes = splitVinculaciones(vinculaciones);
      for (const dc of descriptorCodes) {
        const descId = await getOrCreateDescriptor(dc);
        const res = await client.query(
          `INSERT INTO competencia_especifica_descriptores (competencia_especifica_id, descriptor_operativo_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [ceId, descId]
        );
        // pg doesn't return affected row count reliably for ON CONFLICT DO NOTHING without rowCount.
        if (res.rowCount) insertedLinks += res.rowCount;
      }
    }

    await client.query('COMMIT');

    console.log('Seed completed');
    console.log(`- CSV rows: ${records.length}`);
    console.log(`- Competencias específicas inserted (approx): ${insertedCE}`);
    console.log(`- CE <-> Descriptor links inserted (approx): ${insertedLinks}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
