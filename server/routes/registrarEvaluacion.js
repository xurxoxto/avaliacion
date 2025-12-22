import express from 'express';
import { withTx } from '../db.js';

const router = express.Router();

// Intentionally permissive UUID check (accepts any hex UUID format).
// We avoid forcing version/variant bits to keep API compatibility with placeholders and external UUID generators.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNumber(v) {
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function normalizeDescriptorCodes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(x => String(x || '').trim().toUpperCase())
    .filter(Boolean);
}

function inferNivelLogro(nota) {
  // Default thresholds for 0-10 scale; adjust if your center uses other cutoffs.
  if (nota >= 8.5) return 'EXPERTO';
  if (nota >= 6.0) return 'AUTONOMO';
  if (nota >= 4.0) return 'BASICO';
  return 'INICIAL';
}

/**
 * POST /api/registrar-evaluacion
 * Body:
 *   alumnoId: UUID
 *   competenciaEspecificaId: UUID or codigo (e.g. MAT_CE1)
 *   nota: number
 *   evidencia?: string
 *   decisionDocente?: string
 *   fecha?: ISO string
 *   nivelLogro?: 'INICIAL'|'BASICO'|'AUTONOMO'|'EXPERTO'
 */
router.post('/', async (req, res) => {
  const alumnoId = String(req.body?.alumnoId || '').trim();
  const ceRef = String(req.body?.competenciaEspecificaId || '').trim();
  const nota = toNumber(req.body?.nota);

  const evidencia = typeof req.body?.evidencia === 'string' ? req.body.evidencia : null;
  const decisionDocente = typeof req.body?.decisionDocente === 'string' ? req.body.decisionDocente : null;

  const rawFecha = req.body?.fecha;
  const fecha = rawFecha ? new Date(rawFecha) : null;
  const fechaOk = fecha && Number.isFinite(fecha.getTime()) ? fecha : null;

  const nivelLogro = String(req.body?.nivelLogro || '').trim().toUpperCase();
  const nivel = (nivelLogro === 'INICIAL' || nivelLogro === 'BASICO' || nivelLogro === 'AUTONOMO' || nivelLogro === 'EXPERTO')
    ? nivelLogro
    : (nota !== null ? inferNivelLogro(nota) : null);

  if (!alumnoId || !UUID_RE.test(alumnoId)) {
    return res.status(400).json({ error: 'alumnoId must be a UUID' });
  }
  if (!ceRef) {
    return res.status(400).json({ error: 'competenciaEspecificaId is required (UUID or codigo like MAT_CE1)' });
  }
  if (nota === null) {
    return res.status(400).json({ error: 'nota must be a number' });
  }
  if (!nivel) {
    return res.status(400).json({ error: 'nivelLogro invalid and could not be inferred' });
  }

  try {
    const result = await withTx(async (client) => {
      // If you also installed the trigger-based approach, we skip it here to avoid double counting.
      await client.query("SET LOCAL app.skip_progreso_trigger = '1'");

      // Resolve competencia específica and its vinculaciones
      const ceQuery = UUID_RE.test(ceRef)
        ? { text: 'SELECT id, vinculaciones FROM competencias_especificas WHERE id = $1', values: [ceRef] }
        : { text: 'SELECT id, vinculaciones FROM competencias_especificas WHERE codigo = $1', values: [ceRef] };

      const ceRes = await client.query(ceQuery);
      const ceRow = ceRes.rows[0];
      if (!ceRow) {
        const by = UUID_RE.test(ceRef) ? 'id' : 'codigo';
        throw Object.assign(new Error(`Competencia específica not found by ${by}: ${ceRef}`), { status: 404 });
      }

      const competenciaEspecificaId = ceRow.id;
      const vinculaciones = normalizeDescriptorCodes(ceRow.vinculaciones);

      // Ensure descriptors exist (otherwise FK in progreso_descriptores would error anyway).
      if (vinculaciones.length > 0) {
        const existing = await client.query(
          'SELECT codigo FROM descriptores_operativos WHERE codigo = ANY($1::text[])',
          [vinculaciones]
        );
        const have = new Set(existing.rows.map(r => String(r.codigo).toUpperCase()));
        const missing = vinculaciones.filter(c => !have.has(c));
        if (missing.length > 0) {
          throw Object.assign(
            new Error(`Missing descriptores_operativos: ${missing.join(', ')}`),
            { status: 400, details: { missing } }
          );
        }
      }

      // Insert evaluation
      const insEval = await client.query(
        `INSERT INTO evaluaciones (
          alumno_id, competencia_especifica_id, nivel_logro, valor_numerico, evidencia, decision_docente, fecha
        ) VALUES ($1, $2, $3::nivel_logro, $4, $5, $6, COALESCE($7::timestamptz, now()))
        RETURNING id`,
        [alumnoId, competenciaEspecificaId, nivel, nota, evidencia, decisionDocente, fechaOk ? fechaOk.toISOString() : null]
      );

      const evaluacionId = insEval.rows[0].id;

      // Loop: upsert descriptor progress
      for (const descriptorCodigo of vinculaciones) {
        await client.query(
          `INSERT INTO progreso_descriptores (alumno_id, descriptor_codigo, valor_acumulado, contador_registros)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (alumno_id, descriptor_codigo)
           DO UPDATE SET
             valor_acumulado = progreso_descriptores.valor_acumulado + EXCLUDED.valor_acumulado,
             contador_registros = progreso_descriptores.contador_registros + EXCLUDED.contador_registros`,
          [alumnoId, descriptorCodigo, nota]
        );
      }

      return { evaluacionId, competenciaEspecificaId, vinculaciones, nivelLogro: nivel, nota };
    });

    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ error: e?.message || 'Unexpected error', ...(e?.details ? { details: e.details } : {}) });
  }
});

export default router;
