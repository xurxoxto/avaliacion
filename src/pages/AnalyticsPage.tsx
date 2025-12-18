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
import { Teacher, Student, EvaluationEntry, Classroom, Competencia, TriangulationGrade } from '../types';
import { storage } from '../utils/storage';
import Header from '../components/Header';
import { listenAllGrades } from '../utils/firestore/grades';
import { listenCompetencias } from '../utils/firestore/competencias';
import { makeStudentCompetencyKey, useTriangulationGrades } from '../hooks/useTriangulationGrades';
import { GRADE_COLOR_CLASS, GRADE_LABEL_ES } from '../utils/triangulation/gradeScale';
import { generateTriangulationReport } from '../utils/triangulation/reportText';

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
  const [evaluations, setEvaluations] = useState<EvaluationEntry[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>(teacher.classroomIds || []);
  const [studentQuery, setStudentQuery] = useState('');
  const [triGrades, setTriGrades] = useState<TriangulationGrade[]>([]);
  const [reportStudentId, setReportStudentId] = useState<string>('');
  const [stats, setStats] = useState({
    totalStudents: 0,
    averageGrade: 0,
    totalEvaluations: 0,
    studentsAbove7: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!teacher.workspaceId) {
      setCompetencias(storage.getCompetencias());
      return;
    }
    const unsub = listenCompetencias(teacher.workspaceId, (items) => setCompetencias(items));
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    const unsub = listenAllGrades(teacher.workspaceId, (gs) => setTriGrades(gs));
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const custom = evt as CustomEvent<{ source?: string }>;
      if (custom.detail?.source === 'remote') loadData();
    };
    window.addEventListener('avaliacion:data-changed', handler);
    return () => window.removeEventListener('avaliacion:data-changed', handler);
  }, []);

  const loadData = () => {
    const allStudents = storage.getStudents();
    const allEvaluations = storage.getEvaluations();
    const allClassrooms = storage.getClassrooms();

    setStudents(allStudents);
    setEvaluations(allEvaluations);
    setClassrooms(allClassrooms);
    // Competencias come from Firestore when logged in; keep local fallback for offline/logout.
    if (!teacher.workspaceId) setCompetencias(storage.getCompetencias());

    if (!teacher.classroomIds || teacher.classroomIds.length === 0) {
      setSelectedClassroomIds(allClassrooms.map(c => c.id));
    }

    // Stats will be derived from filtered data below
  };

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

  const filteredEvaluations = useMemo(() => {
    const studentIds = new Set(filteredStudents.map(s => s.id));
    return evaluations.filter(e => studentIds.has(e.studentId));
  }, [evaluations, filteredStudents]);

  const filteredTriGrades = useMemo(() => {
    const studentIds = new Set(filteredStudents.map(s => s.id));
    return triGrades.filter(g => studentIds.has(g.studentId));
  }, [triGrades, filteredStudents]);

  const tri = useTriangulationGrades({
    students: filteredStudents,
    competencias,
    grades: filteredTriGrades,
  });

  const reportText = useMemo(() => {
    const sid = reportStudentId || (filteredStudents[0]?.id ?? '');
    if (!sid) return '';
    const s = filteredStudents.find(x => x.id === sid);
    if (!s) return '';
    const keyMap = new Map<string, any>();
    for (const c of competencias) {
      const k = makeStudentCompetencyKey(s.id, c.id);
      const v = tri.competencyAvgKey.get(k);
      if (v) keyMap.set(k, v);
    }
    return generateTriangulationReport({
      studentName: `${s.firstName} ${s.lastName}`,
      competencias,
      competencyKeys: keyMap,
      studentId: s.id,
    });
  }, [reportStudentId, filteredStudents, competencias, tri.competencyAvgKey]);

  const studentEvalStats = useMemo(() => {
    const map = new Map<string, { count: number; sum: number; lastDate: number | null }>();
    for (const s of filteredStudents) {
      map.set(s.id, { count: 0, sum: 0, lastDate: null });
    }
    for (const e of filteredEvaluations) {
      const entry = map.get(e.studentId);
      if (!entry) continue;
      entry.count += 1;
      entry.sum += e.rating;
      const t = new Date(e.date).getTime();
      entry.lastDate = entry.lastDate === null ? t : Math.max(entry.lastDate, t);
    }
    return map;
  }, [filteredStudents, filteredEvaluations]);

  useEffect(() => {
    const totalStudents = filteredStudents.length;
    const totalEvaluations = filteredEvaluations.length;
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
  }, [filteredStudents, filteredEvaluations, studentEvalStats]);

  // Competence distribution data
  const competenceData = {
    labels: competencias.map(c => c.code),
    datasets: [
      {
        label: 'Promedio por Competencia',
        data: competencias.map(comp => {
          const compEvals = filteredEvaluations.filter(e => e.competenciaId === comp.id);
          if (compEvals.length === 0) return 0;
          return compEvals.reduce((sum, e) => sum + e.rating, 0) / compEvals.length;
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
        label: 'Evaluaciones por día',
        data: last30Days.map(date => {
          const dateStr = date.toDateString();
          return filteredEvaluations.filter(e => new Date(e.date).toDateString() === dateStr).length;
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
                <p className="text-sm text-gray-600 mb-1">Notable o Superior</p>
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
                            <button className="btn-secondary" onClick={() => navigate(`/student/${s.id}`)}>
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
                    const fk = tri.finalAvgKey.get(s.id);
                    const fn = tri.finalAvgNumeric.get(s.id);
                    return (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="py-2.5 pr-3 font-medium text-gray-900">{s.lastName}, {s.firstName}</td>
                        <td className="py-2.5 pr-3">
                          {fk ? (
                            <span className="inline-flex items-center gap-2">
                              <span className={`inline-flex w-3 h-3 rounded-full ${GRADE_COLOR_CLASS[fk]}`} />
                              <span className="text-gray-900 font-semibold">{GRADE_LABEL_ES[fk]}</span>
                              <span className="text-gray-600">{typeof fn === 'number' ? `(${fn.toFixed(1)})` : ''}</span>
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        {competencias.map((c) => {
                          const key = makeStudentCompetencyKey(s.id, c.id);
                          const ck = tri.competencyAvgKey.get(key);
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
                          <button
                            className="btn-secondary"
                            onClick={() => setReportStudentId(s.id)}
                          >
                            Informe
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

        {teacher.workspaceId && filteredStudents.length > 0 && (
          <div className="card mt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Generador de informe (Triangulación)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Estudiante</label>
                <select
                  className="input-field"
                  value={reportStudentId || filteredStudents[0].id}
                  onChange={(e) => setReportStudentId(e.target.value)}
                >
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lastName}, {s.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Texto</label>
                <textarea className="input-field" rows={6} readOnly value={reportText} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
