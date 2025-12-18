import type { GradeKey } from '../../types';

export const GRADE_KEYS: GradeKey[] = ['BLUE', 'GREEN', 'YELLOW', 'RED'];

export const GRADE_VALUE: Record<GradeKey, number> = {
  BLUE: 9.5,
  GREEN: 7.5,
  YELLOW: 5.5,
  RED: 3.5,
};

export const GRADE_LABEL_ES: Record<GradeKey, string> = {
  BLUE: 'Sobresaliente',
  GREEN: 'Notable',
  YELLOW: 'Suficiente',
  RED: 'Insuficiente',
};

export const GRADE_COLOR_CLASS: Record<GradeKey, string> = {
  BLUE: 'bg-blue-500',
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-400',
  RED: 'bg-red-500',
};

export function gradeKeyFromNumeric(avg: number): GradeKey {
  if (avg >= 8.5) return 'BLUE';
  if (avg >= 6.5) return 'GREEN';
  if (avg >= 4.5) return 'YELLOW';
  return 'RED';
}

export function averageNumeric(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
