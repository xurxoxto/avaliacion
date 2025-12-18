import { useState, useEffect } from 'react';
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
import { Teacher, Student, EvaluationEntry } from '../types';
import { storage } from '../utils/storage';
import { COMPETENCIAS_CLAVE } from '../data/competencias';
import Header from '../components/Header';

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
  const [evaluations, setEvaluations] = useState<EvaluationEntry[]>([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    averageGrade: 0,
    totalEvaluations: 0,
    studentsAbove7: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const allStudents = storage.getStudents();
    const allEvaluations = storage.getEvaluations();

    setStudents(allStudents);
    setEvaluations(allEvaluations);

    // Calculate statistics
    const totalStudents = allStudents.length;
    const averageGrade = totalStudents > 0
      ? allStudents.reduce((sum, s) => sum + s.averageGrade, 0) / totalStudents
      : 0;
    const studentsAbove7 = allStudents.filter(s => s.averageGrade >= 7).length;

    setStats({
      totalStudents,
      averageGrade,
      totalEvaluations: allEvaluations.length,
      studentsAbove7,
    });
  };

  // Competence distribution data
  const competenceData = {
    labels: COMPETENCIAS_CLAVE.map(c => c.code),
    datasets: [
      {
        label: 'Promedio por Competencia',
        data: COMPETENCIAS_CLAVE.map(comp => {
          const compEvals = evaluations.filter(e => e.competenciaId === comp.id);
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
  const gradeDistribution = {
    labels: gradeRanges,
    datasets: [
      {
        label: 'Estudiantes',
        data: [
          students.filter(s => s.averageGrade < 5).length,
          students.filter(s => s.averageGrade >= 5 && s.averageGrade < 7).length,
          students.filter(s => s.averageGrade >= 7 && s.averageGrade < 9).length,
          students.filter(s => s.averageGrade >= 9).length,
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
          return evaluations.filter(e => new Date(e.date).toDateString() === dateStr).length;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate('/')}
          className="btn-secondary flex items-center gap-2 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver al Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary-600" />
            Panel de Analíticas
          </h1>
          <p className="text-gray-600 mt-2">
            Visualiza el progreso y rendimiento de tus estudiantes
          </p>
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

        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Tendencia de Evaluaciones (Últimos 30 días)
          </h3>
          <div className="h-80">
            <Line data={progressTrend} options={chartOptions} />
          </div>
        </div>
      </main>
    </div>
  );
}
