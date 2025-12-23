import { COMPETENCIAS_CLAVE } from '../../data/competencias';
import { seedCompetenciasIfEmpty } from '../../utils/firestore/competencias';
import { seedLearningSituationsIfEmpty } from './services/learningSituationsService';

/**
 * Seeds (if empty) the minimum catalog needed for the "Situaciones de Aprendizaje" MVP.
 * Uses the existing workspace-based Firestore structure.
 */
export async function seedMvpLearningSituations(workspaceId: string) {
  // Competencies (master catalog) already exists in this app.
  await seedCompetenciasIfEmpty(workspaceId, COMPETENCIAS_CLAVE);

  // Sample learning situations referencing existing competencia IDs (c1, c2, c3...).
  await seedLearningSituationsIfEmpty(workspaceId, [
    {
      id: 'ls_podcast_huerto',
      title: 'Grabar un podcast sobre el huerto',
      description: 'Proyecto cooperativo: guion, grabación y publicación de un podcast sobre el huerto escolar.',
      type: 'PROJECT',
      relatedCompetencyIds: ['c1', 'c3', 'c6'],
    },
    {
      id: 'ls_infografia_reciclaje',
      title: 'Crear una infografía sobre reciclaje',
      description: 'Tarea: diseñar una infografía clara y veraz para sensibilizar sobre reciclaje en el centro.',
      type: 'TASK',
      relatedCompetencyIds: ['c1', 'c3', 'c5'],
    },
  ]);
}
