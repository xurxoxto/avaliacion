export interface Classroom {
  id: string;
  name: string;
  grade: string;
  studentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  classroomId: string;
  listNumber: number;
  progress: number; // 0-100
  averageGrade: number; // 0-10
  createdAt: Date;
  updatedAt: Date;
}

export interface Competencia {
  id: string;
  code: string;
  name: string;
  description: string;
  subCompetencias?: SubCompetencia[];
  /** Weight for final grade calculation. Defaults to 1. */
  weight?: number;
}

export interface SubCompetencia {
  id: string;
  code?: string;
  name: string;
  description?: string;
  /** Percentage weight (0-100) within its parent competencia. */
  weight?: number;
}

export interface Observation {
  id: string;
  studentId: string;
  teacherId: string;
  date: Date;
  competenciaId: string;
  rating: number; // 1-10
  observation: string;
  evidenceFiles?: string[];
}

export interface EvaluationEntry {
  id: string;
  studentId: string;
  competenciaId: string;
  subCompetenciaId?: string;
  rating: number;
  observation: string;
  date: Date;
  evidenceUrls?: string[];
}

export type GradeKey = 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriangulationGrade {
  id: string;
  workspaceId: string;
  studentId: string;
  projectId: string;
  competenciaId: string;
  gradeKey: GradeKey;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriangulationObservation {
  id: string;
  workspaceId: string;
  studentId: string;
  projectId: string;
  competenciaId: string;
  subCompetenciaId?: string;
  gradeKey: GradeKey;
  /** Numeric value derived from gradeKey (e.g., BLUE=10.0). */
  numericValue: number;
  observation: string;
  /** Author information (for multi-teacher collaboration). */
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt: Date;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  /**
   * Shared workspace key for multi-teacher collaboration (e.g. school domain).
   * Teachers with the same workspaceId see the same data.
   */
  workspaceId?: string;
  classroomIds: string[];
}
