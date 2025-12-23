import { useEffect, useMemo, useState } from 'react';
import type { GradeKey, TaskEvaluation } from '../types';
import { listenTaskEvaluationsForStudent } from '../lib/firestore/services/taskEvaluationsService';
import { gradeKeyFromNumeric } from '../utils/triangulation/gradeScale';

export type Trend = 'UP' | 'DOWN' | 'STABLE';

export interface CompetencyComputed {
  competenciaId: string;
  average: number;
  averageGradeKey: GradeKey;
  count: number;
  latestAt: Date | null;
  latestValue: number | null;
  latestGradeKey: GradeKey;
  latestTrend: Trend;
  lastQuarterAverage: number | null;
  prevQuarterAverage: number | null;
}

function quarterKey(d: Date): string {
  const year = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

function previousQuarterKey(now: Date): string {
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  if (q === 1) return `${year - 1}-Q4`;
  return `${year}-Q${q - 1}`;
}

function trendFromDelta(delta: number, epsilon = 0.25): Trend {
  if (delta > epsilon) return 'UP';
  if (delta < -epsilon) return 'DOWN';
  return 'STABLE';
}

function weightedAverage(items: Array<{ value: number; weight: number }>): number {
  let sumW = 0;
  let sumVW = 0;
  for (const it of items) {
    const w = Number.isFinite(it.weight) ? it.weight : 0;
    const v = Number.isFinite(it.value) ? it.value : 0;
    if (w <= 0) continue;
    sumW += w;
    sumVW += v * w;
  }
  if (sumW <= 0) return 0;
  return sumVW / sumW;
}

/**
 * MVP calculator:
 * - groups evaluations by competenciaId using `relatedCompetencyIds` copied into each evaluation
 * - average is a simple mean of numericalValue
 * - trend compares current quarter avg vs previous quarter avg
 */
export function useCompetencyCalculator(params: {
  workspaceId?: string;
  studentId?: string;
}) {
  const { workspaceId, studentId } = params;
  const [evaluations, setEvaluations] = useState<TaskEvaluation[]>([]);

  useEffect(() => {
    if (!workspaceId || !studentId) {
      setEvaluations([]);
      return;
    }

    const unsub = listenTaskEvaluationsForStudent(workspaceId, studentId, setEvaluations);
    return () => unsub();
  }, [workspaceId, studentId]);

  const computedByCompetency = useMemo(() => {
    const byComp = new Map<
      string,
      {
        items: Array<{ value: number; weight: number; at: Date }>;
        latestAt: Date | null;
        latestValue: number | null;
        byQuarter: Map<string, Array<{ value: number; weight: number }>>;
      }
    >();

    for (const ev of evaluations) {
      const ts = ev.timestamp instanceof Date ? ev.timestamp : new Date(ev.timestamp);
      const qk = quarterKey(ts);

      const links = Array.isArray(ev.links) ? ev.links : [];
      const validLinks = links
        .map((l) => {
          const compId = String(l?.competenciaId ?? '').trim();
          if (!compId) return null;
          const w = typeof l?.weight === 'number' ? l.weight : Number(l?.weight ?? 0);
          const weight = Number.isFinite(w) ? Math.max(0, w) : 0;
          return { competenciaId: compId, weight };
        })
        .filter(Boolean) as Array<{ competenciaId: string; weight: number }>;

      if (validLinks.length === 0) continue;

      const totalW = validLinks.reduce((acc, l) => acc + (l.weight > 0 ? l.weight : 0), 0);
      // If no positive weights are provided, split equally by *competenciaId* (not by link)
      // so multiple subcompetency links don't overweight the same competency.
      const linksByComp = new Map<string, Array<{ competenciaId: string; weight: number }>>();
      if (totalW <= 0) {
        for (const l of validLinks) {
          const arr = linksByComp.get(l.competenciaId) || [];
          arr.push(l);
          linksByComp.set(l.competenciaId, arr);
        }
      }
      const defaultCompW = totalW > 0 ? 0 : 1 / Math.max(1, linksByComp.size);

      for (const l of validLinks) {
        const compId = l.competenciaId;
        const normalizedWeight =
          totalW > 0
            ? l.weight / totalW
            : defaultCompW / Math.max(1, (linksByComp.get(compId) || []).length);

        const entry = byComp.get(compId) || {
          items: [] as Array<{ value: number; weight: number; at: Date }>,
          latestAt: null as Date | null,
          latestValue: null as number | null,
          byQuarter: new Map<string, Array<{ value: number; weight: number }>>(),
        };

        entry.items.push({ value: ev.numericalValue, weight: normalizedWeight, at: ts });

        const arr = entry.byQuarter.get(qk) || [];
        arr.push({ value: ev.numericalValue, weight: normalizedWeight });
        entry.byQuarter.set(qk, arr);

        if (!entry.latestAt || ts.getTime() > entry.latestAt.getTime()) {
          entry.latestAt = ts;
          entry.latestValue = ev.numericalValue;
        }

        byComp.set(compId, entry);
      }
    }

    const now = new Date();
    const currentQ = quarterKey(now);
    const prevQ = previousQuarterKey(now);

    const out = new Map<string, CompetencyComputed>();
    for (const [competenciaId, info] of byComp.entries()) {
      const avg = weightedAverage(info.items);
      const lastVals = info.byQuarter.get(currentQ) || [];
      const prevVals = info.byQuarter.get(prevQ) || [];
      const lastAvg = lastVals.length ? weightedAverage(lastVals) : null;
      const prevAvg = prevVals.length ? weightedAverage(prevVals) : null;

      const trend: Trend =
        lastAvg != null && prevAvg != null ? trendFromDelta(lastAvg - prevAvg) : 'STABLE';

      out.set(competenciaId, {
        competenciaId,
        average: avg,
        averageGradeKey: gradeKeyFromNumeric(avg),
        count: info.items.length,
        latestAt: info.latestAt,
        latestValue: info.latestValue,
        latestGradeKey: gradeKeyFromNumeric(typeof info.latestValue === 'number' ? info.latestValue : avg),
        latestTrend: trend,
        lastQuarterAverage: lastAvg,
        prevQuarterAverage: prevAvg,
      });
    }

    return out;
  }, [evaluations]);

  return {
    evaluations,
    computedByCompetency,
  };
}
