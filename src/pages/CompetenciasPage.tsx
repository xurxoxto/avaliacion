import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, Edit3 } from 'lucide-react';
import Header from '../components/Header';
import { storage } from '../utils/storage';
import type { Competencia, SubCompetencia, Teacher } from '../types';
import type { Criterion } from '../logic/criteria/types';
import { useRemoteRefresh } from '../utils/useRemoteRefresh';
import {
  LOMLOE_COMPETENCE_CODES,
  LOMLOE_RELATIONSHIP_SOURCE_URL,
  normalizeCompetenceCode,
} from '../data/competencias';
import {
  deleteCompetencia as deleteCompetenciaRemote,
  listenCompetencias,
  seedCompetenciasIfEmpty,
  upsertCompetencia,
} from '../utils/firestore/competencias';
import {
  listenCriteria,
  upsertCriterion,
  deleteCriterion,
  seedCriteriaFromCSV,
} from '../lib/firestore/services/criteriaService';

interface CompetenciasPageProps {
  teacher: Teacher;
  onLogout: () => void;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CompetenciasPage({ teacher, onLogout }: CompetenciasPageProps) {
  const navigate = useNavigate();
  const [competencias, setCompetencias] = useState<Competencia[]>(() => storage.getCompetencias());
  const [editingCompetenciaId, setEditingCompetenciaId] = useState<string>('');
  const [newSubByCompetenciaId, setNewSubByCompetenciaId] = useState<Record<string, { code: string; name: string; description: string }>>({});
  const compRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
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

  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [editingCriterionId, setEditingCriterionId] = useState<string>('');
  const [newCriterion, setNewCriterion] = useState({
    id: '',
    course: 5 as 5 | 6,
    area: '',
    text: '',
    descriptorCodes: [] as string[],
  });
  const [activeTab, setActiveTab] = useState<'competencias' | 'criterios'>('competencias');
  const [isSeedingCriteria, setIsSeedingCriteria] = useState(false);

  // Search states
  const [competenciasSearch, setCompetenciasSearch] = useState('');
  const [criteriosSearch, setCriteriosSearch] = useState('');
  const [criteriosGroupBy, setCriteriosGroupBy] = useState<'area' | 'course' | 'competencia'>('area');

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
    // Always show a local catalog immediately; then upgrade to Firestore if available.
    setCompetencias(storage.getCompetencias());

    if (!teacher.workspaceId) return;

    void seedCompetenciasIfEmpty(teacher.workspaceId, storage.getCompetencias()).catch(() => {
      // ignore; may be offline
    });

    const unsub = listenCompetencias(teacher.workspaceId, (items) => {
      // If Firestore is empty or unreachable, keep local defaults.
      if (!items || items.length === 0) {
        setCompetencias(storage.getCompetencias());
        return;
      }
      setCompetencias(items);
    });

    const unsubCriteria = listenCriteria(teacher.workspaceId, (items) => {
      setCriteria(items);
    });

    return () => {
      unsub();
      unsubCriteria();
      // Cancel any pending local timers
      for (const t of saveTimersRef.current.values()) window.clearTimeout(t);
      saveTimersRef.current.clear();
      inflightRef.current.clear();
      dirtyRef.current.clear();
      setPendingCount(0);
    };
  }, [teacher.workspaceId]);

  useRemoteRefresh(() => {
    if (!teacher.workspaceId) setCompetencias(storage.getCompetencias());
  });

  const competenciaById = useMemo(() => {
    const map = new Map<string, Competencia>();
    for (const c of competencias) map.set(c.id, c);
    return map;
  }, [competencias]);

  const hasFullLomloeKeySet = useMemo(() => {
    const codes = new Set(competencias.map((c) => normalizeCompetenceCode(c.code)));
    return LOMLOE_COMPETENCE_CODES.every((c) => codes.has(c));
  }, [competencias]);

  // Filter competencias
  const filteredCompetencias = useMemo(() => {
    if (!competenciasSearch) return competencias;
    const searchLower = competenciasSearch.toLowerCase();
    return competencias.filter(comp =>
      comp.code.toLowerCase().includes(searchLower) ||
      comp.name.toLowerCase().includes(searchLower) ||
      (comp.description && comp.description.toLowerCase().includes(searchLower)) ||
      comp.subCompetencias?.some(sub =>
        (sub.code && sub.code.toLowerCase().includes(searchLower)) ||
        sub.name.toLowerCase().includes(searchLower) ||
        (sub.description && sub.description.toLowerCase().includes(searchLower))
      )
    );
  }, [competencias, competenciasSearch]);

  const orderedCompetencias = useMemo(() => {
    const baseCompetencias = filteredCompetencias;
    if (!hasFullLomloeKeySet) return baseCompetencias;
    const orderIndex = (code: string) => {
      const normalized = normalizeCompetenceCode(code);
      const idx = (LOMLOE_COMPETENCE_CODES as readonly string[]).indexOf(normalized);
      return idx >= 0 ? idx : 999;
    };
    return [...baseCompetencias].sort((a, b) => {
      const oa = orderIndex(a.code);
      const ob = orderIndex(b.code);
      if (oa !== ob) return oa - ob;
      return normalizeCompetenceCode(a.code).localeCompare(normalizeCompetenceCode(b.code));
    });
  }, [filteredCompetencias, hasFullLomloeKeySet]);

  const scrollToCompetencia = (competenciaId: string) => {
    const el = compRefs.current.get(competenciaId);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      el.scrollIntoView();
    }
  };

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
    const draft = newSubByCompetenciaId[competenciaId] || { code: '', name: '', description: '' };
    const name = (draft.name || '').trim();
    if (!name) {
      alert('El nombre del descriptor operativo (DO) es requerido');
      return;
    }

    const sub: SubCompetencia = {
      id: newId('sub'),
      name,
      code: (draft.code || '').trim() ? (draft.code || '').trim() : undefined,
      description: (draft.description || '').trim() ? (draft.description || '').trim() : undefined,
    };

    const nextSubs = [...(comp.subCompetencias || []), sub];
    updateCompetencia(competenciaId, { subCompetencias: nextSubs });
    setNewSubByCompetenciaId((prev) => ({ ...prev, [competenciaId]: { code: '', name: '', description: '' } }));
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
    const ok = confirm(`Eliminar descriptor operativo (DO) "${sub.code ? sub.code + ': ' : ''}${sub.name}"?`);
    if (!ok) return;
    const nextSubs = (comp.subCompetencias || []).filter(s => s.id !== subId);
    updateCompetencia(competenciaId, { subCompetencias: nextSubs });
  };

  // Criteria functions
  const saveCriterion = async () => {
    if (!teacher.workspaceId) return;
    if (!newCriterion.id.trim() || !newCriterion.area.trim() || !newCriterion.text.trim()) {
      alert('Completa al menos el ID, área y texto del criterio');
      return;
    }

    const criterion: Criterion = {
      id: newCriterion.id.trim(),
      course: newCriterion.course,
      area: newCriterion.area.trim(),
      text: newCriterion.text.trim(),
      descriptorCodes: newCriterion.descriptorCodes.filter(code => code.trim()),
    };

    try {
      await upsertCriterion(teacher.workspaceId, criterion);
      setNewCriterion({
        id: '',
        course: 5,
        area: '',
        text: '',
        descriptorCodes: [],
      });
      setEditingCriterionId('');
    } catch (error) {
      alert('Error al guardar el criterio');
    }
  };

  const deleteCriterionLocal = async (criterionId: string) => {
    if (!teacher.workspaceId) return;
    const ok = confirm('¿Eliminar este criterio de evaluación?');
    if (!ok) return;

    try {
      await deleteCriterion(teacher.workspaceId, criterionId);
    } catch (error) {
      alert('Error al eliminar el criterio');
    }
  };

  const startEditingCriterion = (criterion: Criterion) => {
    setEditingCriterionId(criterion.id);
    setNewCriterion({
      id: criterion.id,
      course: criterion.course,
      area: criterion.area,
      text: criterion.text,
      descriptorCodes: [...criterion.descriptorCodes],
    });
  };

  const cancelEditingCriterion = () => {
    setEditingCriterionId('');
    setNewCriterion({
      id: '',
      course: 5,
      area: '',
      text: '',
      descriptorCodes: [],
    });
  };

  const seedCriteriaFromCSVLocal = async () => {
    if (!teacher.workspaceId) return;
    setIsSeedingCriteria(true);
    try {
      await seedCriteriaFromCSV(teacher.workspaceId);
      alert('Criterios importados exitosamente desde CSV');
    } catch (error) {
      alert('Error al importar criterios desde CSV');
    } finally {
      setIsSeedingCriteria(false);
    }
  };

  // Group criteria by area
  const criteriaGrouped = useMemo(() => {
    const filtered = criteria.filter(criterion => {
      if (!criteriosSearch) return true;
      const searchLower = criteriosSearch.toLowerCase();
      return (
        criterion.id.toLowerCase().includes(searchLower) ||
        criterion.text.toLowerCase().includes(searchLower) ||
        criterion.area.toLowerCase().includes(searchLower) ||
        criterion.descriptorCodes.some(code => code.toLowerCase().includes(searchLower))
      );
    });

    const grouped: Record<string, Criterion[]> = {};
    for (const criterion of filtered) {
      let key: string;
      switch (criteriosGroupBy) {
        case 'course':
          key = `${criterion.course}º curso`;
          break;
        case 'competencia':
          // Extract competencia from descriptor codes (first part before dot)
          const competenciaCode = criterion.descriptorCodes.length > 0 
            ? criterion.descriptorCodes[0].split('.')[0] 
            : 'Sin competencia';
          key = competenciaCode;
          break;
        case 'area':
        default:
          key = criterion.area || 'Sin área';
          break;
      }
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(criterion);
    }
    return grouped;
  }, [criteria, criteriosSearch, criteriosGroupBy]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header teacher={teacher} onLogout={onLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <button onClick={() => navigate('/')} className="btn-secondary flex items-center justify-center gap-2 mb-6 w-full sm:w-auto">
          <ArrowLeft className="w-5 h-5" />
          Volver al Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Competencias y criterios</h1>
          <p className="text-gray-600 mt-2">Lista editable de competencias clave y descriptores operativos (DO).</p>
          <p className="text-sm text-gray-500 mt-2">El código funciona como etiqueta (p.ej. CCL).</p>

          {/* Tabs */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('competencias')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'competencias'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Competencias clave
              </button>
              <button
                onClick={() => setActiveTab('criterios')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'criterios'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Criterios de evaluación
              </button>
            </nav>
          </div>
        </div>

        <div>
          {activeTab === 'competencias' && (
            <>
              <p className="text-gray-600 mt-2">Lista editable de competencias clave y descriptores operativos (DO).</p>

              {/* Search bar for competencias */}
              <div className="mt-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar competencias por código, nombre o descripción..."
                    value={competenciasSearch}
                    onChange={(e) => setCompetenciasSearch(e.target.value)}
                    className="input-field pl-10"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                {competenciasSearch && (
                  <p className="text-xs text-gray-500 mt-1">
                    {filteredCompetencias.length} competencia{filteredCompetencias.length !== 1 ? 's' : ''} encontrada{filteredCompetencias.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {orderedCompetencias.length > 0 ? (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2">Ir a competencia</div>
                  <div className="flex flex-wrap gap-2">
                    {orderedCompetencias.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={editingCompetenciaId === c.id ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => scrollToCompetencia(c.id)}
                        title={c.name}
                      >
                        {(c.code || '').trim() || '—'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasFullLomloeKeySet && (
                <p className="text-sm text-gray-600 mt-2">
                  En LOMLOE (Galicia), las competencias clave se desarrollan de forma transversal e interrelacionada (sin jerarquía):
                  trabajar una contribuye a las demás. Fuente:{' '}
                  <a className="underline" href={LOMLOE_RELATIONSHIP_SOURCE_URL} target="_blank" rel="noreferrer">
                    DOG – Decreto 155/2022 (Anexo I, Perfil de salida)
                  </a>
                </p>
              )}

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

              <div className="card mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Añadir Competencia</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
            <input
              className="input-field h-10 md:w-32 md:justify-self-start px-3 py-2 text-sm font-semibold tracking-wide uppercase"
              placeholder="Código (p.ej. CCL)"
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
          {orderedCompetencias.map((comp) => (
            <div
              key={comp.id}
              className="card"
              ref={(el) => {
                compRefs.current.set(comp.id, el);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      {comp.code}
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 truncate">{comp.name}</h3>
                  </div>
                  {comp.description ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{comp.description}</p> : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn-secondary h-10"
                    onClick={() => setEditingCompetenciaId((prev) => (prev === comp.id ? '' : comp.id))}
                    title="Editar"
                  >
                    {editingCompetenciaId === comp.id ? 'Cerrar' : 'Editar'}
                  </button>
                  <button
                    className="btn-secondary h-10 px-3"
                    onClick={() => deleteCompetencia(comp.id)}
                    title="Eliminar competencia"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Read-only descriptores operativos (DO) */}
              {editingCompetenciaId !== comp.id ? (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2">Descriptores operativos (DO)</div>
                  {(comp.subCompetencias && comp.subCompetencias.length > 0) ? (
                    <div className="flex flex-wrap gap-2">
                      {comp.subCompetencias.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700"
                          title={s.description || s.name}
                        >
                          {s.code ? s.code : s.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">No hay descriptores operativos todavía.</p>
                  )}
                </div>
              ) : (
                /* Edit mode */
                <div className="mt-5 border-t border-gray-200 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
                      <input
                        className="input-field h-10 px-3 py-2 text-sm font-semibold tracking-wide uppercase"
                        value={comp.code}
                        onChange={(e) => updateCompetencia(comp.id, { code: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-10">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                      <input
                        className="input-field h-10"
                        value={comp.name}
                        onChange={(e) => updateCompetencia(comp.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-12">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Descripción (opcional)</label>
                      <textarea
                        className="input-field"
                        rows={2}
                        value={comp.description}
                        onChange={(e) => updateCompetencia(comp.id, { description: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">Descriptores operativos (DO)</h3>
                    </div>

                    {(comp.subCompetencias && comp.subCompetencias.length > 0) ? (
                      <div className="mt-3 space-y-3">
                        {comp.subCompetencias.map((sub) => (
                          <div key={sub.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
                                <input
                                  className="input-field h-10 px-3 py-2 text-sm font-semibold tracking-wide uppercase"
                                  value={sub.code || ''}
                                  onChange={(e) => updateSubCompetencia(comp.id, sub.id, { code: e.target.value || undefined })}
                                  placeholder="Opcional"
                                />
                              </div>
                              <div className="md:col-span-6">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                                <input
                                  className="input-field h-10"
                                  value={sub.name}
                                  onChange={(e) => updateSubCompetencia(comp.id, sub.id, { name: e.target.value })}
                                />
                              </div>
                              <div className="md:col-span-4 flex items-end">
                                <button
                                  className="btn-secondary flex items-center justify-center gap-2 h-10 w-full"
                                  onClick={() => deleteSubCompetencia(comp.id, sub.id)}
                                  title="Eliminar descriptor operativo (DO)"
                                >
                                  <Trash2 className="w-5 h-5" />
                                  Eliminar
                                </button>
                              </div>
                              <div className="md:col-span-12">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Descripción (opcional)</label>
                                <textarea
                                  className="input-field"
                                  rows={2}
                                  value={sub.description || ''}
                                  onChange={(e) => updateSubCompetencia(comp.id, sub.id, { description: e.target.value || undefined })}
                                  placeholder="Descripción (opcional)"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 mt-2">No hay descriptores operativos todavía.</p>
                    )}

                    <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <p className="text-sm font-semibold text-gray-900 mb-3">Añadir descriptor operativo (DO)</p>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
                          <input
                            className="input-field h-10 px-3 py-2 text-sm font-semibold tracking-wide uppercase"
                            value={(newSubByCompetenciaId[comp.id]?.code ?? '')}
                            onChange={(e) =>
                              setNewSubByCompetenciaId((prev) => ({
                                ...prev,
                                [comp.id]: {
                                  code: e.target.value,
                                  name: prev[comp.id]?.name ?? '',
                                  description: prev[comp.id]?.description ?? '',
                                },
                              }))
                            }
                            placeholder="Opcional"
                          />
                        </div>
                        <div className="md:col-span-6">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                          <input
                            className="input-field h-10"
                            value={(newSubByCompetenciaId[comp.id]?.name ?? '')}
                            onChange={(e) =>
                              setNewSubByCompetenciaId((prev) => ({
                                ...prev,
                                [comp.id]: {
                                  code: prev[comp.id]?.code ?? '',
                                  name: e.target.value,
                                  description: prev[comp.id]?.description ?? '',
                                },
                              }))
                            }
                            placeholder="Nombre del descriptor operativo"
                          />
                        </div>
                        <div className="md:col-span-4 flex items-end">
                          <button
                            className="btn-primary h-10 w-full flex items-center justify-center gap-2"
                            onClick={() => addSubCompetencia(comp.id)}
                          >
                            <Plus className="w-5 h-5" />
                            Añadir
                          </button>
                        </div>
                        <div className="md:col-span-12">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Descripción (opcional)</label>
                          <textarea
                            className="input-field"
                            rows={2}
                            value={(newSubByCompetenciaId[comp.id]?.description ?? '')}
                            onChange={(e) =>
                              setNewSubByCompetenciaId((prev) => ({
                                ...prev,
                                [comp.id]: {
                                  code: prev[comp.id]?.code ?? '',
                                  name: prev[comp.id]?.name ?? '',
                                  description: e.target.value,
                                },
                              }))
                            }
                            placeholder="Descripción (opcional)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

            </>
          )}

          {activeTab === 'criterios' && (
            <>
              <p className="text-gray-600 mt-2">Lista editable de criterios de evaluación y sus descriptores operativos asociados.</p>

              {/* Search and group controls for criterios */}
              <div className="mt-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar criterios por ID, texto, área o descriptores..."
                        value={criteriosSearch}
                        onChange={(e) => setCriteriosSearch(e.target.value)}
                        className="input-field pl-10"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="sm:w-48">
                    <select
                      value={criteriosGroupBy}
                      onChange={(e) => setCriteriosGroupBy(e.target.value as 'area' | 'course' | 'competencia')}
                      className="input-field"
                    >
                      <option value="area">Agrupar por área</option>
                      <option value="course">Agrupar por curso</option>
                      <option value="competencia">Agrupar por competencia</option>
                    </select>
                  </div>
                </div>
                {criteriosSearch && (
                  <p className="text-xs text-gray-500">
                    {Object.values(criteriaGrouped).flat().length} criterio{Object.values(criteriaGrouped).flat().length !== 1 ? 's' : ''} encontrado{Object.values(criteriaGrouped).flat().length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Import from CSV button */}
              <div className="mt-4">
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={seedCriteriaFromCSVLocal}
                  disabled={isSeedingCriteria}
                >
                  {isSeedingCriteria ? 'Importando…' : 'Importar desde CSV'}
                </button>
                <p className="text-xs text-gray-500 mt-1">Importa los criterios del archivo CSV incluido en la aplicación</p>
              </div>

          {/* Add/Edit Criterion Form */}
          <div className="mt-6 card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingCriterionId ? 'Editar criterio' : 'Nuevo criterio'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
                <input
                  className="input-field"
                  value={newCriterion.id}
                  onChange={(e) => setNewCriterion(prev => ({ ...prev, id: e.target.value }))}
                  placeholder="Ej: CN.5.1.1"
                  disabled={!!editingCriterionId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Curso</label>
                <select
                  className="input-field"
                  value={newCriterion.course}
                  onChange={(e) => setNewCriterion(prev => ({ ...prev, course: Number(e.target.value) as 5 | 6 }))}
                >
                  <option value={5}>5º</option>
                  <option value={6}>6º</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Área</label>
                <input
                  className="input-field"
                  value={newCriterion.area}
                  onChange={(e) => setNewCriterion(prev => ({ ...prev, area: e.target.value }))}
                  placeholder="Ej: CN, CCL, STEM"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  className="btn-primary flex-1"
                  onClick={saveCriterion}
                >
                  {editingCriterionId ? 'Actualizar' : 'Crear'}
                </button>
                {editingCriterionId && (
                  <button
                    className="btn-secondary"
                    onClick={cancelEditingCriterion}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Texto del criterio</label>
              <textarea
                className="input-field"
                rows={3}
                value={newCriterion.text}
                onChange={(e) => setNewCriterion(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Describe el criterio de evaluación..."
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descriptores operativos (DO)</label>
              <input
                className="input-field"
                value={newCriterion.descriptorCodes.join(', ')}
                onChange={(e) => setNewCriterion(prev => ({
                  ...prev,
                  descriptorCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                }))}
                placeholder="Ej: STEM2, CCL3, CD1"
              />
              <p className="text-xs text-gray-500 mt-1">Separa con comas los códigos de descriptores operativos</p>
            </div>
          </div>

          {/* Criteria List */}
          {Object.keys(criteriaGrouped).length > 0 ? (
            <div className="mt-6 space-y-6">
              {Object.entries(criteriaGrouped).map(([group, groupCriteria]) => (
                <div key={group} className="card">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{group}</h3>
                  <div className="space-y-3">
                    {groupCriteria.map((criterion) => (
                      <div key={criterion.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                {criterion.id}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                                {criterion.course}º
                              </span>
                            </div>
                            <p className="text-sm text-gray-900 mb-2">{criterion.text}</p>
                            {criterion.descriptorCodes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {criterion.descriptorCodes.map((code: string) => (
                                  <span key={code} className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              className="btn-secondary h-8 px-3"
                              onClick={() => startEditingCriterion(criterion)}
                              title="Editar criterio"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              className="btn-secondary h-8 px-3 text-red-600 hover:text-red-700"
                              onClick={() => deleteCriterionLocal(criterion.id)}
                              title="Eliminar criterio"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 card">
              <p className="text-gray-600">No hay criterios de evaluación configurados.</p>
              <p className="text-sm text-gray-500 mt-2">Los criterios se pueden importar desde CSV o crear manualmente aquí.</p>
            </div>
          )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
