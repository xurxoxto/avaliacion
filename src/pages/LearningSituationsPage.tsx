import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react';
import type { Competencia, LearningSituation, LearningSituationType, Teacher } from '../types';
import Header from '../components/Header';
import Breadcrumbs from '../components/Breadcrumbs';
import {
  createLearningSituation,
  deleteLearningSituationCascade,
  listenLearningSituations,
  upsertLearningSituation,
} from '../lib/firestore/services/learningSituationsService';
import { listenCompetencias } from '../utils/firestore/competencias';

interface LearningSituationsPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

const TYPE_LABEL: Record<LearningSituation['type'], string> = {
  PROJECT: 'Proyecto',
  TASK: 'Tarea',
  CHALLENGE: 'Reto',
};

export default function LearningSituationsPage({ teacher, onLogout }: LearningSituationsPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<LearningSituation[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<LearningSituationType>('TASK');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCompetencyIds, setDraftCompetencyIds] = useState<string[]>([]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    const unsub = listenLearningSituations(teacher.workspaceId, setItems);
    return () => unsub();
  }, [teacher.workspaceId]);

  useEffect(() => {
    if (!teacher.workspaceId) return;
    const unsub = listenCompetencias(teacher.workspaceId, setCompetencias);
    return () => unsub();
  }, [teacher.workspaceId]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  const openCreate = () => {
    setEditingId('');
    setDraftTitle('');
    setDraftType('TASK');
    setDraftDescription('');
    setDraftCompetencyIds([]);
    setModalOpen(true);
  };

  const openEdit = (s: LearningSituation) => {
    setEditingId(s.id);
    setDraftTitle(s.title || '');
    setDraftType(s.type || 'TASK');
    setDraftDescription(s.description || '');
    setDraftCompetencyIds(Array.isArray(s.relatedCompetencyIds) ? s.relatedCompetencyIds : []);
    setModalOpen(true);
  };

  const toggleCompetency = (id: string) => {
    setDraftCompetencyIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const save = async () => {
    if (!teacher.workspaceId) return;
    const title = draftTitle.trim();
    if (!title) {
      alert('El título es requerido');
      return;
    }
    const payload = {
      title,
      description: draftDescription.trim(),
      type: draftType,
      relatedCompetencyIds: draftCompetencyIds,
    };

    try {
      if (editingId) {
        await upsertLearningSituation(teacher.workspaceId, { id: editingId, ...payload });
      } else {
        await createLearningSituation(teacher.workspaceId, payload);
      }
      setModalOpen(false);
    } catch {
      alert('No se pudo guardar la situación.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Breadcrumbs items={[{ label: 'Situaciones de Aprendizaje', path: '/learning-situations' }]} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Volver al Dashboard
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Situaciones de Aprendizaje</h1>
              <p className="text-gray-600 mt-1">Selecciona una situación para evaluar rápido al grupo.</p>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary flex items-center justify-center gap-2"
            onClick={openCreate}
          >
            <Plus className="w-5 h-5" />
            Crear Situación
          </button>
        </div>

        {!teacher.workspaceId ? (
          <div className="card">
            <p className="text-sm text-gray-700">Necesitas iniciar sesión para acceder a las situaciones.</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay situaciones</h3>
            <p className="mt-1 text-sm text-gray-500">Aún no se han creado situaciones en este workspace.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sorted.map((s) => (
              <div key={s.id} className="card text-left">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="text-left min-w-0 flex-1"
                    onClick={() => navigate(`/learning-situations/${encodeURIComponent(s.id)}`)}
                  >
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{s.title}</h2>
                    <p className="text-sm text-gray-600 mt-1">{TYPE_LABEL[s.type]}</p>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary flex items-center justify-center gap-2"
                    onClick={() => openEdit(s)}
                    title="Editar"
                  >
                    <Pencil className="w-5 h-5" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (!teacher.workspaceId) return;
                      const ok = window.confirm(`¿Eliminar "${s.title}"? Se borrarán también sus tareas y evaluaciones.`);
                      if (!ok) return;
                      deleteLearningSituationCascade(teacher.workspaceId, s.id).catch(() => {
                        alert('No se pudo eliminar la situación.');
                      });
                    }}
                    title="Eliminar"
                  >
                    Eliminar
                  </button>
                </div>

                {s.description ? (
                  <p className="text-sm text-gray-700 mt-3 line-clamp-3">{s.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>

      {modalOpen ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingId ? 'Editar Situación' : 'Nueva Situación'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
                <input
                  className="input-field"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Ej: Exposición oral sobre el huerto"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                  <select
                    className="input-field"
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value as LearningSituationType)}
                  >
                    <option value="TASK">Tarea</option>
                    <option value="PROJECT">Proyecto</option>
                    <option value="CHALLENGE">Reto</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Competencias relacionadas</label>
                  <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-auto bg-white">
                    {competencias.length === 0 ? (
                      <p className="text-sm text-gray-600">Sin competencias</p>
                    ) : (
                      <div className="space-y-2">
                        {competencias.map((c) => {
                          const checked = draftCompetencyIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCompetency(c.id)}
                              />
                              <span className="font-semibold">{c.code}</span>
                              <span className="text-gray-600 truncate">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descripción (opcional)</label>
                <textarea
                  className="input-field"
                  rows={4}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Qué se va a hacer, criterios, condiciones..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn-primary flex-1" onClick={save}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
