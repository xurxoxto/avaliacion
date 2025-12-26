// Utilidad para parsear y consultar el CSV de criterios-DO
// Permite distinguir criterios puente (5º y 6º) y terminales (solo un curso)
// y buscar por palabras clave

import Papa from 'papaparse';

export interface CriterioCSV {
  curso: string; // '5' o '6'
  area: string;
  id: string; // ID Criterio (Área.Curso.Bloque.Núm)
  criterio: string;
  descriptores: string[]; // array de DO (ej: ['STEM2', 'CCL3'])
}

export interface CriterioPuenteTerminal {
  id: string;
  cursos: string[]; // ['5'], ['6'] o ['5','6']
  area: string;
  criterio: string;
  descriptores: string[];
  tipo: 'puente' | 'terminal';
}

export function parseCriteriosCSV(csvText: string): CriterioCSV[] {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return (data as any[]).map(row => ({
    curso: String(row['Curso']).trim(),
    area: String(row['Área']).trim(),
    id: String(row['ID Criterio (Área.Curso.Bloque.Núm)']).trim(),
    criterio: String(row['Criterio de evaluación']).trim(),
    descriptores: String(row['Descriptor operativo. Competencias Clave']).split(',').map(s => s.trim()).filter(Boolean),
  }));
}

export function agrupaPuenteTerminal(criterios: CriterioCSV[]): CriterioPuenteTerminal[] {
  const byContent = new Map<string, CriterioPuenteTerminal>();
  for (const c of criterios) {
    const key = `${c.area}|${c.criterio}|${c.descriptores.join(',')}`;
    if (!byContent.has(key)) {
      byContent.set(key, {
        id: c.id,
        cursos: [c.curso],
        area: c.area,
        criterio: c.criterio,
        descriptores: c.descriptores,
        tipo: 'terminal',
      });
    } else {
      const prev = byContent.get(key)!;
      prev.cursos.push(c.curso);
      prev.tipo = 'puente';
    }
  }
  return Array.from(byContent.values());
}

export function filtraCriteriosPorPalabra(criterios: CriterioPuenteTerminal[], palabra: string): CriterioPuenteTerminal[] {
  const q = palabra.trim().toLowerCase();
  if (!q) return criterios;
  return criterios.filter(c =>
    c.criterio.toLowerCase().includes(q) ||
    c.id.toLowerCase().includes(q) ||
    c.area.toLowerCase().includes(q) ||
    c.descriptores.some(d => d.toLowerCase().includes(q))
  );
}
