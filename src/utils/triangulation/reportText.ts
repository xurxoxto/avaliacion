import type { Competencia, GradeKey, Project, TriangulationObservation } from '../../types';
import { GRADE_LABEL_ES, GRADE_VALUE, averageNumeric, gradeKeyFromNumeric } from './gradeScale';

function formatDateShortEs(d: Date) {
  try {
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function formatDateLongEs(d: Date) {
  try {
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function oneLine(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripPrefix(line: string, prefix: RegExp): string {
  return oneLine(line.replace(prefix, ''));
}

function parseObservationSections(text: string): {
  evidence: string | null;
  criteria: string | null;
  decision: string | null;
  raw: string;
} {
  const raw = String(text || '').trim();
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const joined = oneLine(raw);

  const evidenceLine = lines.find(l => /^evidencia\b/i.test(l));
  const criteriaLine = lines.find(l => /^(indicador|criterio)\b/i.test(l));
  const decisionLine = lines.find(l => /^decisi[oó]n\s+docente\b/i.test(l))
    || lines.find(l => /^ma[nñ]ana\s+har[eé]\b/i.test(l))
    || lines.find(l => /^siguiente\s+paso\b/i.test(l));

  const evidence = evidenceLine
    ? stripPrefix(evidenceLine, /^evidencia\s*(observable)?\s*:?\s*/i)
    : null;
  const criteria = criteriaLine
    ? stripPrefix(criteriaLine, /^(indicador|criterio)(\/indicador)?\s*:?\s*/i)
    : null;

  let decision: string | null = null;
  if (decisionLine) {
    if (/^decisi[oó]n\s+docente\b/i.test(decisionLine)) {
      decision = stripPrefix(decisionLine, /^decisi[oó]n\s+docente\s*:?\s*/i) || null;
    } else if (/^ma[nñ]ana\s+har[eé]\b/i.test(decisionLine)) {
      const rest = stripPrefix(decisionLine, /^ma[nñ]ana\s+har[eé]\s*:?\s*/i);
      decision = rest ? `Mañana haré: ${rest}` : 'Mañana haré: (definir)';
    } else {
      decision = stripPrefix(decisionLine, /^siguiente\s+paso\s*:?\s*/i) || null;
    }
  }

  // If the user didn't follow the template, keep the raw text as evidence.
  if (!evidence && joined) {
    return { evidence: joined, criteria: criteria || null, decision, raw };
  }

  return { evidence: evidence || null, criteria: criteria || null, decision, raw };
}

function confidenceFromRecentCount(n: number): 'Alta' | 'Media' | 'Baja' {
  if (n >= 5) return 'Alta';
  if (n >= 2) return 'Media';
  return 'Baja';
}

function pickTopN<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return items.slice(0, n);
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
    parts.push(`- Muestra *transferencia* (${GRADE_LABEL_ES.BLUE}) en: ${strong.join(', ')}.`);
  }
  if (ok.length > 0) {
    parts.push(`- Muestra *autonomía* (${GRADE_LABEL_ES.GREEN}) en: ${ok.join(', ')}.`);
  }
  if (needs.length > 0) {
    parts.push(`- Conviene reforzar (${GRADE_LABEL_ES.YELLOW}/${GRADE_LABEL_ES.RED}) en: ${needs.join(', ')}.`);
  }

  if (strong.length === 0 && ok.length === 0 && needs.length === 0) {
    parts.push(`- Aún no hay registros triangulados.`);
  }

  return parts.join('\n');
}

function gradeNumeric(o: TriangulationObservation): number {
  // numericValue is derived; always compute from gradeKey to keep the scale consistent over time.
  return GRADE_VALUE[o.gradeKey];
}

function modeGradeKey(items: TriangulationObservation[]): GradeKey {
  const counts: Record<GradeKey, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
  for (const o of items) counts[o.gradeKey] += 1;

  // Prefer the most frequent; tie-break by higher average numeric and then by most recent.
  const keys: GradeKey[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
  keys.sort((a, b) => {
    const d = counts[b] - counts[a];
    if (d !== 0) return d;

    const avgA = averageNumeric(items.filter(x => x.gradeKey === a).map(gradeNumeric));
    const avgB = averageNumeric(items.filter(x => x.gradeKey === b).map(gradeNumeric));
    if (avgB !== avgA) return avgB - avgA;

    const lastA = Math.max(...items.filter(x => x.gradeKey === a).map(x => x.createdAt?.getTime?.() || 0), 0);
    const lastB = Math.max(...items.filter(x => x.gradeKey === b).map(x => x.createdAt?.getTime?.() || 0), 0);
    return lastB - lastA;
  });

  return keys[0];
}

function trendLabelFor(items: TriangulationObservation[]): string {
  if (items.length < 2) return 'Constante';
  const sorted = [...items].sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
  const sliceN = Math.min(3, sorted.length);
  const early = sorted.slice(0, sliceN).map(gradeNumeric);
  const late = sorted.slice(-sliceN).map(gradeNumeric);
  const d = averageNumeric(late) - averageNumeric(early);
  if (d >= 1.25) return '↗ Mejorando';
  if (d <= -1.25) return '↘ A revisar';
  return 'Constante';
}

function pickEvidenceText(items: TriangulationObservation[]): string | null {
  // Prefer the most recent entry that has an explicit Evidence section.
  const sorted = [...items].sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  for (const o of sorted) {
    const sections = parseObservationSections(o.observation || '');
    if (sections.evidence && oneLine(sections.evidence)) return oneLine(sections.evidence);
  }
  // Fall back to the longest (most informative) observation.
  const candidates = sorted
    .map(o => oneLine(o.observation || ''))
    .filter(Boolean);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || null;
}

function pickDecisionText(items: TriangulationObservation[]): string | null {
  const sorted = [...items].sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  for (const o of sorted) {
    const sections = parseObservationSections(o.observation || '');
    if (sections.decision && oneLine(sections.decision)) return oneLine(sections.decision);
  }
  return null;
}

export function generateTermLearningReport(params: {
  studentName: string;
  classroomGrade?: string;
  termLabel?: string;
  competencias: Competencia[];
  observations: TriangulationObservation[];
  projects: Project[];
  from?: Date;
  to?: Date;
  windowDays?: number;
  maxProjects?: number;
}): string {
  const {
    studentName,
    classroomGrade,
    termLabel,
    competencias,
    observations,
    projects,
    from,
    to,
  } = params;
  const windowDays = params.windowDays ?? 90;
  const maxProjects = params.maxProjects ?? 8;

  const fromTs = from instanceof Date && Number.isFinite(from.getTime()) ? from.getTime() : null;
  const toTs = to instanceof Date && Number.isFinite(to.getTime()) ? to.getTime() : null;

  const now = Date.now();
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;

  const inWindow = observations
    .filter(o => {
      const t = o.createdAt?.getTime?.() || 0;
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t > toTs) return false;
      if (fromTs === null && toTs === null) return t >= cutoff;
      return true;
    })
    .sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));

  const projectNameById = new Map(projects.map(p => [p.id, p.name] as const));

  const allDates = inWindow
    .map(o => (o.createdAt instanceof Date ? o.createdAt : null))
    .filter(Boolean) as Date[];
  allDates.sort((a, b) => a.getTime() - b.getTime());
  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];

  const byComp = new Map<string, TriangulationObservation[]>();
  for (const o of inWindow) {
    const arr = byComp.get(o.competenciaId) || [];
    arr.push(o);
    byComp.set(o.competenciaId, arr);
  }

  const byProject = new Map<string, TriangulationObservation[]>();
  for (const o of inWindow) {
    const pid = o.projectId || 'unknown';
    const arr = byProject.get(pid) || [];
    arr.push(o);
    byProject.set(pid, arr);
  }

  const parts: string[] = [];
  parts.push('# INFORME DE APRENDIZAJE Y PROGRESO');
  const meta: string[] = [];
  meta.push(`Alumno: ${studentName}`);
  if (classroomGrade) meta.push(`Curso: ${classroomGrade}`);
  if (termLabel) meta.push(`Periodo: ${termLabel}`);
  else if (firstDate && lastDate) meta.push(`Periodo: ${formatDateLongEs(firstDate)}–${formatDateLongEs(lastDate)}`);
  else if (fromTs !== null || toTs !== null) {
    const a = fromTs !== null ? formatDateLongEs(new Date(fromTs)) : '—';
    const b = toTs !== null ? formatDateLongEs(new Date(toTs)) : '—';
    meta.push(`Periodo: ${a}–${b}`);
  }
  parts.push(`**${meta.join(' | ')}**`);
  parts.push('');

  // 1) Global
  parts.push('## 1. Visión global (tendencia por competencia)');
  parts.push('');
  parts.push('| Competencia | Nivel predominante | Tendencia |');
  parts.push('| --- | --- | --- |');
  for (const c of competencias) {
    const items = byComp.get(c.id) || [];
    if (items.length === 0) continue;
    const m = modeGradeKey(items);
    const trend = trendLabelFor(items);
    parts.push(`| ${c.code} — ${c.name} | ${GRADE_LABEL_ES[m]} | ${trend} |`);
  }
  if (parts[parts.length - 1] === '| --- | --- | --- |') {
    parts.push('| (Sin evidencias en este periodo) | — | — |');
  }
  parts.push('');

  // 2) Per project synthesis
  parts.push('## 2. Detalle por proyectos / áreas');
  parts.push('');
  const projectEntries = Array.from(byProject.entries())
    .sort((a, b) => {
      const lastA = Math.max(...a[1].map(x => x.createdAt?.getTime?.() || 0), 0);
      const lastB = Math.max(...b[1].map(x => x.createdAt?.getTime?.() || 0), 0);
      return lastB - lastA;
    })
    .slice(0, maxProjects);

  for (const [projectId, items] of projectEntries) {
    const name = projectId === 'unknown'
      ? 'Proyecto'
      : (projectNameById.get(projectId) || 'Proyecto eliminado');

    const projectAvg = averageNumeric(items.map(gradeNumeric));
    const projectKey = gradeKeyFromNumeric(projectAvg);

    parts.push(`### Proyecto: ${name}`);
    parts.push(`Valoración global del proyecto: ${projectAvg.toFixed(1)} (${GRADE_LABEL_ES[projectKey]})`);
    parts.push('');

    // Group within this project by competencia
    const byCompInProject = new Map<string, TriangulationObservation[]>();
    for (const o of items) {
      const arr = byCompInProject.get(o.competenciaId) || [];
      arr.push(o);
      byCompInProject.set(o.competenciaId, arr);
    }

    for (const c of competencias) {
      const list = byCompInProject.get(c.id) || [];
      if (list.length === 0) continue;

      const avg = averageNumeric(list.map(gradeNumeric));
      const key = gradeKeyFromNumeric(avg);
      const evidence = pickEvidenceText(list);
      const decision = pickDecisionText(list);
      parts.push(`#### ${c.code} — ${c.name}`);
      parts.push(`- Nivel alcanzado: ${GRADE_LABEL_ES[key]} (valor medio: ${avg.toFixed(1)})`);
      parts.push('- Lo que hemos observado (evidencias clave):');
      parts.push(evidence ? `> "${evidence}"` : '> (Sin evidencia redactada)');
      parts.push('');
      parts.push('- Próximos pasos (decisión docente consolidada):');
      parts.push(decision ? `> "${decision}"` : '> (Sin decisión docente redactada)');
      parts.push('');
    }
  }

  // 3) Highlights (BLUE)
  const highlights = inWindow
    .filter(o => o.gradeKey === 'BLUE')
    .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  if (highlights.length > 0) {
    const h = highlights[0];
    const comp = competencias.find(c => c.id === h.competenciaId);
    const when = h.createdAt instanceof Date ? formatDateLongEs(h.createdAt) : '';
    const evidence = pickEvidenceText([h]) || oneLine(h.observation || '');
    parts.push('## 3. Destacados del periodo');
    parts.push('');
    parts.push(`Momento destacado (${comp ? `${comp.code} — ${comp.name}` : 'Competencia'}):`);
    parts.push(`> ${when ? `[${when}] ` : ''}${evidence}`);
    parts.push('');
  }

  // 4) Feed-forward from RED/YELLOW
  const ff = inWindow
    .filter(o => o.gradeKey === 'RED' || o.gradeKey === 'YELLOW')
    .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  const feedForward: string[] = [];
  const seen = new Set<string>();
  for (const o of ff) {
    const comp = competencias.find(c => c.id === o.competenciaId);
    const decision = pickDecisionText([o]);
    if (!decision) continue;
    const key = `${comp?.code || o.competenciaId}__${decision}`;
    if (seen.has(key)) continue;
    seen.add(key);
    feedForward.push(`${comp?.code ? `${comp.code}: ` : ''}${decision}`);
    if (feedForward.length >= 4) break;
  }
  if (feedForward.length > 0) {
    parts.push('## 4. Compromiso de mejora (feed-forward)');
    parts.push('');
    feedForward.forEach((x, i) => parts.push(`${i + 1}. ${x}`));
    parts.push('');
  }

  // 5) Optional sumative summary
  if (inWindow.length > 0) {
    const avg = averageNumeric(inWindow.map(gradeNumeric));
    const key = gradeKeyFromNumeric(avg);
    const counts: Record<GradeKey, number> = { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    for (const o of inWindow) counts[o.gradeKey] += 1;
    const pct = (k: GradeKey) => Math.round((counts[k] / inWindow.length) * 100);
    parts.push('## Resumen sumativo (solo si el sistema lo exige)');
    parts.push('');
    parts.push(`Nota media calculada: ${avg.toFixed(1)} (${GRADE_LABEL_ES[key]})`);
    parts.push(`Distribución: ${pct('RED')}% ${GRADE_LABEL_ES.RED} · ${pct('YELLOW')}% ${GRADE_LABEL_ES.YELLOW} · ${pct('GREEN')}% ${GRADE_LABEL_ES.GREEN} · ${pct('BLUE')}% ${GRADE_LABEL_ES.BLUE}`);
    parts.push('');
  }

  if (observations.length > 0 && inWindow.length === 0) {
    if (fromTs !== null || toTs !== null) parts.push('(Nota: hay evidencias, pero no dentro del rango seleccionado.)');
    else parts.push(`(Nota: hay evidencias, pero no dentro de los últimos ${windowDays} días.)`);
    parts.push('');
  }

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

  const now = Date.now();
  const evidenceWindowDays = 45;
  const cutoff = now - evidenceWindowDays * 24 * 60 * 60 * 1000;

  const allDates = observations
    .map(o => (o.createdAt instanceof Date ? o.createdAt : null))
    .filter(Boolean) as Date[];
  allDates.sort((a, b) => a.getTime() - b.getTime());
  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];

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

    const recentCount = list.filter(o => (o.createdAt?.getTime?.() || 0) >= cutoff).length;
    const conf = confidenceFromRecentCount(recentCount);

    // Simple disagreement flag: last 4 evidences show a wide spread.
    const lastN = list.slice(0, 4);
    const numeric = lastN.map(x => Number(x.numericValue)).filter(v => Number.isFinite(v));
    const min = numeric.length ? Math.min(...numeric) : 0;
    const max = numeric.length ? Math.max(...numeric) : 0;
    const needsTeamCheck = (max - min) >= 4; // roughly 2 levels

    const header = `${c.code}: ${c.name} — ${GRADE_LABEL_ES[key]} (${avg.toFixed(1)}) · Confianza ${conf}${needsTeamCheck ? ' · Consensuar criterio' : ''}`;
    if (key === 'BLUE' || key === 'GREEN') strengths.push(header);
    else if (key === 'YELLOW') developing.push(header);
    else priority.push(header);

    const evid = list.slice(0, maxEvidencePerCompetencia);
    for (const e of evid) {
      const when = e.createdAt instanceof Date ? formatDateShortEs(e.createdAt) : '';
      const note = oneLine((e.observation || '').trim());
      if (!note) continue;
      evidenceLines.push(`- [${when}] ${c.code}: ${note}`);
    }

    // Decisions are extracted later in the feed-forward section.
  }

  const parts: string[] = [];

  parts.push(`Informe cualitativo — ${studentName}`);
  parts.push(`Evidencias: ${observations.length}${firstDate && lastDate ? ` · Periodo: ${formatDateLongEs(firstDate)}–${formatDateLongEs(lastDate)}` : ''}`);
  parts.push('');
  parts.push('Mirada formativa (no es una nota): qué está mostrando y qué ajuste hacemos a continuación.');
  parts.push('');

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

  const makeBlock = (title: string, headers: string[]) => {
    if (headers.length === 0) return;
    parts.push(title);
    headers.forEach(h => parts.push(`- ${h}`));
    parts.push('');
  };

  makeBlock('Fortalezas (mantener y extender):', strengths);
  makeBlock('En proceso (consolidación):', developing);
  makeBlock('Prioridad de apoyo (ajuste de enseñanza):', priority);

  // Rebuild a more Sanmartí-like synthesis per competencia using the latest evidence structure.
  const decisionsByComp: Array<{ code: string; when: Date | null; decision: string }> = [];
  const autoregHints: string[] = [];

  for (const c of competencias) {
    const list = byComp.get(c.id) || [];
    if (list.length === 0) continue;
    const latest = list[0];
    const when = latest?.createdAt instanceof Date ? latest.createdAt : null;
    const sections = parseObservationSections(latest?.observation || '');

    if (sections.decision) {
      decisionsByComp.push({ code: c.code, when, decision: sections.decision });
    }

    const raw = oneLine(sections.raw);
    if (/\b(planificar|planifica|revisa|revisi[oó]n|autocorreg|comprobar|verificar|explica|justifica|argumenta)\b/i.test(raw)) {
      if (/\b(planificar|planifica)\b/i.test(raw)) autoregHints.push('Planificar antes de empezar (base de orientación / pasos).');
      if (/\b(revisa|revisi[oó]n|autocorreg|comprobar|verificar)\b/i.test(raw)) autoregHints.push('Revisar con criterios antes de entregar (rúbrica / checklist).');
      if (/\b(explica|justifica|argumenta)\b/i.test(raw)) autoregHints.push('Explicar el porqué (pensamiento en voz alta / enseñar a otro).');
    }
  }

  if (decisionsByComp.length > 0) {
    parts.push('Feed-forward (decisiones docentes próximas):');
    for (const d of pickTopN(decisionsByComp, 6)) {
      const stamp = d.when ? ` (${formatDateShortEs(d.when)})` : '';
      parts.push(`- ${d.code}${stamp}: ${oneLine(d.decision)}`);
    }
    parts.push('');
  }

  if (evidenceLines.length > 0) {
    parts.push('Base de evidencias (muestra):');
    parts.push(...evidenceLines.slice(0, 12));
    parts.push('');
  }

  const uniqAutoreg = Array.from(new Set(autoregHints)).slice(0, 3);
  if (uniqAutoreg.length > 0) {
    parts.push('Autorregulación (pistas para que el alumno se apropie del proceso):');
    uniqAutoreg.forEach(h => parts.push(`- ${h}`));
    parts.push('');
  }

  return parts.join('\n');
}
