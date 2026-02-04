/**
 * Billing API
 * Funciones callable para gestión de pagos y suscripciones
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  createCustomer,
  getCustomerByExternalId,
  createCardCharge,
  createBankCharge,
  createSubscription,
  cancelSubscription,
} from '../services/openpay.js';

const db = getFirestore();

// Planes disponibles
const PLANS = {
  plan_free: {
    id: 'plan_free',
    name: 'Plan Gratuito',
    price: 0,
    interval: 'month',
    features: ['Hasta 10 operaciones/mes', 'Soporte por email'],
    operationsLimit: 10,
  },
  plan_pro_mensual: {
    id: 'plan_pro_mensual',
    name: 'Plan Pro Mensual',
    price: 999,
    interval: 'month',
    features: ['Operaciones ilimitadas', 'Soporte prioritario', 'Generador XML'],
    operationsLimit: -1, // Ilimitado
  },
  plan_pro_anual: {
    id: 'plan_pro_anual',
    name: 'Plan Pro Anual',
    price: 9990,
    interval: 'year',
    features: ['Operaciones ilimitadas', 'Soporte prioritario', 'Generador XML', '2 meses gratis'],
    operationsLimit: -1,
  },
  plan_enterprise: {
    id: 'plan_enterprise',
    name: 'Plan Enterprise',
    price: 2999,
    interval: 'month',
    features: ['Multi-usuario', 'API Access', 'Soporte dedicado', 'SLA 99.9%'],
    operationsLimit: -1,
  },
};

/**
 * Obtener planes disponibles
 */
export const getPlans = onCall(
  { region: 'us-central1' },
  async (request) => {
    return {
      success: true,
      plans: Object.values(PLANS),
    };
  }
);

/**
 * Suscribir tenant a un plan
 */
export const subscribeTenant = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { planId, paymentMethod, tokenId, deviceSessionId } = request.data;
    const tenantId = request.auth.token.tenantId || request.auth.uid;
    const userEmail = request.auth.token.email;

    // Validar plan
    const plan = PLANS[planId];
    if (!plan) {
      throw new HttpsError('invalid-argument', 'Plan no válido');
    }

    // Plan gratuito no requiere pago
    if (planId === 'plan_free') {
      await updateTenantPlan(tenantId, {
        planId: plan.id,
        planName: plan.name,
        status: 'ACTIVE',
        price: 0,
        operationsLimit: plan.operationsLimit,
      });

      return { success: true, plan: plan.name, status: 'ACTIVE' };
    }

    // Validar método de pago
    if (!paymentMethod || !['CARD', 'SPEI'].includes(paymentMethod)) {
      throw new HttpsError('invalid-argument', 'Método de pago no válido');
    }

    if (paymentMethod === 'CARD' && !tokenId) {
      throw new HttpsError('invalid-argument', 'Se requiere el token de la tarjeta');
    }

    try {
      // Obtener o crear cliente en Openpay
      let customer = await getCustomerByExternalId(tenantId);

      if (!customer) {
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        const tenantData = tenantDoc.data();

        customer = await createCustomer({
          name: tenantData?.razonSocial || userEmail,
          email: userEmail,
          phone: tenantData?.oficialCumplimiento?.telefono || '',
          tenantId: tenantId,
        });

        // Guardar customerId en tenant
        await db.collection('tenants').doc(tenantId).update({
          'billing.openpayCustomerId': customer.id,
        });
      }

      let paymentResult;
      const orderId = `order_${tenantId}_${Date.now()}`;

      if (paymentMethod === 'CARD') {
        // Pago con tarjeta
        paymentResult = await createCardCharge(customer.id, {
          tokenId: tokenId,
          amount: plan.price,
          description: `Suscripción ${plan.name} - PLD BDU`,
          orderId: orderId,
          deviceSessionId: deviceSessionId,
          metadata: {
            tenantId: tenantId,
            planId: planId,
          },
        });

        // Guardar en historial de pagos
        await savePaymentRecord(tenantId, {
          chargeId: paymentResult.id,
          orderId: orderId,
          amount: plan.price,
          status: paymentResult.status,
          method: 'CARD',
          planId: planId,
          planName: plan.name,
          cardLast4: paymentResult.card?.card_number?.slice(-4),
          cardBrand: paymentResult.card?.brand,
        });

        // Si el cargo fue exitoso, activar plan
        if (paymentResult.status === 'completed') {
          await updateTenantPlan(tenantId, {
            planId: plan.id,
            planName: plan.name,
            status: 'ACTIVE',
            price: plan.price,
            operationsLimit: plan.operationsLimit,
            lastChargeId: paymentResult.id,
            validUntil: getValidUntil(plan.interval),
          });

          return {
            success: true,
            plan: plan.name,
            status: 'ACTIVE',
            chargeId: paymentResult.id,
          };
        }

        throw new HttpsError('aborted', 'El pago no fue completado');

      } else {
        // Pago con SPEI
        paymentResult = await createBankCharge(customer.id, {
          amount: plan.price,
          description: `Suscripción ${plan.name} - PLD BDU`,
          orderId: orderId,
          metadata: {
            tenantId: tenantId,
            planId: planId,
          },
        });

        // Guardar en historial de pagos como pendiente
        await savePaymentRecord(tenantId, {
          chargeId: paymentResult.chargeId,
          orderId: orderId,
          amount: plan.price,
          status: 'PENDING',
          method: 'SPEI',
          planId: planId,
          planName: plan.name,
          clabe: paymentResult.clabe,
          bankName: paymentResult.bankName,
          reference: paymentResult.reference,
          dueDate: paymentResult.dueDate,
        });

        // Actualizar tenant como pendiente de pago
        await updateTenantPlan(tenantId, {
          planId: plan.id,
          planName: plan.name,
          status: 'PENDING_PAYMENT',
          price: plan.price,
          pendingChargeId: paymentResult.chargeId,
        });

        return {
          success: true,
          plan: plan.name,
          status: 'PENDING_PAYMENT',
          paymentInstructions: {
            clabe: paymentResult.clabe,
            bankName: paymentResult.bankName,
            reference: paymentResult.reference,
            amount: paymentResult.amount,
            dueDate: paymentResult.dueDate,
            concept: `Suscripción ${plan.name} - PLD BDU`,
          },
        };
      }
    } catch (error) {
      logger.error('Error in subscribeTenant:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Error procesando el pago'
      );
    }
  }
);

/**
 * Cancelar suscripción
 */
export const cancelTenantSubscription = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.token.tenantId || request.auth.uid;

    try {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const billing = tenantDoc.data()?.billing;

      if (billing?.openpaySubscriptionId && billing?.openpayCustomerId) {
        await cancelSubscription(
          billing.openpayCustomerId,
          billing.openpaySubscriptionId
        );
      }

      // Cambiar a plan gratuito
      await updateTenantPlan(tenantId, {
        planId: 'plan_free',
        planName: 'Plan Gratuito',
        status: 'ACTIVE',
        price: 0,
        operationsLimit: PLANS.plan_free.operationsLimit,
        canceledAt: new Date().toISOString(),
      });

      return { success: true, message: 'Suscripción cancelada' };
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      throw new HttpsError('internal', 'Error al cancelar la suscripción');
    }
  }
);

/**
 * Obtener historial de pagos
 */
export const getPaymentHistory = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.token.tenantId || request.auth.uid;

    try {
      const paymentsSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('payments')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const payments = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { success: true, payments };
    } catch (error) {
      logger.error('Error getting payment history:', error);
      throw new HttpsError('internal', 'Error al obtener historial de pagos');
    }
  }
);

/**
 * Obtener estado de facturación actual
 */
export const getBillingStatus = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.token.tenantId || request.auth.uid;

    try {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const billing = tenantDoc.data()?.billing || {};

      return {
        success: true,
        billing: {
          planId: billing.planId || 'plan_free',
          planName: billing.planName || 'Plan Gratuito',
          status: billing.status || 'ACTIVE',
          price: billing.price || 0,
          validUntil: billing.validUntil || null,
          operationsLimit: billing.operationsLimit ?? PLANS.plan_free.operationsLimit,
          operationsUsed: billing.operationsUsed || 0,
        },
      };
    } catch (error) {
      logger.error('Error getting billing status:', error);
      throw new HttpsError('internal', 'Error al obtener estado de facturación');
    }
  }
);

// ========================================
// HELPERS
// ========================================

async function updateTenantPlan(tenantId, planData) {
  await db.collection('tenants').doc(tenantId).update({
    'billing.planId': planData.planId,
    'billing.planName': planData.planName,
    'billing.status': planData.status,
    'billing.price': planData.price,
    'billing.operationsLimit': planData.operationsLimit ?? -1,
    'billing.validUntil': planData.validUntil || null,
    'billing.lastChargeId': planData.lastChargeId || null,
    'billing.pendingChargeId': planData.pendingChargeId || null,
    'billing.updatedAt': new Date().toISOString(),
  });

  // Registrar en audit log
  await db.collection('auditLog').add({
    tenantId: tenantId,
    action: 'PLAN_UPDATED',
    resourceType: 'billing',
    details: planData,
    timestamp: new Date().toISOString(),
  });
}

async function savePaymentRecord(tenantId, paymentData) {
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection('payments')
    .add({
      ...paymentData,
      createdAt: new Date().toISOString(),
    });
}

function getValidUntil(interval) {
  const date = new Date();
  if (interval === 'month') {
    date.setMonth(date.getMonth() + 1);
  } else if (interval === 'year') {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString();
}
