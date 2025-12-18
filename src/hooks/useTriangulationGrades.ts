import { useMemo } from 'react';
import type { Competencia, GradeKey, Student, TriangulationGrade } from '../types';
import { averageNumeric, gradeKeyFromNumeric, GRADE_VALUE } from '../utils/triangulation/gradeScale';

export type StudentCompetencyKey = `${string}__${string}`;

export function makeStudentCompetencyKey(studentId: string, competenciaId: string): StudentCompetencyKey {
  return `${studentId}__${competenciaId}`;
}

export function useTriangulationGrades(params: {
  students: Student[];
  competencias: Competencia[];
  grades: TriangulationGrade[];
}) {
  const { students, competencias, grades } = params;

  return useMemo(() => {
    const competencyAvgNumeric = new Map<StudentCompetencyKey, number>();
    const competencyAvgKey = new Map<StudentCompetencyKey, GradeKey>();
    const finalAvgNumeric = new Map<string, number>();
    const finalAvgKey = new Map<string, GradeKey>();

    // Build grade buckets per student+competency across ALL projects
    const bucket = new Map<StudentCompetencyKey, number[]>();
    for (const g of grades) {
      if (!g.studentId || !g.competenciaId || !g.gradeKey) continue;
      const key = makeStudentCompetencyKey(g.studentId, g.competenciaId);
      const list = bucket.get(key) || [];
      list.push(GRADE_VALUE[g.gradeKey]);
      bucket.set(key, list);
    }

    // Compute competency averages
    for (const s of students) {
      for (const c of competencias) {
        const key = makeStudentCompetencyKey(s.id, c.id);
        const values = bucket.get(key) || [];
        const avg = averageNumeric(values);
        competencyAvgNumeric.set(key, avg);
        competencyAvgKey.set(key, gradeKeyFromNumeric(avg));
      }
    }

    // Compute weighted final grade per student
    const hasPercentWeights = competencias.some(c => typeof c.weight === 'number');
    for (const s of students) {
      let sumWeighted = 0;
      let sumWeights = 0;

      for (const c of competencias) {
        let w: number;
        if (hasPercentWeights) {
          // Treat weight as percentage (0-100). If all are 0, fall back later.
          const pct = typeof c.weight === 'number' ? c.weight : 0;
          w = Math.max(0, pct) / 100;
        } else {
          w = 1;
        }
        const key = makeStudentCompetencyKey(s.id, c.id);
        const avg = competencyAvgNumeric.get(key) ?? 0;
        sumWeighted += avg * w;
        sumWeights += w;
      }

      // If all weights are 0 (misconfigured), fallback to equal weights.
      if (sumWeights === 0 && competencias.length > 0) {
        sumWeighted = 0;
        sumWeights = 0;
        for (const c of competencias) {
          const key = makeStudentCompetencyKey(s.id, c.id);
          const avg = competencyAvgNumeric.get(key) ?? 0;
          sumWeighted += avg;
          sumWeights += 1;
        }
      }

      const finalAvg = sumWeights > 0 ? sumWeighted / sumWeights : 0;
      finalAvgNumeric.set(s.id, finalAvg);
      finalAvgKey.set(s.id, gradeKeyFromNumeric(finalAvg));
    }

    return {
      competencyAvgNumeric,
      competencyAvgKey,
      finalAvgNumeric,
      finalAvgKey,
    };
  }, [students, competencias, grades]);
}
