import { Competencia, SubCompetencia } from '../types';
import { LOMLOE_DESCRIPTORES_OPERATIVOS_GALICIA } from './lomloe_descriptores_operativos_galicia';

export const LOMLOE_COMPETENCE_CODES = ['CCL', 'CP', 'STEM', 'CD', 'CPSAA', 'CC', 'CE', 'CCEC'] as const;
export type LOMLOECompetenceCode = (typeof LOMLOE_COMPETENCE_CODES)[number];

export function normalizeCompetenceCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

export function isLomloeKeyCompetenceCode(code: string): code is LOMLOECompetenceCode {
  const normalized = normalizeCompetenceCode(code);
  return (LOMLOE_COMPETENCE_CODES as readonly string[]).includes(normalized);
}

// Galicia LOMLOE (Decreto 155/2022): the curriculum frames key competences as transversal and interrelated
// (no hierarchy; acquisition of each contributes to all others). We model that as a complete graph among the 8 key competences.
export function getRelatedLomloeCompetenceCodes(code: string): LOMLOECompetenceCode[] {
  if (!isLomloeKeyCompetenceCode(code)) return [];
  const normalized = normalizeCompetenceCode(code) as LOMLOECompetenceCode;
  return LOMLOE_COMPETENCE_CODES.filter((c) => c !== normalized);
}

export const LOMLOE_RELATIONSHIP_SOURCE_URL =
  'https://www.xunta.gal/dog/Publicados/2022/20220926/AnuncioG0655-190922-0001_es.html';

export function getDefaultSubCompetenciasForCode(code: string): SubCompetencia[] {
  const normalized = normalizeCompetenceCode(code);
  if (!isLomloeKeyCompetenceCode(normalized)) return [];
  const list = LOMLOE_DESCRIPTORES_OPERATIVOS_GALICIA[normalized] || [];
  return list.map((d: { code: string; primaria: string; eso: string }) => ({
    id: `dog-${String(d.code || '').toLowerCase()}`,
    code: d.code,
    name: d.primaria,
    description: d.eso || undefined,
    weight: 0,
  }));
}

export function withDefaultLomloeSubCompetencias(competencias: Competencia[]): Competencia[] {
  if (!Array.isArray(competencias) || competencias.length === 0) return competencias;
  let changed = false;
  const next = competencias.map((c) => {
    const existingSubs = Array.isArray(c.subCompetencias) ? c.subCompetencias : [];
    if (existingSubs.length > 0) return c;
    const defaults = getDefaultSubCompetenciasForCode(c.code);
    if (defaults.length === 0) return c;
    changed = true;
    return { ...c, subCompetencias: defaults };
  });
  return changed ? next : competencias;
}

export const COMPETENCIAS_CLAVE: Competencia[] = [
  {
    id: 'c1',
    code: 'CCL',
    name: 'Competencia en comunicación lingüística',
    description: 'Comprender y expresar ideas, emociones y conocimientos de forma oral y escrita, en distintos contextos y con adecuación comunicativa.',
    subCompetencias: getDefaultSubCompetenciasForCode('CCL'),
  },
  {
    id: 'cp',
    code: 'CP',
    name: 'Competencia plurilingüe',
    description: 'Usar distintas lenguas y repertorios lingüísticos para comprender, interactuar y mediar, valorando la diversidad lingüística y cultural.',
    subCompetencias: getDefaultSubCompetenciasForCode('CP'),
  },
  {
    id: 'c2',
    code: 'STEM',
    name: 'Competencia matemática y competencia en ciencia, tecnología e ingeniería',
    description: 'Razonar, modelizar y resolver problemas; aplicar el método científico y el pensamiento computacional en situaciones reales.',
    subCompetencias: getDefaultSubCompetenciasForCode('STEM'),
  },
  {
    id: 'c3',
    code: 'CD',
    name: 'Competencia digital',
    description: 'Buscar, crear y comunicar información de forma segura, crítica y responsable mediante tecnologías digitales.',
    subCompetencias: getDefaultSubCompetenciasForCode('CD'),
  },
  {
    id: 'c4',
    code: 'CPSAA',
    name: 'Competencia personal, social y de aprender a aprender',
    description: 'Gestionar el aprendizaje, el bienestar y las relaciones; desarrollar autonomía, autorregulación y habilidades socioemocionales.',
    subCompetencias: getDefaultSubCompetenciasForCode('CPSAA'),
  },
  {
    id: 'c5',
    code: 'CC',
    name: 'Competencia ciudadana',
    description: 'Participar de forma responsable, democrática y solidaria, comprendiendo derechos, deberes y la convivencia en sociedad.',
    subCompetencias: getDefaultSubCompetenciasForCode('CC'),
  },
  {
    id: 'c6',
    code: 'CE',
    name: 'Competencia emprendedora',
    description: 'Transformar ideas en acciones con creatividad, iniciativa, planificación y perseverancia, asumiendo riesgos de forma responsable.',
    subCompetencias: getDefaultSubCompetenciasForCode('CE'),
  },
  {
    id: 'c7',
    code: 'CCEC',
    name: 'Competencia en conciencia y expresión culturales',
    description: 'Apreciar, interpretar y crear manifestaciones culturales y artísticas, desarrollando sensibilidad estética e identidad cultural.',
    subCompetencias: getDefaultSubCompetenciasForCode('CCEC'),
  },
];
