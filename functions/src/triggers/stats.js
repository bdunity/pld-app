/**
 * Statistics Triggers
 * Actualización incremental de estadísticas para Analytics
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

/**
 * Extraer información demográfica del RFC/CURP
 * RFC Persona Física: 4 letras + 6 dígitos (fecha) + 3 homoclave = 13 caracteres
 * CURP: 18 caracteres con sexo en posición 11
 */
function extractDemographics(rfc, curp) {
  const demographics = {
    age: null,
    ageRange: null,
    gender: null,
  };

  try {
    // Extraer fecha de nacimiento del RFC (posiciones 5-10)
    if (rfc && rfc.length === 13) {
      const yearStr = rfc.substring(4, 6);
      const monthStr = rfc.substring(6, 8);
      const dayStr = rfc.substring(8, 10);

      // Determinar siglo (asumimos 1930-2029)
      let year = parseInt(yearStr);
      year = year > 29 ? 1900 + year : 2000 + year;

      const birthDate = new Date(year, parseInt(monthStr) - 1, parseInt(dayStr));
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();

      // Ajustar si no ha cumplido años
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      demographics.age = age;
      demographics.ageRange = getAgeRange(age);
    }

    // Extraer género del CURP (posición 11: H=Hombre, M=Mujer)
    if (curp && curp.length === 18) {
      const genderChar = curp.charAt(10).toUpperCase();
      if (genderChar === 'H') {
        demographics.gender = 'M'; // Masculino
      } else if (genderChar === 'M') {
        demographics.gender = 'F'; // Femenino
      }
    }
  } catch (error) {
    logger.warn('Error extracting demographics:', error);
  }

  return demographics;
}

/**
 * Obtener rango de edad
 */
function getAgeRange(age) {
  if (age < 18) return 'menor_18';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 55) return '46-55';
  if (age <= 65) return '56-65';
  return '65+';
}

/**
 * Determinar nivel de riesgo basado en monto y tipo de operación
 */
function calculateRiskLevel(operation) {
  const amount = operation.monto || operation.amount || 0;
  const activityType = operation.actividadVulnerable || operation.tipoOperacion;

  // Umbrales en MXN aproximados
  const HIGH_RISK_THRESHOLD = 500000;
  const MEDIUM_RISK_THRESHOLD = 100000;

  // Actividades de alto riesgo inherente
  const highRiskActivities = [
    'INMOBILIARIA',
    'BLINDAJE',
    'JOYAS_RELOJES',
    'OBRAS_ARTE',
    'TRASLADO_VALORES',
  ];

  // Si la actividad es de alto riesgo inherente y monto considerable
  if (highRiskActivities.includes(activityType) && amount > MEDIUM_RISK_THRESHOLD) {
    return 'high';
  }

  // Por monto
  if (amount >= HIGH_RISK_THRESHOLD) {
    return 'high';
  } else if (amount >= MEDIUM_RISK_THRESHOLD) {
    return 'medium';
  }

  return 'low';
}

/**
 * Extraer estado de la dirección o RFC
 */
function extractState(operation) {
  // Si tiene estado explícito
  if (operation.estado) {
    return normalizeState(operation.estado);
  }

  // Intentar extraer del RFC (últimas 3 letras contienen código de estado en algunos casos)
  // Esto es una aproximación, no es 100% preciso
  if (operation.clienteRfc && operation.clienteRfc.length >= 13) {
    // Los estados no se codifican directamente en RFC, usar ubicación si existe
    if (operation.ubicacion?.estado) {
      return normalizeState(operation.ubicacion.estado);
    }
  }

  return 'NO_ESPECIFICADO';
}

/**
 * Normalizar nombre de estado
 */
function normalizeState(state) {
  const stateMap = {
    'AGUASCALIENTES': 'AGS',
    'BAJA CALIFORNIA': 'BC',
    'BAJA CALIFORNIA SUR': 'BCS',
    'CAMPECHE': 'CAM',
    'CHIAPAS': 'CHIS',
    'CHIHUAHUA': 'CHIH',
    'CIUDAD DE MEXICO': 'CDMX',
    'COAHUILA': 'COAH',
    'COLIMA': 'COL',
    'DURANGO': 'DGO',
    'ESTADO DE MEXICO': 'MEX',
    'GUANAJUATO': 'GTO',
    'GUERRERO': 'GRO',
    'HIDALGO': 'HGO',
    'JALISCO': 'JAL',
    'MICHOACAN': 'MICH',
    'MORELOS': 'MOR',
    'NAYARIT': 'NAY',
    'NUEVO LEON': 'NL',
    'OAXACA': 'OAX',
    'PUEBLA': 'PUE',
    'QUERETARO': 'QRO',
    'QUINTANA ROO': 'QROO',
    'SAN LUIS POTOSI': 'SLP',
    'SINALOA': 'SIN',
    'SONORA': 'SON',
    'TABASCO': 'TAB',
    'TAMAULIPAS': 'TAM',
    'TLAXCALA': 'TLAX',
    'VERACRUZ': 'VER',
    'YUCATAN': 'YUC',
    'ZACATECAS': 'ZAC',
  };

  const normalized = state.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return stateMap[normalized] || state.substring(0, 4).toUpperCase();
}

/**
 * Trigger: Actualizar estadísticas cuando se escribe una operación
 */
export const onOperationWrite = onDocumentWritten(
  {
    document: 'operations/{operationId}',
    region: 'us-central1',
  },
  async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    // Si se eliminó el documento
    if (!afterData) {
      if (beforeData?.tenantId) {
        await decrementStats(beforeData.tenantId, beforeData);
      }
      return;
    }

    const tenantId = afterData.tenantId;
    if (!tenantId) {
      logger.warn('Operation without tenantId:', event.params.operationId);
      return;
    }

    try {
      // Si es una nueva operación
      if (!beforeData) {
        await incrementStats(tenantId, afterData);
        logger.log('Stats incremented for tenant:', tenantId);
      }
      // Si es una actualización, verificar si cambió el nivel de riesgo
      else if (beforeData.monto !== afterData.monto) {
        await updateStats(tenantId, beforeData, afterData);
        logger.log('Stats updated for tenant:', tenantId);
      }
    } catch (error) {
      logger.error('Error updating stats:', error);
    }
  }
);

/**
 * Incrementar estadísticas para nueva operación
 */
async function incrementStats(tenantId, operation) {
  const statsRef = db.collection('tenants').doc(tenantId).collection('stats').doc('dashboard');

  const riskLevel = calculateRiskLevel(operation);
  const demographics = extractDemographics(operation.clienteRfc, operation.clienteCurp);
  const state = extractState(operation);
  const month = getMonthKey(operation.fechaOperacion || operation.createdAt);
  const activityType = operation.actividadVulnerable || operation.tipoOperacion || 'OTHER';

  const updateData = {
    totalOperations: FieldValue.increment(1),
    totalAmount: FieldValue.increment(operation.monto || 0),
    [`riskLevels.${riskLevel}`]: FieldValue.increment(1),
    [`operationsByMonth.${month}`]: FieldValue.increment(1),
    [`operationsByState.${state}`]: FieldValue.increment(1),
    [`operationsByType.${activityType}`]: FieldValue.increment(1),
    updatedAt: new Date().toISOString(),
  };

  // Agregar demografía si está disponible
  if (demographics.ageRange) {
    updateData[`demographics.ages.${demographics.ageRange}`] = FieldValue.increment(1);
  }
  if (demographics.gender) {
    updateData[`demographics.gender.${demographics.gender}`] = FieldValue.increment(1);
  }

  await statsRef.set(updateData, { merge: true });

  // También actualizar stats globales para admin
  await updateGlobalStats(operation, 1);
}

/**
 * Decrementar estadísticas cuando se elimina una operación
 */
async function decrementStats(tenantId, operation) {
  const statsRef = db.collection('tenants').doc(tenantId).collection('stats').doc('dashboard');

  const riskLevel = calculateRiskLevel(operation);
  const demographics = extractDemographics(operation.clienteRfc, operation.clienteCurp);
  const state = extractState(operation);
  const month = getMonthKey(operation.fechaOperacion || operation.createdAt);

  const updateData = {
    totalOperations: FieldValue.increment(-1),
    totalAmount: FieldValue.increment(-(operation.monto || 0)),
    [`riskLevels.${riskLevel}`]: FieldValue.increment(-1),
    [`operationsByMonth.${month}`]: FieldValue.increment(-1),
    [`operationsByState.${state}`]: FieldValue.increment(-1),
    updatedAt: new Date().toISOString(),
  };

  if (demographics.ageRange) {
    updateData[`demographics.ages.${demographics.ageRange}`] = FieldValue.increment(-1);
  }
  if (demographics.gender) {
    updateData[`demographics.gender.${demographics.gender}`] = FieldValue.increment(-1);
  }

  await statsRef.set(updateData, { merge: true });
  await updateGlobalStats(operation, -1);
}

/**
 * Actualizar estadísticas cuando se modifica una operación
 */
async function updateStats(tenantId, beforeOp, afterOp) {
  // Decrementar con datos antiguos e incrementar con nuevos
  await decrementStats(tenantId, beforeOp);
  await incrementStats(tenantId, afterOp);
}

/**
 * Actualizar estadísticas globales (para dashboard de admin)
 */
async function updateGlobalStats(operation, delta) {
  try {
    const globalRef = db.collection('stats').doc('global');
    const month = getMonthKey(operation.fechaOperacion || operation.createdAt);

    await globalRef.set({
      totalOperations: FieldValue.increment(delta),
      totalAmount: FieldValue.increment(delta * (operation.monto || 0)),
      [`operationsByMonth.${month}`]: FieldValue.increment(delta),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    logger.warn('Error updating global stats:', error);
  }
}

/**
 * Obtener clave de mes (YYYY-MM)
 */
function getMonthKey(dateString) {
  try {
    const date = dateString ? new Date(dateString) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

/**
 * Callable: Obtener estadísticas del dashboard
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';

export const getDashboardStats = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.token.tenantId || request.auth.uid;

    try {
      const statsDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('stats')
        .doc('dashboard')
        .get();

      if (!statsDoc.exists) {
        // Retornar estructura vacía
        return {
          success: true,
          stats: {
            totalOperations: 0,
            totalAmount: 0,
            riskLevels: { high: 0, medium: 0, low: 0 },
            demographics: {
              ages: {},
              gender: { M: 0, F: 0 },
            },
            operationsByMonth: {},
            operationsByState: {},
            operationsByType: {},
          },
        };
      }

      return {
        success: true,
        stats: statsDoc.data(),
      };
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      throw new HttpsError('internal', 'Error al obtener estadísticas');
    }
  }
);

export default onOperationWrite;
