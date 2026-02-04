/**
 * AI Service API
 * Integración con Google Gemini para chatbot de PLD
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

// Configuración de Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';

// System instruction para el bot
const SYSTEM_INSTRUCTION = `Eres un experto en la Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita (LFPIORPI) de México. Tu nombre es "Antigravity Bot".

Tu rol es:
- Responder dudas de Oficiales de Cumplimiento de forma breve y profesional
- Explicar conceptos de la ley antilavado de manera clara
- Proporcionar información sobre umbrales, plazos y obligaciones
- Orientar sobre mejores prácticas de cumplimiento PLD

Conocimientos clave que debes dominar:
- Umbrales de Aviso: Operaciones ≥ $10,000 USD o equivalente en moneda nacional para Avisos
- Actividades Vulnerables según Art. 17 de la LFPIORPI
- Plazos de presentación de Avisos (día 17 del mes siguiente)
- Requisitos de identificación de clientes (KYC)
- Conservación de documentación (5 años)
- Sanciones y multas por incumplimiento
- Portal del SAT para envío de Avisos
- Estructura de reportes XML

Restricciones:
- NO solicites ni proceses datos personales reales (RFC, CURP, nombres de clientes)
- NO proporciones asesoría legal específica para casos particulares
- Siempre recomienda consultar con un abogado para casos complejos
- Mantén respuestas concisas (máximo 3-4 párrafos)

Formato de respuesta:
- Usa viñetas cuando listes información
- Sé directo y profesional
- Incluye referencias a artículos de la ley cuando sea relevante`;

// Información de referencia sobre umbrales
const UMBRALES_INFO = `
UMBRALES DE AVISO POR ACTIVIDAD VULNERABLE (Art. 17 LFPIORPI):

1. Juegos y sorteos: $26,705 UMA (~$325,000 MXN)
2. Tarjetas de servicios/crédito (no bancarias): $4,476 UMA (~$54,500 MXN)
3. Operaciones con cheques de viajero: $4,476 UMA
4. Préstamos entre particulares: $43,344 UMA (~$527,500 MXN)
5. Inmuebles: Cualquier monto (siempre se presenta Aviso)
6. Vehículos terrestres, aéreos, marítimos: $53,410 UMA (~$650,000 MXN)
7. Joyería, relojes, piedras preciosas: $4,476 UMA
8. Obras de arte: $17,036 UMA (~$207,400 MXN)
9. Blindaje de vehículos: $32,050 UMA (~$390,200 MXN)
10. Traslado/custodia de dinero: $26,705 UMA
11. Servicios profesionales independientes: $13,352 UMA (~$162,500 MXN)
12. Fe pública (notarios): Cualquier operación que supere umbrales
13. Donativos: $26,705 UMA
14. Servicios de comercio exterior: $4,476 UMA
15. Constitución de derechos sobre inmuebles: Cualquier monto

Valor UMA 2024: ~$108.57 MXN (actualizar según año fiscal)
`;

/**
 * Chat con Gemini
 * Callable function para interactuar con el chatbot
 */
export const chatWithGemini = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { message, history = [] } = request.data;
    const userId = request.auth.uid;

    if (!message || typeof message !== 'string') {
      throw new HttpsError('invalid-argument', 'El mensaje es requerido');
    }

    // Limitar longitud del mensaje
    if (message.length > 2000) {
      throw new HttpsError('invalid-argument', 'El mensaje es demasiado largo (máx 2000 caracteres)');
    }

    try {
      // Inicializar cliente de Gemini
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      // Construir historial de chat
      const chatHistory = history.slice(-10).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Enriquecer mensaje con contexto si pregunta sobre umbrales
      let enrichedMessage = message;
      const umbralKeywords = ['umbral', 'monto', 'límite', 'cuánto', 'aviso', 'reportar'];
      if (umbralKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
        enrichedMessage = `${message}\n\nContexto de referencia:\n${UMBRALES_INFO}`;
      }

      // Iniciar chat con historial
      const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });

      // Enviar mensaje y obtener respuesta
      const result = await chat.sendMessage(enrichedMessage);
      const response = result.response.text();

      // Guardar conversación en Firestore (opcional, para analytics)
      await saveConversation(userId, message, response);

      // Incrementar contador de uso
      await incrementChatUsage(userId);

      logger.log('Chat response generated for user:', userId);

      return {
        success: true,
        response: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error in chatWithGemini:', error);

      // Manejar errores específicos de Gemini
      if (error.message?.includes('SAFETY')) {
        throw new HttpsError(
          'invalid-argument',
          'Tu mensaje fue bloqueado por políticas de seguridad. Por favor reformula tu pregunta.'
        );
      }

      if (error.message?.includes('quota') || error.message?.includes('rate')) {
        throw new HttpsError(
          'resource-exhausted',
          'Se ha alcanzado el límite de consultas. Intenta de nuevo en unos minutos.'
        );
      }

      throw new HttpsError(
        'internal',
        'Error al procesar tu mensaje. Por favor intenta de nuevo.'
      );
    }
  }
);

/**
 * Guardar conversación en Firestore
 */
async function saveConversation(userId, userMessage, botResponse) {
  try {
    await db.collection('chatLogs').add({
      userId: userId,
      userMessage: userMessage.substring(0, 500), // Limitar para storage
      botResponse: botResponse.substring(0, 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('Error saving conversation:', error);
    // No lanzar error, es opcional
  }
}

/**
 * Incrementar contador de uso del chat
 */
async function incrementChatUsage(userId) {
  try {
    const statsRef = db.collection('tenants').doc(userId).collection('stats').doc('chatbot');

    await statsRef.set({
      totalMessages: FieldValue.increment(1),
      lastUsed: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    logger.warn('Error incrementing chat usage:', error);
  }
}

/**
 * Obtener sugerencias de preguntas frecuentes
 */
export const getChatSuggestions = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const suggestions = [
      '¿Cuáles son los umbrales de aviso para operaciones inmobiliarias?',
      '¿Cuándo debo presentar un Aviso al SAT?',
      '¿Qué documentos necesito para identificar a un cliente?',
      '¿Cuánto tiempo debo conservar la documentación PLD?',
      '¿Cuáles son las sanciones por no presentar Avisos?',
      '¿Qué es una Actividad Vulnerable según la LFPIORPI?',
      '¿Cómo calculo el umbral en UMAs?',
      '¿Qué información debe contener un Aviso?',
    ];

    return {
      success: true,
      suggestions: suggestions,
    };
  }
);

export default chatWithGemini;
