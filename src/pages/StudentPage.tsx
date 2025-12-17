import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, FileText, Calendar } from 'lucide-react';
import { Teacher, Student, EvaluationEntry } from '../types';
import { storage } from '../utils/storage';
import { COMPETENCIAS_CLAVE } from '../data/competencias';
import Header from '../components/Header';

interface StudentPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

export default function StudentPage({ teacher, onLogout }: StudentPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationEntry[]>([]);
  const [selectedCompetencia, setSelectedCompetencia] = useState('');
  const [rating, setRating] = useState(5);
  const [observation, setObservation] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<FileList | null>(null);

  useEffect(() => {
    if (id) {
      loadStudent(id);
      loadEvaluations(id);
    }
  }, [id]);

  const loadStudent = (studentId: string) => {
    const allStudents = storage.getStudents();
    const found = allStudents.find(s => s.id === studentId);
    setStudent(found || null);
  };

  const loadEvaluations = (studentId: string) => {
    const allEvaluations = storage.getEvaluations();
    const studentEvaluations = allEvaluations.filter(e => e.studentId === studentId);
    setEvaluations(studentEvaluations);
  };

  const handleSaveObservation = () => {
    if (!student || !selectedCompetencia || !observation.trim()) {
      alert('Por favor completa todos los campos');
      return;
    }

    const newEvaluation: EvaluationEntry = {
      id: Date.now().toString(),
      studentId: student.id,
      competenciaId: selectedCompetencia,
      rating,
      observation: observation.trim(),
      date: new Date(),
      evidenceUrls: evidenceFiles ? Array.from(evidenceFiles).map(f => f.name) : [],
    };

    const allEvaluations = storage.getEvaluations();
    const updatedEvaluations = [...allEvaluations, newEvaluation];
    storage.saveEvaluations(updatedEvaluations);
    setEvaluations([...evaluations, newEvaluation]);

    // Update student average grade
    const studentEvals = updatedEvaluations.filter(e => e.studentId === student.id);
    const avgGrade = studentEvals.reduce((sum, e) => sum + e.rating, 0) / studentEvals.length;
    const progress = Math.min(100, (studentEvals.length / 20) * 100);

    const allStudents = storage.getStudents();
    const updatedStudents = allStudents.map(s =>
      s.id === student.id
        ? { ...s, averageGrade: avgGrade, progress, updatedAt: new Date() }
        : s
    );
    storage.saveStudents(updatedStudents);
    setStudent({ ...student, averageGrade: avgGrade, progress });

    // Reset form
    setObservation('');
    setRating(5);
    setEvidenceFiles(null);
    alert('Observación guardada correctamente');
  };

  if (!student) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header teacher={teacher} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-center text-gray-600">Estudiante no encontrado</p>
        </div>
      </div>
    );
  }

  const getRatingLabel = (rating: number) => {
    if (rating >= 9) return 'Excelente';
    if (rating >= 7) return 'Bueno';
    if (rating >= 5) return 'Suficiente';
    return 'Insuficiente';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary flex items-center gap-2 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Info Card */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {student.firstName} {student.lastName}
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Número de Lista</p>
                  <p className="text-lg font-semibold text-gray-900">#{student.listNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Calificación Media</p>
                  <p className="text-lg font-semibold text-gray-900">{student.averageGrade.toFixed(1)}/10</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Progreso</p>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-primary-600 h-3 rounded-full transition-all"
                      style={{ width: `${student.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{student.progress}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Observaciones</p>
                  <p className="text-lg font-semibold text-gray-900">{evaluations.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Observation Form */}
          <div className="lg:col-span-2">
            <div className="card">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Nueva Observación</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="competencia" className="block text-sm font-medium text-gray-700 mb-2">
                    Competencia Clave
                  </label>
                  <select
                    id="competencia"
                    value={selectedCompetencia}
                    onChange={(e) => setSelectedCompetencia(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Seleccionar competencia...</option>
                    {COMPETENCIAS_CLAVE.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.code}: {comp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-2">
                    Valoración: {rating}/10 - {getRatingLabel(rating)}
                  </label>
                  <input
                    id="rating"
                    type="range"
                    min="1"
                    max="10"
                    value={rating}
                    onChange={(e) => setRating(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>1 (Insuficiente)</span>
                    <span>10 (Excelente)</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="observation" className="block text-sm font-medium text-gray-700 mb-2">
                    Observación
                  </label>
                  <textarea
                    id="observation"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    className="input-field"
                    rows={4}
                    placeholder="Escribe tus observaciones sobre el desempeño del estudiante..."
                  />
                </div>

                <div>
                  <label htmlFor="evidence" className="block text-sm font-medium text-gray-700 mb-2">
                    Evidencias (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="evidence"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => setEvidenceFiles(e.target.files)}
                      className="hidden"
                    />
                    <label
                      htmlFor="evidence"
                      className="btn-secondary cursor-pointer flex items-center gap-2"
                    >
                      <Upload className="w-5 h-5" />
                      Subir archivos
                    </label>
                    {evidenceFiles && evidenceFiles.length > 0 && (
                      <span className="text-sm text-gray-600">
                        {evidenceFiles.length} archivo(s) seleccionado(s)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSaveObservation}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Guardar Observación
                </button>
              </div>
            </div>

            {/* Evaluations History */}
            <div className="card mt-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Historial de Observaciones</h3>

              {evaluations.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No hay observaciones registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {evaluations
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((evaluation) => {
                      const competencia = COMPETENCIAS_CLAVE.find(c => c.id === evaluation.competenciaId);
                      return (
                        <div key={evaluation.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {competencia?.code}: {competencia?.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-600">
                                  {new Date(evaluation.date).toLocaleDateString('es-ES', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              evaluation.rating >= 9 ? 'bg-green-100 text-green-800' :
                              evaluation.rating >= 7 ? 'bg-yellow-100 text-yellow-800' :
                              evaluation.rating >= 5 ? 'bg-blue-100 text-blue-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {evaluation.rating}/10
                            </span>
                          </div>
                          <p className="text-gray-700 mt-2">{evaluation.observation}</p>
                          {evaluation.evidenceUrls && evaluation.evidenceUrls.length > 0 && (
                            <div className="mt-2 text-sm text-gray-600">
                              📎 {evaluation.evidenceUrls.length} archivo(s) adjunto(s)
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
