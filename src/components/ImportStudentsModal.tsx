import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import Papa from 'papaparse';
import type { Student } from '../types';

type StudentImportRow = Pick<Student, 'firstName' | 'lastName' | 'listNumber' | 'level'>;
type StudentImportRowDraft = Omit<StudentImportRow, 'listNumber'> & { listNumber?: number };

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? n : undefined;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const ni = Math.trunc(n);
  return ni > 0 ? ni : undefined;
}

function parseLevel(value: unknown): 5 | 6 | undefined {
  const raw = normalizeHeader(value);
  if (!raw) return undefined;
  if (raw === '5' || raw.includes('5')) return 5;
  if (raw === '6' || raw.includes('6')) return 6;
  return undefined;
}

function extractRowFromObject(obj: Record<string, unknown>): {
  firstName?: string;
  lastName?: string;
  listNumber?: number;
  hasListNumberValue: boolean;
  level?: 5 | 6;
} {
  const entries = Object.entries(obj);
  const headerToValue = new Map<string, unknown>();
  for (const [k, v] of entries) headerToValue.set(normalizeHeader(k), v);

  const pick = (keys: string[]) => {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      if (headerToValue.has(nk)) return headerToValue.get(nk);
    }
    return undefined;
  };

  const firstName = pick(['firstname', 'first name', 'nombre', 'name', 'nombre pila']);
  const lastName = pick(['lastname', 'last name', 'apellidos', 'surname']);
  const listNumberRaw = pick([
    'listnumber',
    'list number',
    'numero',
    'n',
    'no',
    'nº',
    'numero lista',
    'n lista',
    'numero de lista',
  ]);
  const level = pick(['level', 'nivel', 'curso', 'internivel']);

  const listNumberRawText = String(listNumberRaw ?? '').trim();

  return {
    firstName: String(firstName ?? '').trim() || undefined,
    lastName: String(lastName ?? '').trim() || undefined,
    listNumber: toPositiveInt(listNumberRaw),
    hasListNumberValue: listNumberRawText.length > 0,
    level: parseLevel(level),
  };
}

function parseDelimitedText(text: string): Array<Record<string, unknown>> {
  const hasSemicolon = text.split('\n').slice(0, 5).some((l) => l.includes(';'));
  const delimiter = hasSemicolon ? ';' : ',';

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });

  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0].message || 'Error al leer el CSV');
  }

  return Array.isArray(parsed.data) ? parsed.data : [];
}

interface ImportStudentsModalProps {
  onClose: () => void;
  existingStudents: Student[];
  onImport: (students: StudentImportRow[]) => Promise<void>;
}

export default function ImportStudentsModal({ onClose, existingStudents, onImport }: ImportStudentsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<StudentImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const existingListNumbers = useMemo(() => {
    const s = new Set<number>();
    existingStudents.forEach((st) => {
      if (typeof st.listNumber === 'number' && st.listNumber > 0) s.add(st.listNumber);
    });
    return s;
  }, [existingStudents]);

  const validCount = rows.length;

  const handleFile = async (nextFile: File | null) => {
    setFile(nextFile);
    setRows([]);
    setErrors([]);
    setParseError('');

    if (!nextFile) return;

    try {
      const ext = nextFile.name.toLowerCase();
      if (!ext.endsWith('.csv')) {
        throw new Error('Formato no soportado. Usa un archivo CSV (.csv).');
      }

      const text = await nextFile.text();
      const rawObjects = parseDelimitedText(text);

      const nextErrors: string[] = [];
      const nextRowsDraft: StudentImportRowDraft[] = [];
      const seenProvidedInFile = new Set<number>();

      rawObjects.forEach((obj, index) => {
        const rowNumber = index + 2; // header row is 1
        const extracted = extractRowFromObject(obj);

        const firstName = extracted.firstName?.trim() ?? '';
        const lastName = extracted.lastName?.trim() ?? '';
        const listNumber = extracted.listNumber;
        const hasListNumberValue = extracted.hasListNumberValue;
        const level = extracted.level;

        if (!firstName) {
          nextErrors.push(`Fila ${rowNumber}: falta "Nombre"`);
          return;
        }
        if (!lastName) {
          nextErrors.push(`Fila ${rowNumber}: falta "Apellidos"`);
          return;
        }

        if (hasListNumberValue && !listNumber) {
          nextErrors.push(`Fila ${rowNumber}: "Número de lista" inválido`);
          return;
        }

        if (listNumber) {
          if (seenProvidedInFile.has(listNumber)) {
            nextErrors.push(`Fila ${rowNumber}: número de lista duplicado en el archivo (${listNumber})`);
            return;
          }
          if (existingListNumbers.has(listNumber)) {
            nextErrors.push(`Fila ${rowNumber}: ya existe un estudiante con número de lista ${listNumber}`);
            return;
          }
          seenProvidedInFile.add(listNumber);
        }

        nextRowsDraft.push({
          firstName,
          lastName,
          listNumber,
          level,
        });
      });

      const usedNumbers = new Set<number>([...existingListNumbers, ...seenProvidedInFile]);
      let candidate = 1;

      const nextRows: StudentImportRow[] = nextRowsDraft.map((r) => {
        if (r.listNumber) return r as StudentImportRow;
        while (usedNumbers.has(candidate)) candidate += 1;
        const assigned = candidate;
        usedNumbers.add(assigned);
        candidate += 1;
        return {
          ...r,
          listNumber: assigned,
        };
      });

      setRows(nextRows);
      setErrors(nextErrors);
    } catch (e: any) {
      setParseError(e?.message || 'No se pudo leer el archivo.');
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      await onImport(rows);
      onClose();
    } catch (e) {
      console.error('Import error', e);
      alert('Hubo un error al importar estudiantes. Por favor, inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const preview = rows.slice(0, 5);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Importar Estudiantes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Archivo (CSV)</label>
            <input
              type="file"
              accept=".csv"
              className="input-field"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-sm text-gray-500 mt-2">
              Columnas esperadas: Nombre, Apellidos. (Número de lista opcional; si falta se asigna automáticamente. Nivel opcional: 5 o 6)
            </p>
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{parseError}</div>
          )}

          {file && !parseError && (
            <div className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-lg text-sm text-gray-700">
              Detectados: {rows.length} válidos • {errors.length} con errores
            </div>
          )}

          {preview.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">Vista previa (primeras {preview.length})</div>
              <div className="divide-y divide-gray-200">
                {preview.map((r) => (
                  <div key={`${r.listNumber}-${r.firstName}-${r.lastName}`} className="px-4 py-2 text-sm text-gray-800">
                    {r.listNumber}. {r.firstName} {r.lastName}
                    {r.level ? ` • ${r.level}º` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
              <div className="font-medium mb-2">Errores (mostrando hasta 5)</div>
              {errors.slice(0, 5).map((err) => (
                <div key={err}>{err}</div>
              ))}
              {errors.length > 5 ? <div className="mt-2">…y {errors.length - 5} más</div> : null}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => void handleImport()}
              disabled={busy || validCount === 0}
              title={validCount === 0 ? 'No hay filas válidas para importar' : 'Importar estudiantes'}
            >
              {busy ? 'Importando…' : `Importar (${validCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
