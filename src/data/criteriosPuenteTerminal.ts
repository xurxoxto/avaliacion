// Carga y expone los criterios de evaluación desde el CSV para toda la app
import criteriosCsv from "../criterios.csv?raw";
import { parseCriteriosCSV, agrupaPuenteTerminal, filtraCriteriosPorPalabra, CriterioPuenteTerminal } from '../utils/criteriosCsvUtils';

let criterios: CriterioPuenteTerminal[] = [];

function loadCriterios(): CriterioPuenteTerminal[] {
  if (criterios.length > 0) return criterios;
  const rows = parseCriteriosCSV(criteriosCsv);
  criterios = agrupaPuenteTerminal(rows);
  return criterios;
}

export function getCriteriosPuenteTerminal(filtro?: string): CriterioPuenteTerminal[] {
  const all = loadCriterios();
  if (!filtro) return all;
  return filtraCriteriosPorPalabra(all, filtro);
}
