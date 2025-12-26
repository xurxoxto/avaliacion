// Script de prueba para verificar la configuración de Gemini
// Ejecutar con: node test-gemini.mjs

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ VITE_GEMINI_API_KEY no está configurada en el archivo .env');
  process.exit(1);
}

console.log('🔑 API Key encontrada, probando conexión con Gemini...');

// Lista de modelos que podrían funcionar
const modelsToTry = [
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-pro',
  'gemini-1.0-pro',
  'text-bison-001',
  'chat-bison-001'
];

async function testModel(modelName) {
  try {
    console.log(`🤖 Probando modelo: ${modelName}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent('Responde solo con "OK" si puedes entenderme.');
    const response = await result.response;
    const text = response.text();

    console.log(`✅ Modelo ${modelName} funciona:`, text.trim());
    return true;
  } catch (error) {
    console.log(`❌ Modelo ${modelName} falló:`, error.message);
    return false;
  }
}

async function main() {
  for (const modelName of modelsToTry) {
    const success = await testModel(modelName);
    if (success) {
      console.log('🎉 ¡La API de Gemini está funcionando correctamente!');
      process.exit(0);
    }
  }

  console.error('❌ Ningún modelo funcionó.');
  console.log('💡 Posibles soluciones:');
  console.log('1. Verifica que la API key sea de Google AI Studio (makersuite.google.com)');
  console.log('2. Asegúrate de que la API de Gemini esté habilitada en Google Cloud Console');
  console.log('3. Verifica que la API key tenga permisos para usar Gemini');
  console.log('4. Prueba creando una nueva API key');
  process.exit(1);
}

main().catch(console.error);