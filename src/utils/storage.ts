import { Classroom, Student, EvaluationEntry, Teacher, Competencia } from '../types';
import { COMPETENCIAS_CLAVE, withDefaultLomloeSubCompetencias } from '../data/competencias';

export const STORAGE_KEYS = {
  CLASSROOMS: 'avaliacion_classrooms',
  STUDENTS: 'avaliacion_students',
  EVALUATIONS: 'avaliacion_evaluations',
  TEACHER: 'avaliacion_teacher',
  COMPETENCIAS: 'avaliacion_competencias',
  /** Monotonic-ish timestamp used for cloud sync conflict resolution. */
  SYNC_UPDATED_AT: 'avaliacion_sync_updatedAt',
} as const;

function notifyDataChanged(source: 'local' | 'remote' = 'local') {
  try {
    if (source === 'local') {
      // Persist a last-updated marker so new devices don't overwrite remote with empty local data.
      localStorage.setItem(STORAGE_KEYS.SYNC_UPDATED_AT, String(Date.now()));
    }
    window.dispatchEvent(new CustomEvent('avaliacion:data-changed', { detail: { source } }));
  } catch {
    // no-op (e.g. SSR)
  }
}

function normalizeDate(value: any): Date {
  try {
    if (!value) return new Date(0);
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? new Date(0) : d;
    }
    if (typeof value === 'object') {
      if (typeof (value as any).toDate === 'function') {
        const d = (value as any).toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date(0);
      }
      if (typeof (value as any).seconds === 'number') {
        const d = new Date((value as any).seconds * 1000);
        return Number.isNaN(d.getTime()) ? new Date(0) : d;
      }
    }
    return new Date(0);
  } catch {
    return new Date(0);
  }
}

export const storage = {
  // Classrooms
  getClassrooms(): Classroom[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLASSROOMS);
      const parsed = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((c: any) => ({
        ...c,
        id: String(c?.id ?? ''),
        name: String(c?.name ?? ''),
        grade: String(c?.grade ?? ''),
        studentCount: Number(c?.studentCount ?? 0) || 0,
        createdAt: c?.createdAt,
        updatedAt: c?.updatedAt,
      })) as Classroom[];
    } catch (error) {
      console.error('Error loading classrooms:', error);
      return [];
    }
  },

  saveClassrooms(classrooms: Classroom[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(classrooms));
      notifyDataChanged('local');
    } catch (error) {
      console.error('Error saving classrooms:', error);
    }
  },

  // Students
  getStudents(): Student[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      const parsed = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((s: any) => ({
        ...s,
        id: String(s?.id ?? ''),
        firstName: String(s?.firstName ?? ''),
        lastName: String(s?.lastName ?? ''),
        classroomId: String(s?.classroomId ?? ''),
        listNumber: Number(s?.listNumber ?? 0) || 0,
        progress: Number(s?.progress ?? 0) || 0,
        averageGrade: Number(s?.averageGrade ?? 0) || 0,
        createdAt: s?.createdAt,
        updatedAt: s?.updatedAt,
      })) as Student[];
    } catch (error) {
      console.error('Error loading students:', error);
      return [];
    }
  },

  saveStudents(students: Student[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
      notifyDataChanged('local');
    } catch (error) {
      console.error('Error saving students:', error);
    }
  },

  // Evaluations
  getEvaluations(): EvaluationEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVALUATIONS);
      const parsed = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e: any) => ({
        ...e,
        id: String(e?.id ?? ''),
        studentId: String(e?.studentId ?? ''),
        competenciaId: String(e?.competenciaId ?? ''),
        subCompetenciaId: e?.subCompetenciaId ? String(e.subCompetenciaId) : undefined,
        rating: Number(e?.rating ?? 0) || 0,
        observation: String(e?.observation ?? ''),
        date: normalizeDate(e?.date),
        evidenceUrls: Array.isArray(e?.evidenceUrls) ? e.evidenceUrls : [],
      })) as EvaluationEntry[];
    } catch (error) {
      console.error('Error loading evaluations:', error);
      return [];
    }
  },

  saveEvaluations(evaluations: EvaluationEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(evaluations));
      notifyDataChanged('local');
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
      notifyDataChanged('local');
    } catch (error) {
      console.error('Error saving teacher:', error);
    }
  },

  clearTeacher(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.TEACHER);
      notifyDataChanged('local');
    } catch (error) {
      console.error('Error clearing teacher:', error);
    }
  },

  // Competencias (editable)
  getCompetencias(): Competencia[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COMPETENCIAS);
      if (!data) return COMPETENCIAS_CLAVE;
      const parsed = JSON.parse(data);

      if (!Array.isArray(parsed)) return COMPETENCIAS_CLAVE;

      // One-time migration: legacy defaults used C1..C7. If local data still matches that
      // default shape, replace it with the current LOMLOE set.
      const legacyCodes = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
      const legacyIds = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
      const looksLikeLegacyDefaults =
        parsed.length === 7 &&
        parsed.every((c: any) => legacyIds.has(String(c?.id ?? '')) && legacyCodes.has(String(c?.code ?? '')));

      if (looksLikeLegacyDefaults) {
        try {
          localStorage.setItem(STORAGE_KEYS.COMPETENCIAS, JSON.stringify(COMPETENCIAS_CLAVE));
        } catch {
          // ignore
        }
        return COMPETENCIAS_CLAVE;
      }

      const enriched = withDefaultLomloeSubCompetencias(parsed as Competencia[]);
      if (enriched !== parsed) {
        try {
          localStorage.setItem(STORAGE_KEYS.COMPETENCIAS, JSON.stringify(enriched));
        } catch {
          // ignore
        }
      }
      return enriched as Competencia[];
    } catch (error) {
      console.error('Error loading competencias:', error);
      return COMPETENCIAS_CLAVE;
    }
  },

  saveCompetencias(competencias: Competencia[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.COMPETENCIAS, JSON.stringify(competencias));
      notifyDataChanged('local');
    } catch (error) {
      console.error('Error saving competencias:', error);
    }
  },

  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    notifyDataChanged('local');
  },
};
