/**
 * Openpay Service
 * Servicio para integración con Openpay (BBVA) México
 * Documentación: https://www.openpay.mx/docs/api/
 */

import Openpay from 'openpay';
import { logger } from 'firebase-functions';

// Configuración de Openpay
const OPENPAY_ID = process.env.OPENPAY_ID || 'YOUR_MERCHANT_ID';
const OPENPAY_PRIVATE_KEY = process.env.OPENPAY_PRIVATE_KEY || 'YOUR_PRIVATE_KEY';
const OPENPAY_SANDBOX = process.env.OPENPAY_SANDBOX !== 'false'; // Default: sandbox

// Inicializar cliente
const openpay = new Openpay(OPENPAY_ID, OPENPAY_PRIVATE_KEY, OPENPAY_SANDBOX);

// Configuración de timeout
openpay.setTimeout(30000); // 30 segundos

/**
 * Crear cliente en Openpay
 */
export async function createCustomer(customerData) {
  return new Promise((resolve, reject) => {
    const customer = {
      name: customerData.name,
      email: customerData.email,
      phone_number: customerData.phone || '',
      external_id: customerData.tenantId, // Vinculamos con nuestro tenantId
      requires_account: false,
    };

    openpay.customers.create(customer, (error, response) => {
      if (error) {
        logger.error('Error creating Openpay customer:', error);
        reject(new Error(error.description || 'Error al crear cliente'));
      } else {
        logger.log('Customer created:', response.id);
        resolve(response);
      }
    });
  });
}

/**
 * Obtener cliente por ID externo (tenantId)
 */
export async function getCustomerByExternalId(externalId) {
  return new Promise((resolve, reject) => {
    openpay.customers.list({ external_id: externalId }, (error, customers) => {
      if (error) {
        logger.error('Error finding customer:', error);
        reject(error);
      } else {
        resolve(customers.length > 0 ? customers[0] : null);
      }
    });
  });
}

/**
 * Crear cargo con tarjeta (usando token)
 */
export async function createCardCharge(customerId, chargeData) {
  return new Promise((resolve, reject) => {
    const charge = {
      source_id: chargeData.tokenId, // Token de la tarjeta
      method: 'card',
      amount: chargeData.amount,
      currency: 'MXN',
      description: chargeData.description,
      order_id: chargeData.orderId,
      device_session_id: chargeData.deviceSessionId,
      capture: true, // Captura inmediata
      metadata: chargeData.metadata || {},
    };

    openpay.customers.charges.create(customerId, charge, (error, response) => {
      if (error) {
        logger.error('Error creating card charge:', error);
        reject({
          code: error.error_code,
          message: getErrorMessage(error.error_code),
          details: error.description,
        });
      } else {
        logger.log('Card charge created:', response.id);
        resolve(response);
      }
    });
  });
}

/**
 * Crear cargo bancario (SPEI)
 */
export async function createBankCharge(customerId, chargeData) {
  return new Promise((resolve, reject) => {
    const charge = {
      method: 'bank_account',
      amount: chargeData.amount,
      currency: 'MXN',
      description: chargeData.description,
      order_id: chargeData.orderId,
      due_date: chargeData.dueDate || getDueDate(3), // Vence en 3 días
      metadata: chargeData.metadata || {},
    };

    openpay.customers.charges.create(customerId, charge, (error, response) => {
      if (error) {
        logger.error('Error creating bank charge:', error);
        reject(new Error(error.description || 'Error al crear cargo bancario'));
      } else {
        logger.log('Bank charge created:', response.id);
        // Respuesta incluye payment_method.clabe y payment_method.name
        resolve({
          chargeId: response.id,
          amount: response.amount,
          status: response.status,
          clabe: response.payment_method?.clabe,
          bankName: response.payment_method?.name || 'STP',
          reference: response.payment_method?.reference,
          dueDate: response.due_date,
          orderId: response.order_id,
        });
      }
    });
  });
}

/**
 * Crear suscripción
 */
export async function createSubscription(customerId, subscriptionData) {
  return new Promise((resolve, reject) => {
    const subscription = {
      plan_id: subscriptionData.planId,
      source_id: subscriptionData.tokenId, // Token de la tarjeta
      device_session_id: subscriptionData.deviceSessionId,
      trial_days: subscriptionData.trialDays || 0,
    };

    openpay.customers.subscriptions.create(customerId, subscription, (error, response) => {
      if (error) {
        logger.error('Error creating subscription:', error);
        reject({
          code: error.error_code,
          message: getErrorMessage(error.error_code),
          details: error.description,
        });
      } else {
        logger.log('Subscription created:', response.id);
        resolve(response);
      }
    });
  });
}

/**
 * Cancelar suscripción
 */
export async function cancelSubscription(customerId, subscriptionId) {
  return new Promise((resolve, reject) => {
    openpay.customers.subscriptions.delete(customerId, subscriptionId, (error, response) => {
      if (error) {
        logger.error('Error canceling subscription:', error);
        reject(error);
      } else {
        logger.log('Subscription canceled:', subscriptionId);
        resolve(response);
      }
    });
  });
}

/**
 * Obtener cargo por ID
 */
export async function getCharge(customerId, chargeId) {
  return new Promise((resolve, reject) => {
    openpay.customers.charges.get(customerId, chargeId, (error, response) => {
      if (error) {
        logger.error('Error getting charge:', error);
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Listar planes disponibles
 */
export async function listPlans() {
  return new Promise((resolve, reject) => {
    openpay.plans.list({}, (error, plans) => {
      if (error) {
        logger.error('Error listing plans:', error);
        reject(error);
      } else {
        resolve(plans);
      }
    });
  });
}

// ========================================
// HELPERS
// ========================================

/**
 * Obtener fecha de vencimiento
 */
function getDueDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0] + 'T23:59:59';
}

/**
 * Mapear códigos de error de Openpay a mensajes amigables
 */
function getErrorMessage(errorCode) {
  const errorMessages = {
    1001: 'La tarjeta fue rechazada. Contacta a tu banco.',
    1002: 'La tarjeta ha expirado.',
    1003: 'La tarjeta no tiene fondos suficientes.',
    1004: 'La tarjeta fue reportada como robada.',
    1005: 'La tarjeta fue rechazada por el sistema antifraude.',
    1006: 'Operación no permitida para esta tarjeta.',
    1007: 'La tarjeta fue declinada.',
    1008: 'La tarjeta no es compatible con pagos en línea.',
    1009: 'La tarjeta fue reportada como perdida.',
    1010: 'El banco no autorizó la operación.',
    2001: 'La cuenta bancaria ya existe.',
    2002: 'La cuenta bancaria no existe.',
    2003: 'El banco no está disponible.',
    3001: 'El cliente ya existe.',
    3002: 'El cliente no existe.',
    3003: 'El cliente tiene cargos pendientes.',
    4001: 'El plan ya existe.',
    4002: 'El plan no existe.',
  };

  return errorMessages[errorCode] || 'Error procesando el pago. Intenta de nuevo.';
}

// Exportar configuración para uso en webhooks
export const openpayConfig = {
  merchantId: OPENPAY_ID,
  isSandbox: OPENPAY_SANDBOX,
};

export default openpay;
