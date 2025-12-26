import Papa from 'papaparse';
import type { Criterion, ParsedCriteriaCsv } from './types';

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectDelimiter(text: string): ',' | ';' {
  const sample = text.split(/\r?\n/).slice(0, 5);
  const semi = sample.reduce((acc, l) => acc + (l.includes(';') ? 1 : 0), 0);
  return semi > 0 ? ';' : ',';
}

function splitDescriptorCodes(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((x) => x.toUpperCase());
}

function parseCourse(raw: unknown): 5 | 6 | null {
  const n = Number(String(raw ?? '').trim());
  return n === 5 || n === 6 ? (n as 5 | 6) : null;
}

/**
 * Parses curriculum criteria CSVs like:
 * `Curso;Área;ID Criterio (Área.Curso.Bloque.Núm);Criterio de evaluación;Descriptor operativo. Competencias Clave`
 */
export function parseCriteriaCsv(text: string): ParsedCriteriaCsv {
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });

  const errors: string[] = [];
  if (parsed.errors?.length) {
    errors.push(...parsed.errors.map((e) => e.message).filter(Boolean));
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];

  const criteria: Criterion[] = [];
  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const map = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) map.set(normalizeHeader(k), v);

    const courseRaw = map.get('curso');
    const areaRaw = map.get('area') ?? map.get('area') ?? map.get('materia');
    const idRaw =
      map.get('id criterio area curso bloque num') ??
      map.get('id criterio') ??
      map.get('id') ??
      map.get('criterio id');
    const textRaw = map.get('criterio de evaluacion') ?? map.get('criterio de evaluacion') ?? map.get('criterio');
    const descRaw = map.get('descriptor operativo competencias clave') ?? map.get('descriptor operativo') ?? map.get('descriptores');

    const course = parseCourse(courseRaw);
    const area = String(areaRaw ?? '').trim();
    const id = String(idRaw ?? '').trim();
    const criterionText = String(textRaw ?? '').trim();
    const descriptorCodes = splitDescriptorCodes(descRaw);

    if (!course) {
      errors.push(`Fila ${rowNumber}: curso inválido`);
      return;
    }
    if (!area) {
      errors.push(`Fila ${rowNumber}: área vacía`);
      return;
    }
    if (!id) {
      errors.push(`Fila ${rowNumber}: ID de criterio vacío`);
      return;
    }
    if (!criterionText) {
      errors.push(`Fila ${rowNumber}: texto de criterio vacío`);
      return;
    }

    criteria.push({
      id,
      course,
      area,
      text: criterionText,
      descriptorCodes,
    });
  });

  return { criteria, errors };
}
