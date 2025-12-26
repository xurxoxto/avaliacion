import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Users, Award, BarChart3 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Teacher, Student, Classroom, Competencia, TaskEvaluation, EvidenceNote } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import { listenCompetencias, seedCompetenciasIfEmpty } from '../utils/firestore/competencias';
import { listenStudents } from '../utils/firestore/students';
import { listenClassrooms } from '../utils/firestore/classrooms';
import { GRADE_COLOR_CLASS, GRADE_LABEL_ES, gradeKeyFromNumeric } from '../utils/triangulation/gradeScale';
import { listenAllTaskEvaluations } from '../lib/firestore/services/taskEvaluationsService';
import { listenAllEvidenceNotes } from '../lib/firestore/services/evidenceNotesService';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

interface AnalyticsPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function AnalyticsPage({ teacher, onLogout }: AnalyticsPageProps) {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [taskEvaluations, setTaskEvaluations] = useState<TaskEvaluation[]>([]);
  const [evidenceNotes, setEvidenceNotes] = useState<EvidenceNote[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>(teacher.classroomIds || []);
  const [studentQuery, setStudentQuery] = useState('');
  const [stats, setStats] = useState({
    totalStudents: 0,
    averageGrade: 0,
    totalEvaluations: 0,
    studentsAbove7: 0,
  });

  useEffect(() => {
    // Local fallback (offline / before listeners hydrate)
    setStudents(storage.getStudents());
    setClassrooms(storage.getClassrooms());
  }, []);

  useEffect(() => {
    if (!teacher.workspaceId) {
      // Legacy/offline mode: keep existing local data only.
      return;
    }

    const unsubStudents = listenStudents(teacher.workspaceId, (items) => {
      setStudents(items);
      storage.saveStudents(items);
    });
    const unsubClassrooms = listenClassrooms(teacher.workspaceId, (items) => {
      setClassrooms(items);
      storage.saveClassrooms(items);
    });
    const unsubTaskEvaluations = listenAllTaskEvaluations(teacher.workspaceId, (items) => {
      setTaskEvaluations(items);
    });
    const unsubEvidenceNotes = listenAllEvidenceNotes(teacher.workspaceId, (items) => {
      setEvidenceNotes(items);
    });

    return () => {
      unsubStudents();
      unsubClassrooms();
      unsubTaskEvaluations();
      unsubEvidenceNotes();
    };
  }, [teacher.workspaceId]);

  useEffect(() => {
    if (!teacher.workspaceId) {
      setCompetencias(storage.getCompetencias());
      return;
    }

    void seedCompetenciasIfEmpty(teacher.workspaceId, storage.getCompetencias()).catch(() => {
      // ignore; may be offline
    });

    const unsub = listenCompetencias(teacher.workspaceId, (items) => setCompetencias(items));
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    // If user has no explicit classroomIds, default to all known classrooms.
    if (!teacher.classroomIds || teacher.classroomIds.length === 0) {
      setSelectedClassroomIds(classrooms.map((c) => c.id));
    }
  }, [classrooms, teacher.classroomIds]);

  const classroomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classrooms) map.set(c.id, `${c.name} (${c.grade})`);
    return map;
  }, [classrooms]);

  const includedClassroomIds = useMemo(() => {
    if (selectedClassroomIds.length > 0) return selectedClassroomIds;
    // If user clears all, treat as none selected => no data
    return [];
  }, [selectedClassroomIds]);

  const filteredStudents = useMemo(() => {
    if (includedClassroomIds.length === 0) return [];
    const inAulas = students.filter(s => includedClassroomIds.includes(s.classroomId));
    const q = studentQuery.trim().toLowerCase();
    if (!q) return inAulas;
    return inAulas.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      `${s.lastName} ${s.firstName}`.toLowerCase().includes(q) ||
      s.listNumber.toString().includes(q)
    );
  }, [students, includedClassroomIds, studentQuery]);

  const filteredTaskEvaluations = useMemo(() => {
    const studentIds = new Set(filteredStudents.map((s) => s.id));
    return taskEvaluations.filter((e) => studentIds.has(e.studentId));
  }, [taskEvaluations, filteredStudents]);

  const filteredEvidenceNotes = useMemo(() => {
    const studentIds = new Set(filteredStudents.map((s) => s.id));
    return evidenceNotes.filter((n) => studentIds.has(n.studentId));
  }, [evidenceNotes, filteredStudents]);

  const studentEvalStats = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; lastDate: number | null }>();
    for (const s of filteredStudents) {
      map.set(s.id, { count: 0, sum: 0, lastDate: null });
    }
    for (const e of filteredTaskEvaluations) {
      const entry = map.get(e.studentId);
      if (!entry) continue;
      entry.count += 1;
      entry.sum += e.numericalValue || 0;
      const t = (e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp)).getTime();
      entry.lastDate = entry.lastDate === null ? t : Math.max(entry.lastDate, t);
    }

    for (const n of filteredEvidenceNotes) {
      const entry = map.get(n.studentId);
      if (!entry) continue;
      entry.count += 1;
      entry.sum += n.numericValue || 0;
      const t = (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt)).getTime();
      entry.lastDate = entry.lastDate === null ? t : Math.max(entry.lastDate, t);
    }
    return map;
  }, [filteredStudents, filteredTaskEvaluations, filteredEvidenceNotes]);

  const studentCompetencyAgg = useMemo(() => {
    // Aggregate evidence into student+competency buckets.
    const map = new Map<string, { sumW: number; sumVW: number }>();

    for (const ev of filteredTaskEvaluations) {
      const links = Array.isArray(ev.links) ? ev.links : [];
      const validLinks = links
        .map((l) => {
          const compId = String((l as any)?.competenciaId ?? '').trim();
          if (!compId) return null;
          const w = typeof (l as any)?.weight === 'number' ? (l as any).weight : Number((l as any)?.weight ?? 0);
          const weight = Number.isFinite(w) ? Math.max(0, w) : 0;
          return { competenciaId: compId, weight };
        })
        .filter(Boolean) as Array<{ competenciaId: string; weight: number }>;

      if (validLinks.length === 0) continue;

      // Normalize weights per evaluation.
      const totalW = validLinks.reduce((acc, l) => acc + (l.weight > 0 ? l.weight : 0), 0);
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
        const perLinkW =
          totalW > 0
            ? l.weight / totalW
            : defaultCompW / Math.max(1, (linksByComp.get(l.competenciaId) || []).length);

        const key = `${ev.studentId}__${l.competenciaId}`;
        const current = map.get(key) || { sumW: 0, sumVW: 0 };
        current.sumW += perLinkW;
        current.sumVW += (ev.numericalValue || 0) * perLinkW;
        map.set(key, current);
      }
    }

    for (const n of filteredEvidenceNotes) {
      const ids = Array.from(new Set((n.competenciaIds || []).map(String).map((s) => s.trim()).filter(Boolean)));
      if (ids.length === 0) continue;
      const perW = 1 / ids.length;
      for (const compId of ids) {
        const key = `${n.studentId}__${compId}`;
        const current = map.get(key) || { sumW: 0, sumVW: 0 };
        current.sumW += perW;
        current.sumVW += (n.numericValue || 0) * perW;
        map.set(key, current);
      }
    }

    return map;
  }, [filteredTaskEvaluations, filteredEvidenceNotes]);

  useEffect(() => {
    const totalStudents = filteredStudents.length;
    const totalEvaluations = filteredTaskEvaluations.length + filteredEvidenceNotes.length;
    const averageGrade = totalStudents > 0
      ? filteredStudents.reduce((sum, s) => {
          const es = studentEvalStats.get(s.id);
          if (!es || es.count === 0) return sum + (s.averageGrade || 0);
          return sum + (es.sum / es.count);
        }, 0) / totalStudents
      : 0;
    const studentsAbove7 = filteredStudents.filter(s => {
      const es = studentEvalStats.get(s.id);
      const avg = es && es.count > 0 ? (es.sum / es.count) : (s.averageGrade || 0);
      return avg >= 7;
    }).length;

    setStats({ totalStudents, averageGrade, totalEvaluations, studentsAbove7 });
  }, [filteredStudents, filteredTaskEvaluations.length, filteredEvidenceNotes.length, studentEvalStats]);

  const competencyAgg = useMemo(() => {
    // Aggregate task evaluations into competencia buckets using links + weights.
    const map = new Map<string, { sumW: number; sumVW: number }>();

    for (const ev of filteredTaskEvaluations) {
      const links = Array.isArray(ev.links) ? ev.links : [];
      const validLinks = links
        .map((l) => {
          const compId = String((l as any)?.competenciaId ?? '').trim();
          if (!compId) return null;
          const w = typeof (l as any)?.weight === 'number' ? (l as any).weight : Number((l as any)?.weight ?? 0);
          const weight = Number.isFinite(w) ? Math.max(0, w) : 0;
          return { competenciaId: compId, weight };
        })
        .filter(Boolean) as Array<{ competenciaId: string; weight: number }>;

      if (validLinks.length === 0) continue;

      // Normalize weights per evaluation.
      const totalW = validLinks.reduce((acc, l) => acc + (l.weight > 0 ? l.weight : 0), 0);
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
        const perLinkW =
          totalW > 0
            ? l.weight / totalW
            : defaultCompW / Math.max(1, (linksByComp.get(l.competenciaId) || []).length);

        const current = map.get(l.competenciaId) || { sumW: 0, sumVW: 0 };
        current.sumW += perLinkW;
        current.sumVW += (ev.numericalValue || 0) * perLinkW;
        map.set(l.competenciaId, current);
      }
    }

    // Aggregate ad-hoc evidence notes: split equally across selected competencias.
    for (const n of filteredEvidenceNotes) {
      const ids = Array.from(new Set((n.competenciaIds || []).map(String).map((s) => s.trim()).filter(Boolean)));
      if (ids.length === 0) continue;
      const perW = 1 / ids.length;
      for (const compId of ids) {
        const current = map.get(compId) || { sumW: 0, sumVW: 0 };
        current.sumW += perW;
        current.sumVW += (n.numericValue || 0) * perW;
        map.set(compId, current);
      }
    }

    return map;
  }, [filteredTaskEvaluations, filteredEvidenceNotes]);

  // Competence distribution data
  const competenceData = {
    labels: competencias.map(c => c.code),
    datasets: [
      {
        label: 'Promedio por Competencia',
        data: competencias.map(comp => {
          const agg = competencyAgg.get(comp.id);
          if (!agg || agg.sumW <= 0) return 0;
          return agg.sumVW / agg.sumW;
        }),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2,
      },
    ],
  };

  // Grade distribution data
  const gradeRanges = ['0-4', '5-6', '7-8', '9-10'];
  const filteredAverages = filteredStudents.map(s => {
    const es = studentEvalStats.get(s.id);
    return es && es.count > 0 ? (es.sum / es.count) : (s.averageGrade || 0);
  });
  const gradeDistribution = {
    labels: gradeRanges,
    datasets: [
      {
        label: 'Estudiantes',
        data: [
          filteredAverages.filter(avg => avg < 5).length,
          filteredAverages.filter(avg => avg >= 5 && avg < 7).length,
          filteredAverages.filter(avg => avg >= 7 && avg < 9).length,
          filteredAverages.filter(avg => avg >= 9).length,
        ],
        backgroundColor: [
          'rgba(239, 68, 68, 0.5)',
          'rgba(59, 130, 246, 0.5)',
          'rgba(234, 179, 8, 0.5)',
          'rgba(34, 197, 94, 0.5)',
        ],
        borderColor: [
          'rgb(239, 68, 68)',
          'rgb(59, 130, 246)',
          'rgb(234, 179, 8)',
          'rgb(34, 197, 94)',
        ],
        borderWidth: 2,
      },
    ],
  };

  // Progress trend data (last 30 days)
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return date;
  });

  const progressTrend = {
    labels: last30Days.map(d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })),
    datasets: [
      {
        label: 'Evidencias por día',
        data: last30Days.map(date => {
          const dateStr = date.toDateString();
          const taskCount = filteredTaskEvaluations.filter(e => {
            const t = (e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp));
            return t.toDateString() === dateStr;
          }).length;
          const noteCount = filteredEvidenceNotes.filter(n => {
            const t = (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt));
            return t.toDateString() === dateStr;
          }).length;
          return taskCount + noteCount;
        }),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
  };

  const evalsPerStudentChart = useMemo(() => {
    const rows = filteredStudents.map(s => {
      const es = studentEvalStats.get(s.id);
      return {
        label: `${s.lastName}, ${s.firstName}`,
        count: es?.count || 0,
      };
    });
    rows.sort((a, b) => b.count - a.count);
    const top = rows.slice(0, 10);

    return {
      labels: top.map(r => r.label),
      datasets: [
        {
          label: 'Evaluaciones',
          data: top.map(r => r.count),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2,
        },
      ],
    };
  }, [filteredStudents, studentEvalStats]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <button
          onClick={() => navigate('/')}
          className="btn-secondary flex items-center justify-center gap-2 mb-6 w-full sm:w-auto"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver al Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary-600" />
            Panel de Analíticas
          </h1>
          <p className="text-gray-600 mt-2">
            Visualiza el progreso y rendimiento de tus estudiantes
          </p>
        </div>

        <div className="card mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Aulas incluidas (grupo)</h2>
          {classrooms.length === 0 ? (
            <p className="text-sm text-gray-600">No hay aulas creadas todavía.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {classrooms
                .filter(c => !teacher.classroomIds || teacher.classroomIds.length === 0 || teacher.classroomIds.includes(c.id))
                .map((c) => (
                  <label key={c.id} className="flex items-start gap-2 text-sm text-gray-700 break-words">
                    <input
                      type="checkbox"
                      checked={selectedClassroomIds.includes(c.id)}
                      onChange={(e) => {
                        setSelectedClassroomIds(prev => {
                          if (e.target.checked) return Array.from(new Set([...prev, c.id]));
                          return prev.filter(id => id !== c.id);
                        });
                      }}
                    />
                    {classroomNameById.get(c.id) || c.name}
                  </label>
                ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">Selecciona varias aulas para ver analíticas del grupo.</p>
        </div>

        <div className="card mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Buscar estudiantes</h2>
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por nombre, apellidos o número de lista..."
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Estudiantes</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalStudents}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Nota Media</p>
                <p className="text-3xl font-bold text-gray-900">{stats.averageGrade.toFixed(1)}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Evaluaciones</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalEvaluations}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Autónomo o Transferencia</p>
                <p className="text-3xl font-bold text-gray-900">{stats.studentsAbove7}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-lg">
                <Award className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Promedio por Competencia Clave
            </h3>
            <div className="h-80">
              <Bar data={competenceData} options={chartOptions} />
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Distribución de Calificaciones
            </h3>
            <div className="h-80 flex items-center justify-center">
              <Doughnut data={gradeDistribution} options={chartOptions} />
            </div>
          </div>
        </div>

        <div className="card mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Evaluaciones por Estudiante (Top 10)</h3>
          <div className="h-80">
            <Bar data={evalsPerStudentChart} options={chartOptions} />
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Tendencia de Evaluaciones (Últimos 30 días)
          </h3>
          <div className="h-80">
            <Line data={progressTrend} options={chartOptions} />
          </div>
        </div>

        <div className="card mt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Analíticas por Estudiante</h3>
          {filteredStudents.length === 0 ? (
            <p className="text-sm text-gray-600">No hay estudiantes en las aulas seleccionadas.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-full px-4 sm:px-0">
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3">Estudiante</th>
                    <th className="py-2 pr-3">Aula</th>
                    <th className="py-2 pr-3">Media</th>
                    <th className="py-2 pr-3">Evaluaciones</th>
                    <th className="py-2 pr-3">Última</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents
                    .slice()
                    .sort((a, b) => {
                      const ea = studentEvalStats.get(a.id);
                      const eb = studentEvalStats.get(b.id);
                      const avga = ea && ea.count > 0 ? ea.sum / ea.count : a.averageGrade;
                      const avgb = eb && eb.count > 0 ? eb.sum / eb.count : b.averageGrade;
                      return avgb - avga;
                    })
                    .map((s) => {
                      const es = studentEvalStats.get(s.id);
                      const avg = es && es.count > 0 ? es.sum / es.count : s.averageGrade;
                      const last = es?.lastDate ? new Date(es.lastDate).toLocaleDateString('es-ES') : '-';
                      return (
                        <tr key={s.id} className="border-t border-gray-100">
                          <td className="py-2.5 pr-3 font-medium text-gray-900">
                            {s.lastName}, {s.firstName}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-700">{classroomNameById.get(s.classroomId) || '-'}</td>
                          <td className="py-2.5 pr-3 text-gray-900">{avg.toFixed(1)}</td>
                          <td className="py-2.5 pr-3 text-gray-700">{es?.count || 0}</td>
                          <td className="py-2.5 pr-3 text-gray-700">{last}</td>
                          <td className="py-2.5 pr-4">
                            <button className="btn-secondary" onClick={() => navigate(`/classroom/${s.classroomId}/student/${s.id}`)}>
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        <div className="card mt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Triangulación (Coordinación)</h3>
          {!teacher.workspaceId ? (
            <p className="text-sm text-gray-600">Inicia sesión para ver la triangulación en tiempo real.</p>
          ) : filteredStudents.length === 0 ? (
            <p className="text-sm text-gray-600">No hay estudiantes en las aulas seleccionadas.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-full px-4 sm:px-0">
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3">Estudiante</th>
                    <th className="py-2 pr-3">Global</th>
                    {competencias.map((c) => (
                      <th key={c.id} className="py-2 pr-3">{c.code}</th>
                    ))}
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const es = studentEvalStats.get(s.id);
                    const fn = es && es.count > 0 ? es.sum / es.count : 0;
                    const fk = gradeKeyFromNumeric(fn);
                    return (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="py-2.5 pr-3 font-medium text-gray-900">{s.lastName}, {s.firstName}</td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[fk]}`} />
                            <span className="text-gray-900 font-semibold">{GRADE_LABEL_ES[fk]}</span>
                            <span className="text-gray-600">({Number.isFinite(fn) ? fn.toFixed(1) : '0.0'})</span>
                          </span>
                        </td>
                        {competencias.map((c) => {
                          const aggKey = `${s.id}__${c.id}`;
                          const agg = studentCompetencyAgg.get(aggKey);
                          const avg = agg && agg.sumW > 0 ? agg.sumVW / agg.sumW : null;
                          const ck = avg == null ? null : gradeKeyFromNumeric(avg);
                          return (
                            <td key={c.id} className="py-2.5 pr-3">
                              {ck ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[ck]}`} />
                                  <span className="text-gray-700">{GRADE_LABEL_ES[ck]}</span>
                                </span>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2.5 pr-4">
                          <button className="btn-secondary" onClick={() => navigate(`/classroom/${s.classroomId}/student/${s.id}`)}>
                            Ver informe
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
