import type { Competencia, GradeKey, TriangulationObservation } from '../../types';
import { GRADE_LABEL_ES, averageNumeric, gradeKeyFromNumeric } from './gradeScale';

function formatDateShortEs(d: Date) {
  try {
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

export function generateTriangulationReport(params: {
  studentName: string;
  competencias: Competencia[];
  competencyKeys: Map<string, GradeKey>; // key = studentId__competenciaId
  studentId: string;
}): string {
  const { studentName, competencias, competencyKeys, studentId } = params;

  const strong: string[] = [];
  const ok: string[] = [];
  const needs: string[] = [];

  for (const c of competencias) {
    const key = `${studentId}__${c.id}`;
    const g = competencyKeys.get(key);
    if (!g) continue;
    if (g === 'BLUE') strong.push(`${c.code} (${c.name})`);
    else if (g === 'GREEN') ok.push(`${c.code} (${c.name})`);
    else if (g === 'YELLOW') needs.push(`${c.code} (${c.name})`);
    else needs.push(`${c.code} (${c.name})`);
  }

  const parts: string[] = [];
  parts.push(`Informe de progreso de ${studentName}:`);

  if (strong.length > 0) {
    parts.push(`- Muestra *dominio* (Sobresaliente) en: ${strong.join(', ')}.`);
  }
  if (ok.length > 0) {
    parts.push(`- Muestra *competencia* (Notable) en: ${ok.join(', ')}.`);
  }
  if (needs.length > 0) {
    parts.push(`- Conviene reforzar (Suficiente/Insuficiente) en: ${needs.join(', ')}.`);
  }

  if (strong.length === 0 && ok.length === 0 && needs.length === 0) {
    parts.push(`- Aún no hay registros triangulados.`);
  }

  parts.push(`Leyenda: ${Object.entries(GRADE_LABEL_ES).map(([k, v]) => `${k}=${v}`).join(' · ')}`);

  return parts.join('\n');
}

export function generateTriangulationReportFromObservations(params: {
  studentName: string;
  competencias: Competencia[];
  observations: TriangulationObservation[];
  maxEvidencePerCompetencia?: number;
}): string {
  const { studentName, competencias, observations } = params;
  const maxEvidencePerCompetencia = params.maxEvidencePerCompetencia ?? 2;

  const byComp = new Map<string, TriangulationObservation[]>();
  for (const o of observations) {
    if (!o.competenciaId) continue;
    const list = byComp.get(o.competenciaId) || [];
    list.push(o);
    byComp.set(o.competenciaId, list);
  }
  for (const list of byComp.values()) {
    list.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  }

  const strengths: string[] = [];
  const developing: string[] = [];
  const priority: string[] = [];

  const evidenceLines: string[] = [];

  for (const c of competencias) {
    const list = byComp.get(c.id) || [];
    if (list.length === 0) continue;

    const hasSubPercentWeights = (c.subCompetencias || []).some(s => typeof s.weight === 'number');

    let avg: number;
    if (!hasSubPercentWeights) {
      avg = averageNumeric(list.map(x => x.numericValue));
    } else {
      let sumWeighted = 0;
      let sumW = 0;
      for (const o of list) {
        const sub = (c.subCompetencias || []).find(s => s.id === o.subCompetenciaId);
        const w = Math.max(0, Number(sub?.weight ?? 0)) / 100;
        sumWeighted += o.numericValue * w;
        sumW += w;
      }
      if (sumW > 0) avg = sumWeighted / sumW;
      else avg = averageNumeric(list.map(x => x.numericValue));
    }

    const key = gradeKeyFromNumeric(avg);

    const header = `${c.code}: ${c.name} — ${GRADE_LABEL_ES[key]} (${avg.toFixed(1)})`;
    if (key === 'BLUE' || key === 'GREEN') strengths.push(header);
    else if (key === 'YELLOW') developing.push(header);
    else priority.push(header);

    const evid = list.slice(0, maxEvidencePerCompetencia);
    for (const e of evid) {
      const when = e.createdAt instanceof Date ? formatDateShortEs(e.createdAt) : '';
      const note = (e.observation || '').trim();
      if (!note) continue;
      evidenceLines.push(`- [${when}] ${c.code}: ${note}`);
    }
  }

  const parts: string[] = [];
  parts.push(`Informe triangulado de ${studentName}`);
  parts.push('');
  parts.push('Resumen profesional (basado en evidencias registradas):');

  if (strengths.length > 0) {
    parts.push('Fortalezas (mantener y extender):');
    strengths.forEach(s => parts.push(`- ${s}`));
    parts.push('');
  }

  if (developing.length > 0) {
    parts.push('En progreso (consolidación):');
    developing.forEach(s => parts.push(`- ${s}`));
    parts.push('');
  }

  if (priority.length > 0) {
    parts.push('Prioridad de apoyo (plan de mejora):');
    priority.forEach(s => parts.push(`- ${s}`));
    parts.push('');
  }

  if (evidenceLines.length > 0) {
    parts.push('Evidencias recientes:');
    parts.push(...evidenceLines);
  } else {
    parts.push('No hay observaciones escritas todavía.');
  }

  parts.push('');
  parts.push(`Leyenda: ${Object.entries(GRADE_LABEL_ES).map(([k, v]) => `${k}=${v}`).join(' · ')}`);

  return parts.join('\n');
}
