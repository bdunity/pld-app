/**
 * Screening Service
 * Motor de búsqueda en listas negras (SAT 69-B, PEPS, ONU)
 */

import Fuse from 'fuse.js';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

// ============================================================
// MOCK DATA - Listas Negras (En producción usar base de datos)
// ============================================================

// Lista 69-B SAT (Contribuyentes con operaciones inexistentes)
const SAT_69B_LIST = [
  { rfc: 'AAA010101AAA', name: 'COMERCIALIZADORA FANTASMA SA DE CV', type: 'DEFINITIVO' },
  { rfc: 'BBB020202BBB', name: 'DISTRIBUIDORA FICTICIA DEL NORTE', type: 'PRESUNTO' },
  { rfc: 'CCC030303CCC', name: 'IMPORTADORA INEXISTENTE SA', type: 'DEFINITIVO' },
  { rfc: 'DDD040404DDD', name: 'SERVICIOS SIMULADOS DEL BAJIO', type: 'PRESUNTO' },
  { rfc: 'EEE050505EEE', name: 'CONSTRUCTORA FALSA SA DE CV', type: 'SENTENCIA' },
  { rfc: 'FFF060606FFF', name: 'TRANSPORTES IMAGINARIOS SC', type: 'DEFINITIVO' },
  { rfc: 'GGG070707GGG', name: 'CONSULTORIA IRREAL SA DE CV', type: 'PRESUNTO' },
  { rfc: 'HHH080808HHH', name: 'ALIMENTOS FRAUDULENTOS SA', type: 'DEFINITIVO' },
];

// Lista PEPs (Personas Expuestas Políticamente)
const PEP_LIST = [
  { name: 'JUAN PEREZ MARTINEZ', position: 'Secretario de Estado', country: 'MX' },
  { name: 'MARIA GARCIA LOPEZ', position: 'Gobernador', country: 'MX' },
  { name: 'CARLOS RODRIGUEZ SANCHEZ', position: 'Senador', country: 'MX' },
  { name: 'ANA FERNANDEZ RUIZ', position: 'Magistrado', country: 'MX' },
  { name: 'PEDRO GONZALEZ HERRERA', position: 'Director General PEMEX', country: 'MX' },
];

// Lista ONU Sanciones
const ONU_SANCTIONS_LIST = [
  { name: 'AL QAEDA NETWORK', type: 'TERRORIST', reference: 'QDe.004' },
  { name: 'TALIBAN ORGANIZATION', type: 'TERRORIST', reference: 'TAe.001' },
  { name: 'NORTH KOREA TRADING CO', type: 'SANCTIONS', reference: 'KPi.001' },
];

// ============================================================
// FUSE.JS CONFIGURATION
// ============================================================

const fuseOptions = {
  includeScore: true,
  threshold: 0.4, // 0 = coincidencia exacta, 1 = coincide todo
  keys: ['name', 'rfc'],
  ignoreLocation: true,
  minMatchCharLength: 3,
};

// Crear instancias de Fuse para cada lista
const fuseSAT = new Fuse(SAT_69B_LIST, { ...fuseOptions, keys: ['name', 'rfc'] });
const fusePEP = new Fuse(PEP_LIST, { ...fuseOptions, keys: ['name'] });
const fuseONU = new Fuse(ONU_SANCTIONS_LIST, { ...fuseOptions, keys: ['name'] });

// ============================================================
// SCREENING FUNCTIONS
// ============================================================

/**
 * Buscar coincidencias en listas negras
 * @param {string} name - Nombre a buscar
 * @param {string} rfc - RFC a buscar (opcional)
 * @returns {Object} Resultados del screening
 */
export const searchBlacklists = (name, rfc = '') => {
  const results = {
    matchFound: false,
    matches: [],
    searchedAt: new Date().toISOString(),
  };

  const normalizedName = name?.toUpperCase().trim() || '';
  const normalizedRfc = rfc?.toUpperCase().trim() || '';

  // Búsqueda en SAT 69-B
  if (normalizedName || normalizedRfc) {
    const satResults = fuseSAT.search(normalizedRfc || normalizedName);
    satResults.forEach((result) => {
      if (result.score <= 0.4) {
        results.matches.push({
          source: 'SAT_69B',
          sourceLabel: 'Lista 69-B SAT',
          matchedName: result.item.name,
          matchedRfc: result.item.rfc,
          type: result.item.type,
          score: Math.round((1 - result.score) * 100) / 100,
          risk: 'CRITICAL',
        });
      }
    });

    // También buscar por nombre si el RFC no coincidió
    if (normalizedName && normalizedRfc) {
      const satNameResults = fuseSAT.search(normalizedName);
      satNameResults.forEach((result) => {
        // Evitar duplicados
        const isDuplicate = results.matches.some(
          (m) => m.source === 'SAT_69B' && m.matchedRfc === result.item.rfc
        );
        if (result.score <= 0.4 && !isDuplicate) {
          results.matches.push({
            source: 'SAT_69B',
            sourceLabel: 'Lista 69-B SAT',
            matchedName: result.item.name,
            matchedRfc: result.item.rfc,
            type: result.item.type,
            score: Math.round((1 - result.score) * 100) / 100,
            risk: 'CRITICAL',
          });
        }
      });
    }
  }

  // Búsqueda en PEPs
  if (normalizedName) {
    const pepResults = fusePEP.search(normalizedName);
    pepResults.forEach((result) => {
      if (result.score <= 0.4) {
        results.matches.push({
          source: 'PEP',
          sourceLabel: 'Personas Expuestas Políticamente',
          matchedName: result.item.name,
          position: result.item.position,
          country: result.item.country,
          score: Math.round((1 - result.score) * 100) / 100,
          risk: 'HIGH',
        });
      }
    });
  }

  // Búsqueda en ONU
  if (normalizedName) {
    const onuResults = fuseONU.search(normalizedName);
    onuResults.forEach((result) => {
      if (result.score <= 0.4) {
        results.matches.push({
          source: 'ONU_SANCTIONS',
          sourceLabel: 'Lista de Sanciones ONU',
          matchedName: result.item.name,
          type: result.item.type,
          reference: result.item.reference,
          score: Math.round((1 - result.score) * 100) / 100,
          risk: 'CRITICAL',
        });
      }
    });
  }

  results.matchFound = results.matches.length > 0;

  // Ordenar por score (mayor primero)
  results.matches.sort((a, b) => b.score - a.score);

  return results;
};

/**
 * Realizar screening de un cliente y guardar resultado
 * @param {string} tenantId - ID del tenant
 * @param {string} clientId - ID del cliente
 * @param {Object} clientData - Datos del cliente
 * @returns {Object} Resultado del screening
 */
export const screenClient = async (tenantId, clientId, clientData) => {
  const { name, rfc, tipo } = clientData;

  const screeningResult = searchBlacklists(name, rfc);

  // Guardar resultado en la colección de screening
  const screeningDoc = {
    tenantId,
    clientId,
    clientName: name,
    clientRfc: rfc || '',
    clientType: tipo || 'PERSONA_MORAL',
    ...screeningResult,
    status: screeningResult.matchFound ? 'PENDING_REVIEW' : 'CLEARED',
    reviewedAt: null,
    reviewedBy: null,
    reviewNotes: null,
  };

  const docRef = await db.collection('screening_results').add(screeningDoc);

  // Si hay coincidencias, crear alerta
  if (screeningResult.matchFound) {
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('alerts')
      .add({
        type: 'SCREENING_MATCH',
        severity: screeningResult.matches[0]?.risk || 'HIGH',
        title: `Coincidencia en Lista Negra: ${name}`,
        description: `Se encontró coincidencia en ${screeningResult.matches[0]?.sourceLabel}`,
        clientId,
        screeningId: docRef.id,
        matches: screeningResult.matches,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

    // Actualizar cliente con flag de riesgo
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('clients')
      .doc(clientId)
      .update({
        screeningStatus: 'FLAGGED',
        lastScreeningAt: new Date().toISOString(),
        screeningId: docRef.id,
      });
  } else {
    // Cliente limpio
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('clients')
      .doc(clientId)
      .update({
        screeningStatus: 'CLEARED',
        lastScreeningAt: new Date().toISOString(),
        screeningId: docRef.id,
      });
  }

  return {
    screeningId: docRef.id,
    ...screeningResult,
  };
};

/**
 * Procesar screening masivo para un tenant
 * @param {string} tenantId - ID del tenant
 * @returns {Object} Resumen del batch
 */
export const batchScreenTenant = async (tenantId) => {
  const results = {
    processed: 0,
    flagged: 0,
    cleared: 0,
    errors: 0,
  };

  try {
    // Obtener clientes que no han sido screened o screened hace más de 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const clientsSnapshot = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('clients')
      .where('screeningStatus', 'in', [null, 'PENDING', undefined])
      .limit(100) // Procesar en batches
      .get();

    for (const doc of clientsSnapshot.docs) {
      try {
        const clientData = doc.data();
        const result = await screenClient(tenantId, doc.id, {
          name: clientData.nombre || clientData.razonSocial,
          rfc: clientData.rfc,
          tipo: clientData.tipo,
        });

        results.processed++;
        if (result.matchFound) {
          results.flagged++;
        } else {
          results.cleared++;
        }
      } catch (error) {
        logger.error(`Error screening client ${doc.id}:`, error);
        results.errors++;
      }
    }

    logger.info(`Batch screening for tenant ${tenantId}:`, results);
  } catch (error) {
    logger.error(`Error in batch screening for tenant ${tenantId}:`, error);
    throw error;
  }

  return results;
};

export default {
  searchBlacklists,
  screenClient,
  batchScreenTenant,
};
