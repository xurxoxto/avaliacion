import type {
  Student,
  TaskEvaluation,
  SituationEvaluation,
  CriterionEvaluation,
  EvidenceNote,
  LearningSituation,
  LearningTask,
  Competencia
} from '../types';

export interface StudentReportData {
  student: Student;
  taskEvaluations: TaskEvaluation[];
  situationEvaluations: SituationEvaluation[];
  criterionEvaluations: CriterionEvaluation[];
  evidenceNotes: EvidenceNote[];
  learningSituations: LearningSituation[];
  learningTasks?: LearningTask[]; // Opcional por ahora
  competencias: Competencia[];
}

export interface AIReportOptions {
  language: 'es' | 'gl'; // Español o Gallego
  detailLevel: 'brief' | 'detailed' | 'comprehensive';
  focusAreas?: string[]; // Áreas específicas a enfatizar
  includeRecommendations?: boolean;
}

/**
 * Genera un informe personalizado con IA usando Gemini
 */
/**
 * Genera un informe usando URLs de Gemini (en lugar de API)
 */
export async function generateStudentReportWithAI(
  data: StudentReportData,
  options: AIReportOptions = { language: 'es', detailLevel: 'detailed', includeRecommendations: true }
): Promise<string> {
  // Siempre devolver una URL de Gemini en lugar de llamar a la API
  const geminiURL = generateGeminiReportURL();

  return `🔗 **Informe listo para generar con IA**

Para obtener un informe personalizado con IA para ${data.student.firstName} ${data.student.lastName}:

**Opción 1: Haz clic en el botón "Abrir en Gemini"** arriba para ir directamente a Gemini con el prompt precargado.

**Opción 2: Copia esta URL en tu navegador:**
${geminiURL}

**Datos que se incluirán en el análisis:**
- Información personal del estudiante
- ${data.taskEvaluations.length} evaluaciones de tareas
- ${data.situationEvaluations.length} evaluaciones de situaciones
- ${data.criterionEvaluations.length} evaluaciones de criterios
- ${data.evidenceNotes.length} notas de evidencia

El informe se generará en ${options.language === 'es' ? 'español' : 'gallego'} con nivel ${options.detailLevel === 'brief' ? 'breve' : options.detailLevel === 'detailed' ? 'detallado' : 'completo'}${options.includeRecommendations ? ' e incluirá recomendaciones' : ''}.`;
}

/**
 * Construye el prompt estructurado para Gemini
 */
function buildReportPrompt(data: StudentReportData, options: AIReportOptions): string {
  const { student, taskEvaluations, situationEvaluations, criterionEvaluations, evidenceNotes } = data;

  // Calcular estadísticas básicas
  const avgTaskGrade = taskEvaluations.length > 0
    ? taskEvaluations.reduce((sum, ev) => sum + ev.numericalValue, 0) / taskEvaluations.length
    : 0;

  const avgSituationGrade = situationEvaluations.length > 0
    ? situationEvaluations.reduce((sum, ev) => sum + ev.numericalValue, 0) / situationEvaluations.length
    : 0;

  // Contar evaluaciones por color
  const gradeCounts = {
    BLUE: [...taskEvaluations, ...situationEvaluations].filter(ev => ev.rating === 'BLUE').length,
    GREEN: [...taskEvaluations, ...situationEvaluations].filter(ev => ev.rating === 'GREEN').length,
    YELLOW: [...taskEvaluations, ...situationEvaluations].filter(ev => ev.rating === 'YELLOW').length,
    RED: [...taskEvaluations, ...situationEvaluations].filter(ev => ev.rating === 'RED').length,
  };

  const languageName = options.language === 'es' ? 'español' : 'gallego';

  let prompt = `Actúa como docente experto de primaria en Galicia. Redacta un informe cualitativo para el boletín de ${student.firstName} ${student.lastName} según el Decreto 155/2022.

INFORMACIÓN DEL ESTUDIANTE:
- Nombre: ${student.firstName} ${student.lastName}
- Nivel: ${student.level ? `${student.level}º de Primaria` : 'Sin especificar'}
- Progreso general: ${student.progress}%

ESTADÍSTICAS DE EVALUACIÓN (Escala 1-4):
- Evaluaciones de tareas realizadas: ${taskEvaluations.length}
- Evaluaciones de situaciones realizadas: ${situationEvaluations.length}
- Evaluaciones de criterios realizadas: ${criterionEvaluations.length}
- Notas de evidencia: ${evidenceNotes.length}
- Nota media en tareas: ${avgTaskGrade.toFixed(1)}/10
- Nota media en situaciones: ${avgSituationGrade.toFixed(1)}/10

DISTRIBUCIÓN POR NIVELES DE ADQUISICIÓN:
- Azul (Adquisición excelente): ${gradeCounts.BLUE}
- Verde (Adquisición buena): ${gradeCounts.GREEN}
- Amarillo (Adquisición en proceso): ${gradeCounts.YELLOW}
- Rojo (Necesita refuerzo): ${gradeCounts.RED}

`;

  // Agregar evaluaciones recientes si hay detalle
  if (options.detailLevel !== 'brief') {
    prompt += `\nEVALUACIONES RECIENTES:\n`;

    if (taskEvaluations.length > 0) {
      prompt += `\nEvaluaciones de tareas:\n`;
      taskEvaluations.slice(-5).forEach(ev => {
        const task = data.learningTasks?.find(t => t.id === ev.taskId);
        prompt += `- ${task?.title || 'Tarea'}: ${ev.rating} (${ev.numericalValue}/10)`;
        if (ev.observation) prompt += ` - ${ev.observation}`;
        prompt += '\n';
      });
    }

    if (situationEvaluations.length > 0) {
      prompt += `\nEvaluaciones de situaciones:\n`;
      situationEvaluations.slice(-3).forEach(ev => {
        const situation = data.learningSituations.find(s => s.id === ev.learningSituationId);
        prompt += `- ${situation?.title || 'Situación'}: ${ev.rating} (${ev.numericalValue}/10)`;
        if (ev.observation) prompt += ` - ${ev.observation}`;
        prompt += '\n';
      });
    }

    if (evidenceNotes.length > 0) {
      prompt += `\nNotas de evidencia:\n`;
      evidenceNotes.slice(-3).forEach(note => {
        prompt += `- ${note.text} (${note.gradeKey}, ${note.numericValue}/10)\n`;
      });
    }
  }

  // Instrucciones finales
  prompt += `

INSTRUCCIONES PARA EL INFORME:
Redacta un informe pedagógico de 3-4 párrafos en ${languageName} que incluya:

1. **Logros alcanzados**: Destaca los aspectos positivos y las competencias adquiridas según el currículo de Galicia.
2. **Nivel de adquisición de competencias clave**: Evalúa el progreso según el Perfil de Salida del alumnado (Decreto 155/2022).
3. **Recomendaciones formativas**: Sugiere estrategias de mejora basadas en las áreas que necesitan más apoyo.

Usa un tono motivador y constructivo, adecuado para compartir con las familias. Menciona específicamente el desarrollo de las competencias clave (comunicación, matemática, STEM, etc.) y el trabajo por proyectos.

IMPORTANTE: El informe debe ser cualitativo, no solo numérico. Enfócate en el proceso de aprendizaje y el desarrollo integral del alumno.`;

  return prompt;
}

/**
 * Genera un prompt personalizado para consultas específicas sobre un estudiante
 */
export function generateCustomQueryPrompt(
  data: StudentReportData,
  query: string,
  language: 'es' | 'gl' = 'es'
): string {
  const { student } = data;

  return `Actúa como docente experto de primaria en Galicia. Analiza la siguiente consulta sobre el estudiante ${student.firstName} ${student.lastName} y proporciona una respuesta detallada y útil en ${language === 'es' ? 'español' : 'gallego'}, teniendo en cuenta el Decreto 155/2022 y el currículo gallego.

CONSULTA: ${query}

DATOS DEL ESTUDIANTE:
- Nombre: ${student.firstName} ${student.lastName}
- Nivel: ${student.level ? `${student.level}º de Primaria` : 'Sin especificar'}
- Progreso: ${student.progress}%

EVALUACIONES DISPONIBLES:
- Tareas evaluadas: ${data.taskEvaluations.length}
- Situaciones evaluadas: ${data.situationEvaluations.length}
- Criterios evaluados: ${data.criterionEvaluations.length}
- Notas de evidencia: ${data.evidenceNotes.length}

Proporciona una respuesta informativa, objetiva y constructiva basada en los datos disponibles y el marco curricular gallego. Si no hay suficiente información para responder completamente, indícalo claramente y sugiere qué datos adicionales serían útiles.`;
}

/**
 * Genera una URL de Gemini con un prompt precargado para informes de estudiantes
 */
export function generateGeminiReportURL(): string {
  // URL base de Gemini
  return 'https://gemini.google.com/app';
}

/**
 * Genera el prompt completo para informes de estudiantes
 */
export function getReportPrompt(
  data: StudentReportData,
  options: AIReportOptions = { language: 'es', detailLevel: 'detailed', includeRecommendations: true }
): string {
  return buildReportPrompt(data, options);
}

/**
 * Genera una URL de Gemini para consultas personalizadas
 */
export function generateGeminiQueryURL(): string {
  // URL base de Gemini
  return 'https://gemini.google.com/app';
}

/**
 * Genera el prompt completo para consultas personalizadas
 */
export function getQueryPrompt(
  data: StudentReportData,
  query: string,
  language: 'es' | 'gl' = 'es'
): string {
  return `Analiza la siguiente consulta sobre el estudiante ${data.student.firstName} ${data.student.lastName} y proporciona una respuesta detallada y útil en ${language === 'es' ? 'español' : 'gallego'}.

CONSULTA: ${query}

DATOS DEL ESTUDIANTE:
- Nombre: ${data.student.firstName} ${data.student.lastName}
- Nivel: ${data.student.level ? `${data.student.level}º de Primaria` : 'Sin especificar'}
- Progreso: ${data.student.progress}%
- Nota media: ${data.student.averageGrade.toFixed(1)}/10

EVALUACIONES DISPONIBLES:
- Tareas evaluadas: ${data.taskEvaluations.length}
- Situaciones evaluadas: ${data.situationEvaluations.length}
- Criterios evaluados: ${data.criterionEvaluations.length}
- Notas de evidencia: ${data.evidenceNotes.length}

Proporciona una respuesta informativa, objetiva y constructiva basada en los datos disponibles. Si no hay suficiente información para responder completamente, indícalo claramente.`;
}