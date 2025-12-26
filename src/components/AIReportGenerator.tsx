import { useState } from 'react';
import { generateGeminiReportURL, generateGeminiQueryURL, getReportPrompt, getQueryPrompt, type StudentReportData, type AIReportOptions } from '../utils/aiReportGenerator';
import type { Student } from '../types';

interface AIReportGeneratorProps {
  studentData: StudentReportData;
  student: Student;
}

export default function AIReportGenerator({ studentData, student }: AIReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<string>('');
  const [customQuery, setCustomQuery] = useState('');
  const [queryResponse, setQueryResponse] = useState('');
  const [options, setOptions] = useState<AIReportOptions>({
    language: 'es',
    detailLevel: 'detailed',
    includeRecommendations: true,
  });

  const handleGenerateReport = async () => {
    console.log('Generando prompt y abriendo Gemini...');
    console.log('Datos del estudiante:', studentData);
    console.log('Opciones:', options);

    setIsGenerating(true);
    try {
      // Obtener el prompt completo
      const prompt = getReportPrompt(studentData, options);
      console.log('Prompt generado:', prompt.substring(0, 200) + '...');

      // Copiar el prompt al portapapeles
      await navigator.clipboard.writeText(prompt);

      // Abrir Gemini en una nueva pestaña
      window.open(generateGeminiReportURL(), '_blank');

      // Mostrar mensaje informativo
      setReport(`🔗 **Prompt copiado al portapapeles y Gemini abierto**

Se ha copiado el prompt personalizado para ${student.firstName} ${student.lastName} al portapapeles y se abrió Gemini en una nueva pestaña.

**Instrucciones:**
1. En Gemini, pega el contenido del portapapeles (Ctrl+V / Cmd+V)
2. Gemini analizará automáticamente toda la información del estudiante según el Decreto 155/2022
3. Obtendrás un informe pedagógico profesional en ${options.language === 'es' ? 'español' : 'gallego'}

**Vista previa del prompt:**
${prompt.substring(0, 300)}...`);
    } catch (error) {
      console.error('Error completo:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setReport(`Error al generar el prompt: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCustomQuery = async () => {
    if (!customQuery.trim()) return;

    setIsGenerating(true);
    try {
      // Obtener el prompt completo para la consulta
      const prompt = getQueryPrompt(studentData, customQuery, options.language);

      // Copiar el prompt al portapapeles
      await navigator.clipboard.writeText(prompt);

      // Abrir Gemini en una nueva pestaña
      window.open(generateGeminiQueryURL(), '_blank');

      // Mostrar mensaje informativo
      setQueryResponse(`🔗 **Consulta enviada a Gemini**

Se copió el prompt personalizado al portapapeles y se abrió Gemini en una nueva pestaña con tu consulta sobre ${student.firstName} ${student.lastName}.

**Consulta:** "${customQuery}"

**Instrucciones:**
1. En Gemini, pega el contenido del portapapeles (Ctrl+V / Cmd+V)
2. Gemini analizará los datos del estudiante según el currículo gallego y responderá tu consulta
3. Obtendrás una respuesta detallada en ${options.language === 'es' ? 'español' : 'gallego'}

**Vista previa del prompt:**
${prompt.substring(0, 300)}...`);
    } catch (error) {
      console.error('Error en consulta personalizada:', error);
      setQueryResponse('Error al generar el prompt de consulta.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">
          ✨ Generador de Informes con IA - {student.firstName} {student.lastName}
        </h2>
        <p className="text-gray-600 mt-1">
          Genera informes personalizados usando inteligencia artificial
        </p>
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                🤖 Generador de Informes con IA
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Esta herramienta te lleva directamente a <strong>Gemini (Google AI)</strong> con un prompt personalizado basado en los datos del estudiante y el <strong>Decreto 155/2022 de Galicia</strong>.</p>
                <p className="mt-2">No requiere configuración adicional - solo haz clic en "Generar borrador con IA" y el prompt se copiará automáticamente a tu portapapeles. Luego pega (Ctrl+V) en Gemini para obtener un informe pedagógico profesional.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuración del informe */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Idioma
          </label>
          <select
            value={options.language}
            onChange={(e) => setOptions(prev => ({ ...prev, language: e.target.value as 'es' | 'gl' }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="es">Español</option>
            <option value="gl">Gallego</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nivel de detalle
          </label>
          <select
            value={options.detailLevel}
            onChange={(e) => setOptions(prev => ({ ...prev, detailLevel: e.target.value as 'brief' | 'detailed' | 'comprehensive' }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="brief">Breve</option>
            <option value="detailed">Detallado</option>
            <option value="comprehensive">Completo</option>
          </select>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="includeRecommendations"
            checked={options.includeRecommendations}
            onChange={(e) => setOptions(prev => ({ ...prev, includeRecommendations: e.target.checked }))}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="includeRecommendations" className="ml-2 text-sm text-gray-700">
            Incluir recomendaciones
          </label>
        </div>
      </div>

      {/* Botón de generar informe */}
      <div className="flex justify-center">
        <button
          onClick={handleGenerateReport}
          disabled={isGenerating}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Abriendo Gemini...</span>
            </>
          ) : (
            <>
              <span>✨ Generar borrador con IA</span>
            </>
          )}
        </button>
      </div>

      {/* Consulta personalizada */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Consulta Personalizada
        </h3>
        <div className="space-y-3">
          <textarea
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Ej: ¿Cómo está evolucionando en matemáticas? ¿Qué fortalezas tiene en comunicación?"
            className="w-full border border-gray-300 rounded-md px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCustomQuery}
            disabled={isGenerating || !customQuery.trim()}
            className="bg-green-600 text-white px-4 py-2 rounded-md font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🚀 Abrir en Gemini
          </button>
        </div>
      </div>

      {/* Resultados */}
      {report && (
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Informe Generado
          </h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-gray-800 font-sans text-sm leading-relaxed">
              {report}
            </pre>
          </div>
          <div className="mt-4 flex space-x-2">
            <button
              onClick={() => navigator.clipboard.writeText(report)}
              className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-700"
            >
              Copiar al portapapeles
            </button>
            <button
              onClick={() => {
                const blob = new Blob([report], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `informe-${student.firstName}-${student.lastName}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
            >
              Descargar como archivo
            </button>
          </div>
        </div>
      )}

      {queryResponse && (
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Respuesta a Consulta
          </h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800">{queryResponse}</p>
          </div>
        </div>
      )}
    </div>
  );
}