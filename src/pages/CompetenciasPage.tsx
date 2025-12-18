import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import Header from '../components/Header';
import { storage } from '../utils/storage';
import type { Competencia, SubCompetencia, Teacher } from '../types';
import { useRemoteRefresh } from '../utils/useRemoteRefresh';
import {
  deleteCompetencia as deleteCompetenciaRemote,
  listenCompetencias,
  seedCompetenciasIfEmpty,
  upsertCompetencia,
} from '../utils/firestore/competencias';

interface CompetenciasPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CompetenciasPage({ teacher, onLogout }: CompetenciasPageProps) {
  const navigate = useNavigate();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef<Map<string, Competencia>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [showSharedNotice, setShowSharedNotice] = useState(() => {
    try {
      return window.localStorage.getItem('avaliacion_competencias_firestore_notice_v1') !== '1';
    } catch {
      return true;
    }
  });

  const [newComp, setNewComp] = useState({ code: '', name: '', description: '' });

  const recomputePending = () => {
    setPendingCount(saveTimersRef.current.size + inflightRef.current.size + dirtyRef.current.size);
  };

  const flushDirty = () => {
    if (!teacher.workspaceId) return;
    if (dirtyRef.current.size === 0) return;

    for (const c of dirtyRef.current.values()) {
      inflightRef.current.add(c.id);
      // Fire and forget; each success clears dirty; failures keep it dirty.
      void upsertCompetencia(teacher.workspaceId, c)
        .then(() => {
          dirtyRef.current.delete(c.id);
        })
        .catch(() => {
          // keep dirty
        })
        .finally(() => {
          inflightRef.current.delete(c.id);
          recomputePending();
        });
    }

    recomputePending();
  };

  useEffect(() => {
    const on = () => {
      setIsOnline(true);
      flushDirty();
    };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
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
    return () => {
      unsub();
      // Cancel any pending local timers
      for (const t of saveTimersRef.current.values()) window.clearTimeout(t);
      saveTimersRef.current.clear();
      inflightRef.current.clear();
      dirtyRef.current.clear();
      setPendingCount(0);
    };
  }, []);

  useRemoteRefresh(() => {
    if (!teacher.workspaceId) setCompetencias(storage.getCompetencias());
  });

  const competenciaById = useMemo(() => {
    const map = new Map<string, Competencia>();
    for (const c of competencias) map.set(c.id, c);
    return map;
  }, [competencias]);

  const queueUpsert = (competencia: Competencia) => {
    if (!teacher.workspaceId) return;
    const existing = saveTimersRef.current.get(competencia.id);
    if (existing) window.clearTimeout(existing);

    // Track as unsynced until a write succeeds
    dirtyRef.current.set(competencia.id, competencia);
    inflightRef.current.delete(competencia.id);
    const t = window.setTimeout(() => {
      saveTimersRef.current.delete(competencia.id);
      inflightRef.current.add(competencia.id);
      recomputePending();
      void upsertCompetencia(teacher.workspaceId!, competencia)
        .then(() => {
          dirtyRef.current.delete(competencia.id);
        })
        .catch(() => {
          // Keep dirty for retry when back online
        })
        .finally(() => {
          inflightRef.current.delete(competencia.id);
          recomputePending();
        });
    }, 400);
    saveTimersRef.current.set(competencia.id, t);
    recomputePending();
  };

  const updateCompetencia = (id: string, patch: Partial<Competencia>) => {
    const next = competencias.map(c => (c.id === id ? { ...c, ...patch } : c));
    setCompetencias(next);
    const updated = next.find(c => c.id === id);
    if (!updated) return;
    if (teacher.workspaceId) {
      queueUpsert(updated);
    }
  };

  const deleteCompetencia = (id: string) => {
    const comp = competenciaById.get(id);
    if (!comp) return;
    const ok = confirm(`Eliminar "${comp.code}: ${comp.name}"?`);
    if (!ok) return;
    if (teacher.workspaceId) {
      // Optimistic UI
      setCompetencias(competencias.filter(c => c.id !== id));
      void deleteCompetenciaRemote(teacher.workspaceId, id).catch(() => {
        alert('No se pudo eliminar en la nube. Revisa tu conexión.');
      });
    }
  };

  const addCompetencia = () => {
    if (!newComp.code.trim() || !newComp.name.trim()) {
      alert('Completa al menos el código y el nombre');
      return;
    }
    const created: Competencia = {
      id: newId('comp'),
      code: newComp.code.trim(),
      name: newComp.name.trim(),
      description: newComp.description.trim(),
      weight: 1,
      subCompetencias: [],
    };
    const next = [created, ...competencias];
    setCompetencias(next);
    if (teacher.workspaceId) {
      queueUpsert(created);
    }
    setNewComp({ code: '', name: '', description: '' });
  };

  const addSubCompetencia = (competenciaId: string) => {
    const comp = competenciaById.get(competenciaId);
    if (!comp) return;

    const name = prompt('Nombre de la sub-competencia');
    if (!name || !name.trim()) return;

    const code = prompt('Código (opcional)');
    const desc = prompt('Descripción (opcional)');

    const sub: SubCompetencia = {
      id: newId('sub'),
      name: name.trim(),
      code: code?.trim() || undefined,
      description: desc?.trim() || undefined,
      weight: 0,
    };

    const nextSubs = [...(comp.subCompetencias || []), sub];
    updateCompetencia(competenciaId, { subCompetencias: nextSubs });
  };

  const updateSubCompetencia = (competenciaId: string, subId: string, patch: Partial<SubCompetencia>) => {
    const comp = competenciaById.get(competenciaId);
    if (!comp) return;
    const nextSubs = (comp.subCompetencias || []).map(s => (s.id === subId ? { ...s, ...patch } : s));
    updateCompetencia(competenciaId, { subCompetencias: nextSubs });
  };

  const deleteSubCompetencia = (competenciaId: string, subId: string) => {
    const comp = competenciaById.get(competenciaId);
    if (!comp) return;
    const sub = (comp.subCompetencias || []).find(s => s.id === subId);
    if (!sub) return;
    const ok = confirm(`Eliminar sub-competencia "${sub.code ? sub.code + ': ' : ''}${sub.name}"?`);
    if (!ok) return;
    const nextSubs = (comp.subCompetencias || []).filter(s => s.id !== subId);
    updateCompetencia(competenciaId, { subCompetencias: nextSubs });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <button onClick={() => navigate('/')} className="btn-secondary flex items-center justify-center gap-2 mb-6 w-full sm:w-auto">
          <ArrowLeft className="w-5 h-5" />
          Volver al Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Competencias</h1>
          <p className="text-gray-600 mt-2">Edita competencias y añade sub-competencias.</p>
          <p className="text-sm text-gray-500 mt-2">Los pesos se expresan en porcentaje (0–100).</p>

          {teacher.workspaceId && showSharedNotice && (
            <div className="card mt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-700">
                  Ahora las competencias se guardan en la nube y se comparten con todo el equipo del centro.
                </p>
                <button
                  className="btn-secondary h-10"
                  onClick={() => {
                    try {
                      window.localStorage.setItem('avaliacion_competencias_firestore_notice_v1', '1');
                    } catch {
                      // ignore
                    }
                    setShowSharedNotice(false);
                  }}
                >
                  Entendido
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Añadir Competencia</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <input
              className="input-field h-10 md:w-32 md:justify-self-start px-3 py-2 text-sm font-semibold tracking-wide uppercase"
              placeholder="Código (p.ej. C1)"
              value={newComp.code}
              onChange={(e) => setNewComp(v => ({ ...v, code: e.target.value }))}
            />
            <input
              className="input-field md:col-span-2"
              placeholder="Nombre"
              value={newComp.name}
              onChange={(e) => setNewComp(v => ({ ...v, name: e.target.value }))}
            />
            <button className="btn-primary flex items-center justify-center gap-2" onClick={addCompetencia}>
              <Plus className="w-5 h-5" />
              Añadir
            </button>
            <textarea
              className="input-field md:col-span-4"
              placeholder="Descripción (opcional)"
              rows={2}
              value={newComp.description}
              onChange={(e) => setNewComp(v => ({ ...v, description: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-6">
          {competencias.map((comp) => (
            <div key={comp.id} className="card">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                  <input
                    className="input-field h-10 md:col-span-2 md:justify-self-start px-3 py-2 text-sm font-semibold tracking-wide uppercase"
                    value={comp.code}
                    onChange={(e) => updateCompetencia(comp.id, { code: e.target.value })}
                    aria-label="Código"
                  />
                  <input
                    className="input-field h-10 md:col-span-6"
                    value={comp.name}
                    onChange={(e) => updateCompetencia(comp.id, { name: e.target.value })}
                    aria-label="Nombre"
                  />
                  <div className="relative md:col-span-2">
                    <input
                      className="input-field h-10 w-28 md:w-full md:justify-self-start px-3 py-2 pr-9 text-sm text-right tabular-nums"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={typeof comp.weight === 'number' ? comp.weight : 0}
                      onChange={(e) => updateCompetencia(comp.id, { weight: Number(e.target.value) })}
                      aria-label="Peso (%)"
                      placeholder="Peso"
                      title="Peso (%) para la nota final"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">%</span>
                  </div>
                  <button
                    className="btn-secondary flex items-center justify-center gap-2 h-10 md:col-span-2"
                    onClick={() => addSubCompetencia(comp.id)}
                  >
                    <Plus className="w-5 h-5" />
                    Sub-competencia
                  </button>
                  <textarea
                    className="input-field md:col-span-12"
                    rows={2}
                    value={comp.description}
                    onChange={(e) => updateCompetencia(comp.id, { description: e.target.value })}
                    aria-label="Descripción"
                  />
                </div>

                <button
                  className="btn-secondary flex items-center justify-center gap-2 self-end md:self-start"
                  onClick={() => deleteCompetencia(comp.id)}
                  title="Eliminar competencia"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Sub-competencias</h3>
                {(comp.subCompetencias && comp.subCompetencias.length > 0) ? (
                  <div className="space-y-3">
                    {comp.subCompetencias.map((sub) => (
                      <div key={sub.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          <input
                            className="input-field h-10 md:col-span-2 md:justify-self-start px-3 py-2 text-sm font-semibold tracking-wide uppercase"
                            value={sub.code || ''}
                            onChange={(e) => updateSubCompetencia(comp.id, sub.id, { code: e.target.value || undefined })}
                            placeholder="Código (opcional)"
                          />
                          <input
                            className="input-field h-10 md:col-span-6"
                            value={sub.name}
                            onChange={(e) => updateSubCompetencia(comp.id, sub.id, { name: e.target.value })}
                            placeholder="Nombre"
                          />
                          <div className="relative md:col-span-2">
                            <input
                              className="input-field h-10 w-28 md:w-full md:justify-self-start px-3 py-2 pr-9 text-sm text-right tabular-nums"
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={typeof sub.weight === 'number' ? sub.weight : 0}
                              onChange={(e) => updateSubCompetencia(comp.id, sub.id, { weight: Number(e.target.value) })}
                              placeholder="Peso"
                              title="Peso (%) dentro de la competencia"
                            />
                            <span className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-500">%</span>
                          </div>
                          <button
                            className="btn-secondary flex items-center justify-center gap-2 h-10 md:col-span-2"
                            onClick={() => deleteSubCompetencia(comp.id, sub.id)}
                            title="Eliminar sub-competencia"
                          >
                            <Trash2 className="w-5 h-5" />
                            Eliminar
                          </button>
                          <textarea
                            className="input-field md:col-span-12"
                            rows={2}
                            value={sub.description || ''}
                            onChange={(e) => updateSubCompetencia(comp.id, sub.id, { description: e.target.value || undefined })}
                            placeholder="Descripción (opcional)"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No hay sub-competencias todavía.</p>
                )}
              </div>

              <div className="mt-4 text-xs text-gray-500 flex items-center gap-2">
                <Save className="w-4 h-4" />
                {!teacher.workspaceId
                  ? 'Guardado automáticamente en este navegador'
                  : (!isOnline
                      ? (pendingCount > 0 ? 'Sin conexión: cambios pendientes' : 'Sin conexión')
                      : (pendingCount > 0 ? 'Sincronizando…' : 'Guardado y sincronizado para el equipo'))}
              </div>
            </div>
          ))}

          {competencias.length === 0 && (
            <div className="card">
              <p className="text-gray-600">No hay competencias configuradas.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
