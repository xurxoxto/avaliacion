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
  /** Optional official identifier (XADE). Stored if present but not required for the app. */
  nia?: string;
  firstName: string;
  lastName: string;
  classroomId: string;
  listNumber: number;
  /** Academic level for multi-grade groups (internivel). */
  level?: 5 | 6;
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

export type GradeKey = 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';

export type LearningSituationType = 'PROJECT' | 'TASK' | 'CHALLENGE';

export interface LearningSituation {
  id: string;
  title: string;
  description: string;
  type: LearningSituationType;
  /** Denormalized list of competency IDs this situation contributes to. */
  relatedCompetencyIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskCompetencyLink {
  competenciaId: string;
  /** Optional: link to a specific sub-competencia for precision. */
  subCompetenciaId?: string;
  /** Manual weight (0-100). Interpreted within the task. */
  weight: number;
}

export type AudienceLevel = 5 | 6;

export interface LearningTask {
  id: string;
  learningSituationId: string;
  title: string;
  description: string;
  /** Weighted links to competencias/subcompetencias (manual). */
  links: TaskCompetencyLink[];
  /** Optional: which internivel levels this task applies to. Missing/empty means both (5º and 6º). */
  audienceLevels?: AudienceLevel[];
  /** Optional: achievement text per level (used as teacher-facing guidance). */
  achievementTextByLevel?: Partial<Record<AudienceLevel, string>>;
  /** Optional: if set, task is assigned only to these students (subset across classrooms). */
  assignedStudentIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskEvaluationTeacherEntry {
  rating: GradeKey;
  numericalValue: number;
  observation?: string;
  /** Snapshot of task-level achievement text (per student level) at evaluation time. */
  achievementTextSnapshot?: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  timestamp: Date;
  updatedAt: Date;
}

export interface TaskEvaluation {
  id: string;
  studentId: string;
  learningSituationId: string;
  taskId: string;
  rating: GradeKey;
  numericalValue: number;
  /** Copied at write time from task.links for denormalization. */
  links: TaskCompetencyLink[];
  observation?: string;
  /** Snapshot of task-level achievement text (per student level) at evaluation time. */
  achievementTextSnapshot?: string;
  /** Author information (for multi-teacher collaboration). */
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  /** Per-teacher entries to avoid overwrites when multiple teachers evaluate the same student+task. */
  byTeacher?: Record<string, TaskEvaluationTeacherEntry>;
  timestamp: Date;
  updatedAt: Date;
}

export interface SituationEvaluation {
  id: string;
  studentId: string;
  learningSituationId: string;
  rating: GradeKey;
  numericalValue: number;
  relatedCompetencyIds: string[];
  observation?: string;
  timestamp: Date;
  updatedAt: Date;
}

/**
 * Ad-hoc evidence note (unplanned): a quick, teacher-authored record linked to one or more competencias.
 * Stored outside tasks/situations so it can capture spontaneous classroom evidence.
 */
export interface EvidenceNote {
  id: string;
  studentId: string;
  competenciaIds: string[];
  gradeKey: GradeKey;
  numericValue: number;
  text: string;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Criterion-based evaluation (criterionId -> descriptor DO codes).
 * Score uses 1..4 to match DO granularity calculations.
 */
export interface CriterionEvaluation {
  id: string;
  studentId: string;
  criterionId: string;
  /** 1..4 */
  score: number;
  /** Optional UI-friendly mirror of the score. */
  gradeKey?: GradeKey;
  teacherId?: string;
  teacherName?: string;
  teacherEmail?: string;
  createdAt: Date;
  updatedAt: Date;
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
