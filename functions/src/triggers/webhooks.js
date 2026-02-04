/**
 * Webhooks Handler
 * Maneja notificaciones de servicios externos (Openpay)
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

// Configuración de Openpay para verificación
const OPENPAY_WEBHOOK_USER = process.env.OPENPAY_WEBHOOK_USER || 'openpay';
const OPENPAY_WEBHOOK_PASSWORD = process.env.OPENPAY_WEBHOOK_PASSWORD || 'webhook_secret';

/**
 * Verificar autenticación Basic Auth del webhook
 */
function verifyWebhookAuth(request) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [username, password] = credentials.split(':');

  return username === OPENPAY_WEBHOOK_USER && password === OPENPAY_WEBHOOK_PASSWORD;
}

/**
 * Webhook principal de Openpay
 * Recibe notificaciones de eventos de pago
 */
export const onOpenpayWebhook = onRequest(
  {
    region: 'us-central1',
    cors: false,
  },
  async (request, response) => {
    // Solo aceptar POST
    if (request.method !== 'POST') {
      response.status(405).send('Method Not Allowed');
      return;
    }

    // Verificar autenticación
    if (!verifyWebhookAuth(request)) {
      logger.warn('Webhook authentication failed', {
        ip: request.ip,
        headers: request.headers,
      });
      response.status(401).send('Unauthorized');
      return;
    }

    try {
      const event = request.body;

      logger.log('Openpay webhook received:', {
        type: event.type,
        transactionId: event.transaction?.id,
      });

      // Validar estructura del evento
      if (!event.type || !event.transaction) {
        logger.warn('Invalid webhook payload', event);
        response.status(400).send('Invalid payload');
        return;
      }

      // Procesar según tipo de evento
      switch (event.type) {
        case 'charge.succeeded':
          await handleChargeSucceeded(event.transaction);
          break;

        case 'charge.failed':
          await handleChargeFailed(event.transaction);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.transaction);
          break;

        case 'subscription.payment.failed':
        case 'subscription.payment_failed':
          await handleSubscriptionPaymentFailed(event.transaction);
          break;

        case 'subscription.cancelled':
        case 'subscription.canceled':
          await handleSubscriptionCancelled(event.transaction);
          break;

        case 'spei.received':
          await handleSpeiReceived(event.transaction);
          break;

        default:
          logger.log('Unhandled webhook event type:', event.type);
      }

      // Guardar evento en log
      await saveWebhookLog(event);

      response.status(200).send('OK');
    } catch (error) {
      logger.error('Error processing webhook:', error);
      response.status(500).send('Internal Server Error');
    }
  }
);

/**
 * Manejar cargo exitoso
 */
async function handleChargeSucceeded(transaction) {
  logger.log('Processing charge.succeeded:', transaction.id);

  const metadata = transaction.metadata || {};
  const tenantId = metadata.tenantId;
  const planId = metadata.planId;

  if (!tenantId) {
    logger.warn('No tenantId in transaction metadata:', transaction.id);
    return;
  }

  try {
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      logger.warn('Tenant not found:', tenantId);
      return;
    }

    // Calcular fecha de validez
    const validUntil = new Date();
    if (planId?.includes('anual')) {
      validUntil.setFullYear(validUntil.getFullYear() + 1);
    } else {
      validUntil.setMonth(validUntil.getMonth() + 1);
    }

    // Actualizar estado del tenant
    await tenantRef.update({
      'billing.status': 'ACTIVE',
      'billing.lastChargeId': transaction.id,
      'billing.lastPaymentDate': new Date().toISOString(),
      'billing.validUntil': validUntil.toISOString(),
      'billing.pendingChargeId': null,
      'billing.updatedAt': new Date().toISOString(),
    });

    // Actualizar registro de pago
    const paymentsQuery = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('payments')
      .where('chargeId', '==', transaction.id)
      .limit(1)
      .get();

    if (!paymentsQuery.empty) {
      await paymentsQuery.docs[0].ref.update({
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    }

    // Registrar en audit log
    await db.collection('auditLog').add({
      tenantId: tenantId,
      action: 'PAYMENT_COMPLETED',
      resourceType: 'billing',
      resourceId: transaction.id,
      details: {
        amount: transaction.amount,
        method: transaction.method,
        planId: planId,
      },
      timestamp: new Date().toISOString(),
    });

    logger.log('Charge succeeded processed for tenant:', tenantId);
  } catch (error) {
    logger.error('Error processing charge.succeeded:', error);
    throw error;
  }
}

/**
 * Manejar cargo fallido
 */
async function handleChargeFailed(transaction) {
  logger.log('Processing charge.failed:', transaction.id);

  const metadata = transaction.metadata || {};
  const tenantId = metadata.tenantId;

  if (!tenantId) {
    logger.warn('No tenantId in transaction metadata:', transaction.id);
    return;
  }

  try {
    // Actualizar registro de pago
    const paymentsQuery = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('payments')
      .where('chargeId', '==', transaction.id)
      .limit(1)
      .get();

    if (!paymentsQuery.empty) {
      await paymentsQuery.docs[0].ref.update({
        status: 'failed',
        failedAt: new Date().toISOString(),
        errorCode: transaction.error_code,
        errorMessage: transaction.error_message,
      });
    }

    // Registrar en audit log
    await db.collection('auditLog').add({
      tenantId: tenantId,
      action: 'PAYMENT_FAILED',
      resourceType: 'billing',
      resourceId: transaction.id,
      details: {
        amount: transaction.amount,
        errorCode: transaction.error_code,
        errorMessage: transaction.error_message,
      },
      timestamp: new Date().toISOString(),
    });

    logger.log('Charge failed processed for tenant:', tenantId);
  } catch (error) {
    logger.error('Error processing charge.failed:', error);
    throw error;
  }
}

/**
 * Manejar reembolso
 */
async function handleChargeRefunded(transaction) {
  logger.log('Processing charge.refunded:', transaction.id);

  const metadata = transaction.metadata || {};
  const tenantId = metadata.tenantId;

  if (!tenantId) return;

  try {
    // Actualizar registro de pago
    const paymentsQuery = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('payments')
      .where('chargeId', '==', transaction.id)
      .limit(1)
      .get();

    if (!paymentsQuery.empty) {
      await paymentsQuery.docs[0].ref.update({
        status: 'refunded',
        refundedAt: new Date().toISOString(),
        refundAmount: transaction.refund?.amount || transaction.amount,
      });
    }

    // Registrar en audit log
    await db.collection('auditLog').add({
      tenantId: tenantId,
      action: 'PAYMENT_REFUNDED',
      resourceType: 'billing',
      resourceId: transaction.id,
      details: {
        amount: transaction.refund?.amount || transaction.amount,
      },
      timestamp: new Date().toISOString(),
    });

    logger.log('Charge refunded processed for tenant:', tenantId);
  } catch (error) {
    logger.error('Error processing charge.refunded:', error);
    throw error;
  }
}

/**
 * Manejar fallo de pago de suscripción
 */
async function handleSubscriptionPaymentFailed(transaction) {
  logger.log('Processing subscription.payment_failed:', transaction.id);

  const metadata = transaction.metadata || {};
  const tenantId = metadata.tenantId;

  if (!tenantId) {
    logger.warn('No tenantId in subscription transaction:', transaction.id);
    return;
  }

  try {
    const tenantRef = db.collection('tenants').doc(tenantId);

    // Cambiar estado a PAST_DUE
    await tenantRef.update({
      'billing.status': 'PAST_DUE',
      'billing.lastFailedPayment': new Date().toISOString(),
      'billing.failedPaymentCount': FieldValue.increment(1),
      'billing.updatedAt': new Date().toISOString(),
    });

    // Registrar en audit log
    await db.collection('auditLog').add({
      tenantId: tenantId,
      action: 'SUBSCRIPTION_PAYMENT_FAILED',
      resourceType: 'billing',
      resourceId: transaction.id,
      details: {
        errorCode: transaction.error_code,
        errorMessage: transaction.error_message,
      },
      timestamp: new Date().toISOString(),
    });

    // TODO: Enviar notificación por email al usuario
    // await sendPaymentFailedEmail(tenantId);

    logger.log('Subscription payment failed processed for tenant:', tenantId);
  } catch (error) {
    logger.error('Error processing subscription.payment_failed:', error);
    throw error;
  }
}

/**
 * Manejar cancelación de suscripción
 */
async function handleSubscriptionCancelled(transaction) {
  logger.log('Processing subscription.cancelled:', transaction.id);

  const metadata = transaction.metadata || {};
  const tenantId = metadata.tenantId;

  if (!tenantId) return;

  try {
    const tenantRef = db.collection('tenants').doc(tenantId);

    // Cambiar a plan gratuito
    await tenantRef.update({
      'billing.planId': 'plan_free',
      'billing.planName': 'Plan Gratuito',
      'billing.status': 'ACTIVE',
      'billing.price': 0,
      'billing.operationsLimit': 10,
      'billing.openpaySubscriptionId': null,
      'billing.canceledAt': new Date().toISOString(),
      'billing.updatedAt': new Date().toISOString(),
    });

    // Registrar en audit log
    await db.collection('auditLog').add({
      tenantId: tenantId,
      action: 'SUBSCRIPTION_CANCELLED',
      resourceType: 'billing',
      resourceId: transaction.id,
      timestamp: new Date().toISOString(),
    });

    logger.log('Subscription cancelled processed for tenant:', tenantId);
  } catch (error) {
    logger.error('Error processing subscription.cancelled:', error);
    throw error;
  }
}

/**
 * Manejar pago SPEI recibido
 */
async function handleSpeiReceived(transaction) {
  logger.log('Processing spei.received:', transaction.id);

  const metadata = transaction.metadata || {};
  const tenantId = metadata.tenantId;
  const planId = metadata.planId;

  if (!tenantId) {
    // Intentar encontrar por order_id
    const orderId = transaction.order_id;
    if (orderId) {
      const orderParts = orderId.split('_');
      if (orderParts.length >= 2) {
        // order_id format: order_{tenantId}_{timestamp}
        const extractedTenantId = orderParts[1];
        await processSpeiPayment(extractedTenantId, transaction, planId);
        return;
      }
    }
    logger.warn('No tenantId found for SPEI transaction:', transaction.id);
    return;
  }

  await processSpeiPayment(tenantId, transaction, planId);
}

/**
 * Procesar pago SPEI
 */
async function processSpeiPayment(tenantId, transaction, planId) {
  try {
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      logger.warn('Tenant not found for SPEI:', tenantId);
      return;
    }

    // Calcular fecha de validez
    const validUntil = new Date();
    if (planId?.includes('anual')) {
      validUntil.setFullYear(validUntil.getFullYear() + 1);
    } else {
      validUntil.setMonth(validUntil.getMonth() + 1);
    }

    // Actualizar estado del tenant
    await tenantRef.update({
      'billing.status': 'ACTIVE',
      'billing.lastChargeId': transaction.id,
      'billing.lastPaymentDate': new Date().toISOString(),
      'billing.validUntil': validUntil.toISOString(),
      'billing.pendingChargeId': null,
      'billing.updatedAt': new Date().toISOString(),
    });

    // Actualizar registro de pago
    const paymentsQuery = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('payments')
      .where('chargeId', '==', transaction.id)
      .limit(1)
      .get();

    if (!paymentsQuery.empty) {
      await paymentsQuery.docs[0].ref.update({
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    }

    // Registrar en audit log
    await db.collection('auditLog').add({
      tenantId: tenantId,
      action: 'SPEI_PAYMENT_RECEIVED',
      resourceType: 'billing',
      resourceId: transaction.id,
      details: {
        amount: transaction.amount,
        planId: planId,
      },
      timestamp: new Date().toISOString(),
    });

    logger.log('SPEI payment processed for tenant:', tenantId);
  } catch (error) {
    logger.error('Error processing SPEI payment:', error);
    throw error;
  }
}

/**
 * Guardar log del webhook
 */
async function saveWebhookLog(event) {
  try {
    await db.collection('webhookLogs').add({
      provider: 'openpay',
      eventType: event.type,
      transactionId: event.transaction?.id,
      payload: event,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error saving webhook log:', error);
  }
}

export default onOpenpayWebhook;
