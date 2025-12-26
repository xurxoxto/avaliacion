import { Classroom, Student, Teacher, Competencia } from '../types';
import { COMPETENCIAS_CLAVE, withDefaultLomloeSubCompetencias } from '../data/competencias';

export const STORAGE_KEYS = {
  CLASSROOMS: 'avaliacion_classrooms',
  STUDENTS: 'avaliacion_students',
  TEACHER: 'avaliacion_teacher',
  COMPETENCIAS: 'avaliacion_competencias',
  ALERTS: 'avaliacion_alerts_v1',
  WORKSPACE_SETTINGS: 'avaliacion_workspace_settings_v1',
} as const;

function notifyDataChanged(source: 'local' | 'remote' = 'local') {
  try {
    window.dispatchEvent(new CustomEvent('avaliacion:data-changed', { detail: { source } }));
  } catch {
    // no-op (e.g. SSR)
  }
}

export const storage = {
  cleanupLegacy(): void {
    // We are Firestore-first online. Remove legacy local-only datasets.
    try {
      localStorage.removeItem('avaliacion_evaluations');
    } catch {
      // ignore
    }
  },

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
        nia: typeof s?.nia === 'string' ? s.nia : undefined,
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

  // Alerts (derived UI state)
  getAlerts<T = unknown>(): T | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ALERTS);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  },

  saveAlerts(value: unknown): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(value));
      notifyDataChanged('local');
    } catch {
      // ignore
    }
  },

  // Workspace settings (small config)
  getWorkspaceSettings<T = unknown>(): T | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKSPACE_SETTINGS);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  },

  saveWorkspaceSettings(value: unknown): void {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_SETTINGS, JSON.stringify(value));
      notifyDataChanged('local');
    } catch {
      // ignore
    }
  },
};
