import type { DoCode } from '../criteria/types';

export interface CriterionEvaluation {
  studentId: string;
  criterionId: string;
  /** 1..4 */
  score: number;
  weight?: number;
  at: Date;
}

export type CriteriaIndex = Map<string, { descriptorCodes: DoCode[]; course: 5 | 6; weight?: number }>;

export type DoScoresByStudent = Map<string, Map<DoCode, { average: number; weightTotal: number; count: number; latestAt: Date | null }>>;

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(4, score));
}

/**
 * Pure DO-granular calculator.
 *
 * Each evaluation contributes its score to every DO attached to its criterion.
 * Weight defaults to 1 (unless `evaluation.weight` or `criteriaIndex.weight` is provided).
 */
export function computeDoScores(params: {
  evaluations: CriterionEvaluation[];
  criteriaIndex: CriteriaIndex;
}): DoScoresByStudent {
  const { evaluations, criteriaIndex } = params;

  const agg = new Map<
    string,
    Map<DoCode, { sumVW: number; sumW: number; count: number; latestAt: Date | null }>
  >();

  for (const e of evaluations) {
    const studentId = String(e.studentId ?? '').trim();
    const criterionId = String(e.criterionId ?? '').trim();
    if (!studentId || !criterionId) continue;

    const crit = criteriaIndex.get(criterionId);
    const codes = crit?.descriptorCodes ?? [];
    if (!Array.isArray(codes) || codes.length === 0) continue;

    const score = clampScore(Number(e.score));
    const w1 = typeof e.weight === 'number' ? e.weight : undefined;
    const w2 = typeof crit?.weight === 'number' ? crit.weight : undefined;
    const w = Number.isFinite(w1 as any) ? Number(w1) : Number.isFinite(w2 as any) ? Number(w2) : 1;
    if (!(w > 0)) continue;

    const at = e.at instanceof Date ? e.at : new Date(e.at);

    const byDo = agg.get(studentId) || new Map();
    for (const raw of codes) {
      const code = String(raw ?? '').trim().toUpperCase();
      if (!code) continue;
      const entry = byDo.get(code) || { sumVW: 0, sumW: 0, count: 0, latestAt: null as Date | null };
      entry.sumVW += score * w;
      entry.sumW += w;
      entry.count += 1;
      if (!entry.latestAt || at.getTime() > entry.latestAt.getTime()) entry.latestAt = at;
      byDo.set(code, entry);
    }
    agg.set(studentId, byDo);
  }

  const out: DoScoresByStudent = new Map();
  for (const [studentId, byDo] of agg.entries()) {
    const mapped = new Map<DoCode, { average: number; weightTotal: number; count: number; latestAt: Date | null }>();
    for (const [doCode, v] of byDo.entries()) {
      mapped.set(doCode, {
        average: v.sumW > 0 ? v.sumVW / v.sumW : 0,
        weightTotal: v.sumW,
        count: v.count,
        latestAt: v.latestAt,
      });
    }
    out.set(studentId, mapped);
  }

  return out;
}

/**
 * Evolutive DO calculator.
 *
 * Computes separate averages per course (5º/6º) and then combines them with evolutive weights.
 * If a student has evidence only in one course, that course is used at 100%.
 */
export function computeDoScoresEvolutive(params: {
  evaluations: CriterionEvaluation[];
  criteriaIndex: CriteriaIndex;
  courseWeights?: { 5: number; 6: number };
}): DoScoresByStudent {
  const { evaluations, criteriaIndex } = params;
  const courseWeights = params.courseWeights ?? { 5: 0.4, 6: 0.6 };

  type Agg = { sumVW: number; sumW: number; count: number; latestAt: Date | null };

  const agg5 = new Map<string, Map<DoCode, Agg>>();
  const agg6 = new Map<string, Map<DoCode, Agg>>();

  const add = (target: Map<string, Map<DoCode, Agg>>, studentId: string, code: DoCode, score: number, w: number, at: Date) => {
    const byDo = target.get(studentId) || new Map<DoCode, Agg>();
    const entry = byDo.get(code) || { sumVW: 0, sumW: 0, count: 0, latestAt: null };
    entry.sumVW += score * w;
    entry.sumW += w;
    entry.count += 1;
    if (!entry.latestAt || at.getTime() > entry.latestAt.getTime()) entry.latestAt = at;
    byDo.set(code, entry);
    target.set(studentId, byDo);
  };

  for (const e of evaluations) {
    const studentId = String(e.studentId ?? '').trim();
    const criterionId = String(e.criterionId ?? '').trim();
    if (!studentId || !criterionId) continue;

    const crit = criteriaIndex.get(criterionId);
    const codes = crit?.descriptorCodes ?? [];
    if (!crit || !Array.isArray(codes) || codes.length === 0) continue;

    const score = clampScore(Number(e.score));
    const w1 = typeof e.weight === 'number' ? e.weight : undefined;
    const w2 = typeof crit?.weight === 'number' ? crit.weight : undefined;
    const w = Number.isFinite(w1 as any) ? Number(w1) : Number.isFinite(w2 as any) ? Number(w2) : 1;
    if (!(w > 0)) continue;

    const at = e.at instanceof Date ? e.at : new Date(e.at);
    const target = crit.course === 6 ? agg6 : agg5;

    for (const raw of codes) {
      const code = String(raw ?? '').trim().toUpperCase();
      if (!code) continue;
      add(target, studentId, code, score, w, at);
    }
  }

  const out: DoScoresByStudent = new Map();
  const studentIds = new Set<string>([...agg5.keys(), ...agg6.keys()]);

  const safeW = (x: number) => (Number.isFinite(x) && x >= 0 ? x : 0);
  const w5 = safeW(courseWeights[5]);
  const w6 = safeW(courseWeights[6]);

  for (const studentId of studentIds) {
    const byDo = new Map<DoCode, { average: number; weightTotal: number; count: number; latestAt: Date | null }>();
    const by5 = agg5.get(studentId) || new Map<DoCode, Agg>();
    const by6 = agg6.get(studentId) || new Map<DoCode, Agg>();
    const doCodes = new Set<DoCode>([...by5.keys(), ...by6.keys()]);

    for (const code of doCodes) {
      const a5 = by5.get(code);
      const a6 = by6.get(code);

      const avg5 = a5 && a5.sumW > 0 ? a5.sumVW / a5.sumW : null;
      const avg6 = a6 && a6.sumW > 0 ? a6.sumVW / a6.sumW : null;

      let avg = 0;
      let wTotal = 0;
      if (avg5 !== null && avg6 !== null) {
        const denom = w5 + w6;
        if (denom > 0) {
          avg = avg5 * (w5 / denom) + avg6 * (w6 / denom);
          wTotal = (a5?.sumW || 0) + (a6?.sumW || 0);
        } else {
          // degenerate: fallback to plain weighted over all evidence.
          const sumVW = (a5?.sumVW || 0) + (a6?.sumVW || 0);
          const sumW = (a5?.sumW || 0) + (a6?.sumW || 0);
          avg = sumW > 0 ? sumVW / sumW : 0;
          wTotal = sumW;
        }
      } else if (avg6 !== null) {
        avg = avg6;
        wTotal = a6?.sumW || 0;
      } else if (avg5 !== null) {
        avg = avg5;
        wTotal = a5?.sumW || 0;
      }

      const count = (a5?.count || 0) + (a6?.count || 0);
      const latestAt = (() => {
        const t5 = a5?.latestAt;
        const t6 = a6?.latestAt;
        if (t5 && t6) return t5.getTime() >= t6.getTime() ? t5 : t6;
        return t6 || t5 || null;
      })();

      byDo.set(code, { average: avg, weightTotal: wTotal, count, latestAt });
    }

    out.set(studentId, byDo);
  }

  return out;
}
