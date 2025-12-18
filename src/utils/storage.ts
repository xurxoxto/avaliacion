import { Classroom, Student, EvaluationEntry, Teacher } from '../types';

const STORAGE_KEYS = {
  CLASSROOMS: 'avaliacion_classrooms',
  STUDENTS: 'avaliacion_students',
  EVALUATIONS: 'avaliacion_evaluations',
  TEACHER: 'avaliacion_teacher',
} as const;

export const storage = {
  // Classrooms
  getClassrooms(): Classroom[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLASSROOMS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading classrooms:', error);
      return [];
    }
  },

  saveClassrooms(classrooms: Classroom[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(classrooms));
    } catch (error) {
      console.error('Error saving classrooms:', error);
    }
  },

  // Students
  getStudents(): Student[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading students:', error);
      return [];
    }
  },

  saveStudents(students: Student[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    } catch (error) {
      console.error('Error saving students:', error);
    }
  },

  // Evaluations
  getEvaluations(): EvaluationEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVALUATIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading evaluations:', error);
      return [];
    }
  },

  saveEvaluations(evaluations: EvaluationEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(evaluations));
    } catch (error) {
      console.error('Error saving evaluations:', error);
    }
  },

  // Teacher
  getTeacher(): Teacher | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TEACHER);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading teacher:', error);
      return null;
    }
  },

  saveTeacher(teacher: Teacher): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TEACHER, JSON.stringify(teacher));
    } catch (error) {
      console.error('Error saving teacher:', error);
    }
  },

  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  },
};
