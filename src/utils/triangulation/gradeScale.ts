import type { GradeKey } from '../../types';

export const GRADE_KEYS: GradeKey[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

export const GRADE_VALUE: Record<GradeKey, number> = {
  BLUE: 10.0,
  GREEN: 7.5,
  YELLOW: 5.0,
  RED: 2.5,
};

export const GRADE_LABEL_ES: Record<GradeKey, string> = {
  RED: 'Discrepancia',
  YELLOW: 'Reproductivo',
  GREEN: 'Autónomo',
  BLUE: 'Transferencia',
};

export const GRADE_COLOR_CLASS: Record<GradeKey, string> = {
  BLUE: 'bg-blue-500',
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-400',
  RED: 'bg-red-500',
};

export function gradeKeyFromNumeric(avg: number): GradeKey {
  // Use midpoints between the configured level values.
  const tBlue = (GRADE_VALUE.BLUE + GRADE_VALUE.GREEN) / 2;
  const tGreen = (GRADE_VALUE.GREEN + GRADE_VALUE.YELLOW) / 2;
  const tYellow = (GRADE_VALUE.YELLOW + GRADE_VALUE.RED) / 2;

  if (avg >= tBlue) return 'BLUE';
  if (avg >= tGreen) return 'GREEN';
  if (avg >= tYellow) return 'YELLOW';
  return 'RED';
}

export function averageNumeric(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
