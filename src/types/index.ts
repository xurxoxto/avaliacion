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
  rating: number;
  observation: string;
  date: Date;
  evidenceUrls?: string[];
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  classroomIds: string[];
}
