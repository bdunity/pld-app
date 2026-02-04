/**
 * LMS API
 * Sistema de cursos y generación de certificados
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { logAuditAction } from '../triggers/audit.js';

const db = getFirestore();
const storage = getStorage();

// ============================================================
// CURSOS DISPONIBLES (Mock Data)
// ============================================================

const COURSES = {
  PLD_BASICO: {
    id: 'PLD_BASICO',
    title: 'Fundamentos de PLD/FT',
    description: 'Curso básico sobre Prevención de Lavado de Dinero y Financiamiento al Terrorismo',
    duration: '2 horas',
    modules: [
      {
        id: 'mod1',
        title: 'Introducción a la LFPIORPI',
        type: 'video',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        duration: '20 min',
      },
      {
        id: 'mod2',
        title: 'Actividades Vulnerables',
        type: 'video',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        duration: '25 min',
      },
      {
        id: 'mod3',
        title: 'Identificación de Clientes',
        type: 'reading',
        content: `
# Identificación de Clientes (KYC)

## ¿Qué es KYC?
KYC (Know Your Customer) es el proceso de verificar la identidad de los clientes...

## Documentos Requeridos
- Identificación oficial vigente
- Comprobante de domicilio
- RFC (para personas morales)

## Umbrales de Operación
Según la LFPIORPI, las operaciones deben reportarse cuando superen ciertos umbrales...
        `,
        duration: '15 min',
      },
      {
        id: 'mod4',
        title: 'Reportes y Avisos',
        type: 'video',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        duration: '30 min',
      },
    ],
    exam: {
      passingScore: 80,
      questions: [
        {
          id: 'q1',
          question: '¿Qué significa LFPIORPI?',
          options: [
            'Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita',
            'Ley Federal de Protección de Información Personal',
            'Ley Federal de Prevención de Ilícitos Patrimoniales',
            'Ninguna de las anteriores',
          ],
          correctAnswer: 0,
        },
        {
          id: 'q2',
          question: '¿Cuál es el umbral para reportar operaciones en efectivo según la ley?',
          options: [
            '$50,000 MXN',
            '$100,000 MXN',
            '$250,000 MXN',
            'Depende de la actividad vulnerable',
          ],
          correctAnswer: 3,
        },
        {
          id: 'q3',
          question: '¿Qué documento es esencial para la identificación de personas morales?',
          options: [
            'Pasaporte del representante legal',
            'Acta constitutiva y RFC',
            'Licencia de conducir',
            'Cartilla militar',
          ],
          correctAnswer: 1,
        },
        {
          id: 'q4',
          question: '¿Cuál es el plazo máximo para presentar avisos ante la UIF?',
          options: [
            '5 días hábiles',
            '10 días hábiles',
            '17 días del mes siguiente',
            '30 días naturales',
          ],
          correctAnswer: 2,
        },
        {
          id: 'q5',
          question: '¿Qué es una PEP en el contexto de PLD?',
          options: [
            'Persona Económicamente Pobre',
            'Persona Expuesta Políticamente',
            'Programa de Evaluación Preventiva',
            'Protocolo de Emergencia Patrimonial',
          ],
          correctAnswer: 1,
        },
      ],
    },
  },
  PLD_AVANZADO: {
    id: 'PLD_AVANZADO',
    title: 'PLD Avanzado para Oficiales de Cumplimiento',
    description: 'Curso especializado para responsables de cumplimiento normativo',
    duration: '4 horas',
    modules: [
      {
        id: 'mod1',
        title: 'Marco Regulatorio Internacional',
        type: 'video',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        duration: '45 min',
      },
      {
        id: 'mod2',
        title: 'Análisis de Riesgo',
        type: 'reading',
        content: '# Metodología de Análisis de Riesgo\n\nEl análisis de riesgo PLD/FT...',
        duration: '30 min',
      },
    ],
    exam: {
      passingScore: 85,
      questions: [
        {
          id: 'q1',
          question: '¿Qué organismo internacional establece los estándares GAFI?',
          options: ['ONU', 'FMI', 'FATF/GAFI', 'BID'],
          correctAnswer: 2,
        },
        {
          id: 'q2',
          question: '¿Cada cuánto se debe actualizar la matriz de riesgo?',
          options: ['Mensualmente', 'Anualmente', 'Cada 5 años', 'Solo cuando hay cambios regulatorios'],
          correctAnswer: 1,
        },
      ],
    },
  },
};

// ============================================================
// FUNCTIONS
// ============================================================

/**
 * Obtener cursos disponibles
 */
export const getAvailableCourses = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.uid;

    try {
      // Obtener progreso del usuario en cada curso
      const progressSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('course_progress')
        .get();

      const progressMap = {};
      progressSnapshot.docs.forEach((doc) => {
        progressMap[doc.id] = doc.data();
      });

      // Mapear cursos con progreso
      const courses = Object.values(COURSES).map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        duration: course.duration,
        moduleCount: course.modules.length,
        progress: progressMap[course.id] || {
          completedModules: [],
          examPassed: false,
          certificateUrl: null,
        },
      }));

      return {
        success: true,
        courses,
      };
    } catch (error) {
      logger.error('Error getting courses:', error);
      throw new HttpsError('internal', 'Error al obtener cursos');
    }
  }
);

/**
 * Obtener detalle de un curso
 */
export const getCourseDetail = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { courseId } = request.data;
    const tenantId = request.auth.uid;

    if (!courseId || !COURSES[courseId]) {
      throw new HttpsError('invalid-argument', 'Curso no encontrado');
    }

    try {
      const course = COURSES[courseId];

      // Obtener progreso
      const progressDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('course_progress')
        .doc(courseId)
        .get();

      const progress = progressDoc.exists
        ? progressDoc.data()
        : {
            completedModules: [],
            examPassed: false,
            certificateUrl: null,
            startedAt: null,
          };

      return {
        success: true,
        course: {
          ...course,
          exam: {
            ...course.exam,
            questions: course.exam.questions.map((q) => ({
              ...q,
              correctAnswer: undefined, // No enviar respuesta correcta al cliente
            })),
          },
        },
        progress,
      };
    } catch (error) {
      logger.error('Error getting course detail:', error);
      throw new HttpsError('internal', 'Error al obtener detalle del curso');
    }
  }
);

/**
 * Marcar módulo como completado
 */
export const completeModule = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { courseId, moduleId } = request.data;
    const tenantId = request.auth.uid;

    if (!courseId || !moduleId || !COURSES[courseId]) {
      throw new HttpsError('invalid-argument', 'Datos inválidos');
    }

    try {
      const progressRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('course_progress')
        .doc(courseId);

      const progressDoc = await progressRef.get();

      if (progressDoc.exists) {
        await progressRef.update({
          completedModules: FieldValue.arrayUnion(moduleId),
          lastAccessedAt: new Date().toISOString(),
        });
      } else {
        await progressRef.set({
          completedModules: [moduleId],
          examPassed: false,
          certificateUrl: null,
          startedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
        });
      }

      return { success: true };
    } catch (error) {
      logger.error('Error completing module:', error);
      throw new HttpsError('internal', 'Error al guardar progreso');
    }
  }
);

/**
 * Enviar examen y generar certificado si aprueba
 */
export const submitExam = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { courseId, answers } = request.data;
    const tenantId = request.auth.uid;
    const userEmail = request.auth.token.email;

    if (!courseId || !answers || !COURSES[courseId]) {
      throw new HttpsError('invalid-argument', 'Datos inválidos');
    }

    const course = COURSES[courseId];
    const exam = course.exam;

    try {
      // Calificar examen
      let correctCount = 0;
      const results = [];

      exam.questions.forEach((question) => {
        const userAnswer = answers[question.id];
        const isCorrect = userAnswer === question.correctAnswer;
        if (isCorrect) correctCount++;
        results.push({
          questionId: question.id,
          userAnswer,
          isCorrect,
        });
      });

      const score = Math.round((correctCount / exam.questions.length) * 100);
      const passed = score >= exam.passingScore;

      // Obtener datos del tenant para el certificado
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const tenantData = tenantDoc.data() || {};
      const userName =
        tenantData.oficialCumplimiento?.nombre ||
        tenantData.razonSocial ||
        userEmail;

      // Guardar resultado del examen
      const examResult = {
        courseId,
        courseName: course.title,
        score,
        passed,
        passingScore: exam.passingScore,
        correctCount,
        totalQuestions: exam.questions.length,
        results,
        submittedAt: new Date().toISOString(),
      };

      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('exam_results')
        .add(examResult);

      let certificateUrl = null;

      // Si aprobó, generar certificado
      if (passed) {
        certificateUrl = await generateCertificate(tenantId, userName, course.title);

        // Actualizar progreso del curso
        await db
          .collection('tenants')
          .doc(tenantId)
          .collection('course_progress')
          .doc(courseId)
          .set(
            {
              examPassed: true,
              examScore: score,
              certificateUrl,
              completedAt: new Date().toISOString(),
            },
            { merge: true }
          );

        // Registrar en audit log
        await logAuditAction({
          tenantId,
          userId: request.auth.uid,
          userEmail,
          action: 'COURSE_COMPLETED',
          details: {
            courseId,
            courseName: course.title,
            score,
            certificateGenerated: true,
          },
        });
      }

      return {
        success: true,
        passed,
        score,
        passingScore: exam.passingScore,
        correctCount,
        totalQuestions: exam.questions.length,
        certificateUrl,
        message: passed
          ? '¡Felicidades! Has aprobado el examen. Tu certificado está listo.'
          : `No alcanzaste el puntaje mínimo (${exam.passingScore}%). Puedes intentarlo de nuevo.`,
      };
    } catch (error) {
      logger.error('Error submitting exam:', error);
      throw new HttpsError('internal', 'Error al procesar el examen');
    }
  }
);

/**
 * Generar certificado PDF
 */
async function generateCertificate(tenantId, userName, courseName) {
  try {
    // Crear documento PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 Landscape

    // Cargar fuentes
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = page.getSize();

    // Colores
    const primaryColor = rgb(0.31, 0.27, 0.9); // #4f46e5
    const goldColor = rgb(0.85, 0.65, 0.13);
    const textColor = rgb(0.1, 0.1, 0.1);

    // ===== DISEÑO DEL CERTIFICADO =====

    // Borde decorativo
    page.drawRectangle({
      x: 20,
      y: 20,
      width: width - 40,
      height: height - 40,
      borderColor: goldColor,
      borderWidth: 3,
    });

    // Borde interno
    page.drawRectangle({
      x: 30,
      y: 30,
      width: width - 60,
      height: height - 60,
      borderColor: primaryColor,
      borderWidth: 1,
    });

    // Header - Logo/Título
    page.drawText('PLD BDU', {
      x: width / 2 - 60,
      y: height - 80,
      size: 28,
      font: timesRomanBoldFont,
      color: primaryColor,
    });

    page.drawText('CERTIFICADO DE CUMPLIMIENTO', {
      x: width / 2 - 180,
      y: height - 130,
      size: 32,
      font: timesRomanBoldFont,
      color: goldColor,
    });

    // Línea decorativa
    page.drawLine({
      start: { x: 150, y: height - 145 },
      end: { x: width - 150, y: height - 145 },
      thickness: 2,
      color: goldColor,
    });

    // Texto principal
    page.drawText('Se otorga el presente certificado a:', {
      x: width / 2 - 130,
      y: height - 200,
      size: 16,
      font: timesRomanFont,
      color: textColor,
    });

    // Nombre del participante
    const nameWidth = timesRomanBoldFont.widthOfTextAtSize(userName, 36);
    page.drawText(userName.toUpperCase(), {
      x: width / 2 - nameWidth / 2,
      y: height - 260,
      size: 36,
      font: timesRomanBoldFont,
      color: primaryColor,
    });

    // Línea bajo el nombre
    page.drawLine({
      start: { x: 200, y: height - 275 },
      end: { x: width - 200, y: height - 275 },
      thickness: 1,
      color: textColor,
    });

    // Descripción del curso
    page.drawText('Por haber completado satisfactoriamente el curso:', {
      x: width / 2 - 180,
      y: height - 320,
      size: 14,
      font: timesRomanFont,
      color: textColor,
    });

    const courseWidth = timesRomanBoldFont.widthOfTextAtSize(courseName, 24);
    page.drawText(courseName, {
      x: width / 2 - courseWidth / 2,
      y: height - 360,
      size: 24,
      font: timesRomanBoldFont,
      color: textColor,
    });

    // Fecha
    const date = new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    page.drawText(`Expedido el ${date}`, {
      x: width / 2 - 80,
      y: height - 420,
      size: 14,
      font: helveticaFont,
      color: textColor,
    });

    // Sección de firmas
    // Firma izquierda
    page.drawLine({
      start: { x: 150, y: 120 },
      end: { x: 350, y: 120 },
      thickness: 1,
      color: textColor,
    });
    page.drawText('Director de Capacitación', {
      x: 190,
      y: 100,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    page.drawText('PLD BDU', {
      x: 225,
      y: 85,
      size: 10,
      font: helveticaFont,
      color: textColor,
    });

    // Firma derecha
    page.drawLine({
      start: { x: width - 350, y: 120 },
      end: { x: width - 150, y: 120 },
      thickness: 1,
      color: textColor,
    });
    page.drawText('Oficial de Cumplimiento', {
      x: width - 310,
      y: 100,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });

    // ID del certificado
    const certId = `CERT-${tenantId.substring(0, 6).toUpperCase()}-${Date.now()}`;
    page.drawText(`ID: ${certId}`, {
      x: 40,
      y: 40,
      size: 8,
      font: helveticaFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Guardar PDF
    const pdfBytes = await pdfDoc.save();

    // Subir a Firebase Storage
    const bucket = storage.bucket();
    const fileName = `tenants/${tenantId}/compliance_vault/certificates/${certId}.pdf`;
    const file = bucket.file(fileName);

    await file.save(Buffer.from(pdfBytes), {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          tenantId,
          userName,
          courseName,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Hacer el archivo público o generar URL firmada
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Guardar en compliance_vault
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('compliance_vault')
      .add({
        type: 'CERTIFICATE',
        name: `Certificado - ${courseName}`,
        fileUrl: publicUrl,
        fileName: `${certId}.pdf`,
        uploadedBy: 'system',
        uploadedAt: new Date().toISOString(),
        metadata: {
          certId,
          courseName,
          userName,
        },
      });

    logger.info('Certificate generated:', { tenantId, certId, courseName });

    return publicUrl;
  } catch (error) {
    logger.error('Error generating certificate:', error);
    throw error;
  }
}

/**
 * Obtener certificados del tenant
 */
export const getMyCertificates = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.uid;

    try {
      const certificatesSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('compliance_vault')
        .where('type', '==', 'CERTIFICATE')
        .orderBy('uploadedAt', 'desc')
        .get();

      const certificates = certificatesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        certificates,
      };
    } catch (error) {
      logger.error('Error getting certificates:', error);
      throw new HttpsError('internal', 'Error al obtener certificados');
    }
  }
);

export default {
  getAvailableCourses,
  getCourseDetail,
  completeModule,
  submitExam,
  getMyCertificates,
};
