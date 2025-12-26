import { LogOut, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Classroom, Student, Teacher } from '../types';
import { useNavigate } from 'react-router-dom';
import { listenStudents } from '../utils/firestore/students';
import { listenClassrooms } from '../utils/firestore/classrooms';

interface HeaderProps {
  teacher: Teacher;
  onLogout: () => void;
  showSearch?: boolean;
}

export default function Header({ teacher, onLogout, showSearch = true }: HeaderProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const blurCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    const workspaceId = teacher.workspaceId;
    if (!workspaceId) return;

    const unsubStudents = listenStudents(workspaceId, setStudents);
    const unsubClassrooms = listenClassrooms(workspaceId, setClassrooms);

    return () => {
      unsubStudents();
      unsubClassrooms();
    };
  }, [teacher.workspaceId]);

  const classroomsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classrooms) map.set(String(c.id), String(c.name));
    return map;
  }, [classrooms]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Array<{ id: string; classroomId: string; label: string; subtitle: string }>;
    const matched = students
      .filter((s) => {
        const full1 = `${s.firstName} ${s.lastName}`.toLowerCase();
        const full2 = `${s.lastName} ${s.firstName}`.toLowerCase();
        return full1.includes(q) || full2.includes(q) || String(s.listNumber).includes(q);
      })
      .slice(0, 8)
      .map((s) => {
        const clsName = classroomsById.get(String(s.classroomId)) || 'Aula';
        const label = `${s.firstName} ${s.lastName}`.trim();
        const subtitle = `${clsName} · #${s.listNumber}`;
        return {
          id: String(s.id),
          classroomId: String(s.classroomId),
          label,
          subtitle,
        };
      });

    return matched;
  }, [query, students, classroomsById]);

  const goToStudent = (classroomId: string, studentId: string) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/classroom/${classroomId}/student/${studentId}`);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => navigate('/')}
              title="Inicio - Senda"
            >
              <img src="/logo.png" alt="Senda Logo" className="w-16 h-16 object-contain" />
            </div>
          </div>

          {showSearch ? (
            <div className="flex-1 flex justify-center px-4 lg:px-8">
              <div className="w-full max-w-lg">
                <label htmlFor="search" className="sr-only">
                  Buscar estudiantes
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    id="search"
                    name="search"
                    className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-500 focus:border-primary-500 focus:text-gray-900 focus:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:text-sm"
                    placeholder="Buscar estudiantes..."
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => {
                      // Allow click on dropdown items before closing
                      if (blurCloseTimer.current) window.clearTimeout(blurCloseTimer.current);
                      blurCloseTimer.current = window.setTimeout(() => setIsOpen(false), 120);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsOpen(false);
                        setQuery('');
                        (e.currentTarget as HTMLInputElement).blur();
                        return;
                      }
                      if (e.key === 'Enter') {
                        if (results.length > 0) {
                          e.preventDefault();
                          goToStudent(results[0].classroomId, results[0].id);
                        }
                      }
                    }}
                  />

                  {isOpen && query.trim() && (
                    <div className="absolute z-50 mt-2 w-full rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
                      {results.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-600">No hay resultados</div>
                      ) : (
                        <ul className="max-h-80 overflow-auto">
                          {results.map((r) => (
                            <li key={`${r.classroomId}:${r.id}`}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                                onMouseDown={(ev) => {
                                  // Prevent input blur before click
                                  ev.preventDefault();
                                }}
                                onClick={() => goToStudent(r.classroomId, r.id)}
                              >
                                <div className="text-sm font-medium text-gray-900 truncate">{r.label}</div>
                                <div className="text-xs text-gray-600 truncate">{r.subtitle}</div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{teacher.name}</p>
              <p className="text-xs text-gray-600 truncate max-w-[16rem]">{teacher.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="btn-secondary flex items-center gap-2"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
