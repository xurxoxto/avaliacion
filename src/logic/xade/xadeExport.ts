import type { Classroom, CriterionEvaluation, Student } from '../../types';
import type { Criterion } from '../criteria/types';

export type XadeCode = 'IN' | 'SU' | 'BI' | 'NT' | 'SB';

export type XadeColumnKey =
  | 'Linguas_G'
  | 'Lingua_C'
  | 'Matematicas'
  | 'C_Naturais'
  | 'C_Sociais'
  | 'Artística'
  | 'E_Fisica'
  | 'Valores';

export const DEFAULT_XADE_COLUMNS: XadeColumnKey[] = [
  'Linguas_G',
  'Lingua_C',
  'Matematicas',
  'C_Naturais',
  'C_Sociais',
  'Artística',
  'E_Fisica',
  'Valores',
];

function normalizeText(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/\s+/g, ' ');
}

export function conversionXade(media: number): XadeCode {
  const m = Number(media);
  if (!Number.isFinite(m) || m <= 0) return 'IN';
  if (m < 2.0) return 'IN';
  if (m < 2.5) return 'SU';
  if (m < 3.0) return 'BI';
  if (m < 3.6) return 'NT';
  return 'SB';
}

export function courseForXade(classroom: Classroom): string {
  const raw = String(classroom?.grade ?? '').trim();
  const m = /(5|6)/.exec(raw);
  if (m) return m[1];
  return raw;
}

export function studentLabelForXade(student: Student): string {
  const last = String(student.lastName || '').trim();
  const first = String(student.firstName || '').trim();
  if (last && first) return `${last}, ${first}`;
  return `${last}${first}`.trim();
}

function areaToColumn(area: string): XadeColumnKey | null {
  const a = normalizeText(area);
  if (!a) return null;

  // Languages
  if (a.includes('galeg') || a.includes('galego') || a.includes('lingua galega')) return 'Linguas_G';
  if (
    a.includes('castellan') ||
    a.includes('castela') ||
    a.includes('lengua castell') ||
    a.includes('lengua espanola') ||
    a.includes('lengua española')
  )
    return 'Lingua_C';

  if (a.includes('matematic')) return 'Matematicas';

  // Ciencias split
  if (a.includes('natur') || a.includes('natureza') || a.includes('natureza')) return 'C_Naturais';
  if (a.includes('social') || a.includes('sociais') || a.includes('sociais')) return 'C_Sociais';

  // PE
  if (a.includes('educacion fisica') || a.includes('educacion física') || a.includes('e. fisica') || a.includes('ef') || a.includes('fisic'))
    return 'E_Fisica';

  // Arts
  if (a.includes('artist') || a.includes('musica') || a.includes('música') || a.includes('plast') || a.includes('visual')) return 'Artística';

  // Values / citizenship
  if (
    a.includes('valor') ||
    a.includes('etica') ||
    a.includes('etico') ||
    a.includes('civic') ||
    a.includes('civica') ||
    a.includes('cívica') ||
    a.includes('social y civica') ||
    a.includes('social e civica')
  )
    return 'Valores';

  return null;
}

export function inferXadeColumnFromArea(area: string): XadeColumnKey | null {
  return areaToColumn(area);
}

export function findUnmappedEvaluatedAreas(params: {
  criteria: Criterion[];
  criterionEvaluations: CriterionEvaluation[];
}): string[] {
  const { criteria, criterionEvaluations } = params;

  const criterionAreaById = new Map<string, string>();
  for (const c of criteria) {
    const id = String((c as any)?.id ?? '').trim();
    if (!id) continue;
    criterionAreaById.set(id, String((c as any)?.area ?? '').trim());
  }

  const usedAreas = new Set<string>();
  for (const e of criterionEvaluations || []) {
    const area = criterionAreaById.get(String(e.criterionId || '').trim()) || '';
    const a = String(area || '').trim();
    if (a) usedAreas.add(a);
  }

  const unmapped: string[] = [];
  for (const a of usedAreas) {
    if (!areaToColumn(a)) unmapped.push(a);
  }

  unmapped.sort((x, y) => x.localeCompare(y, 'es-ES'));
  return unmapped;
}

function escapeCsv(value: string, delimiter: string): string {
  const v = String(value ?? '');
  if (v.includes('"') || v.includes('\n') || v.includes('\r') || v.includes(delimiter)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function generateXadeCsv(params: {
  classroom: Classroom;
  students: Student[];
  criteria: Criterion[];
  criterionEvaluations: CriterionEvaluation[];
  /** Optional. Defaults to semicolon for XADE import. */
  delimiter?: string;
  /** Optional. Defaults to DEFAULT_XADE_COLUMNS. */
  columns?: XadeColumnKey[];
}): string {
  const { classroom, students, criteria, criterionEvaluations } = params;
  const delimiter = params.delimiter ?? ';';
  const columns = params.columns ?? DEFAULT_XADE_COLUMNS;

  const criterionAreaById = new Map<string, string>();
  for (const c of criteria) {
    const id = String((c as any)?.id ?? '').trim();
    if (!id) continue;
    criterionAreaById.set(id, String((c as any)?.area ?? '').trim());
  }

  const studentIds = new Set(students.map((s) => s.id));
  const evals = (criterionEvaluations || []).filter((e) => studentIds.has(e.studentId));

  // Aggregate scores by student + column
  const agg = new Map<string, Map<XadeColumnKey, { sum: number; count: number }>>();
  for (const e of evals) {
    const area = criterionAreaById.get(String(e.criterionId || '').trim()) || '';
    const col = areaToColumn(area);
    if (!col) continue;
    const score = Number(e.score);
    if (!Number.isFinite(score) || score <= 0) continue;

    const byCol = agg.get(e.studentId) || new Map<XadeColumnKey, { sum: number; count: number }>();
    const prev = byCol.get(col) || { sum: 0, count: 0 };
    prev.sum += score;
    prev.count += 1;
    byCol.set(col, prev);
    agg.set(e.studentId, byCol);
  }

  const header = ['NIA', 'Alumno', 'Curso', ...columns].join(delimiter);

  const sortedStudents = students
    .slice()
    .sort(
      (a, b) =>
        (Number(a.listNumber || 0) - Number(b.listNumber || 0)) ||
        studentLabelForXade(a).localeCompare(studentLabelForXade(b), 'es-ES')
    );

  const rows: string[] = [header];
  const course = courseForXade(classroom);

  for (const s of sortedStudents) {
    const nia = String((s as any)?.nia ?? '').trim();
    const alumno = studentLabelForXade(s);
    const byCol = agg.get(s.id) || new Map();

    const values: string[] = [];
    values.push(escapeCsv(nia, delimiter));
    values.push(escapeCsv(alumno, delimiter));
    values.push(escapeCsv(course, delimiter));

    for (const col of columns) {
      const v = byCol.get(col);
      if (!v || v.count === 0) {
        values.push('');
        continue;
      }
      const avg = v.sum / v.count;
      values.push(conversionXade(avg));
    }

    rows.push(values.join(delimiter));
  }

  return rows.join('\n');
}

export function downloadCsvFile(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
