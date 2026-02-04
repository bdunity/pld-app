/**
 * Services API
 * Marketplace de servicios High-Ticket (Manuales, Capacitación)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { sendNotification, sendSimpleEmail } from '../services/email.js';

const db = getFirestore();

// Tipos de servicios disponibles
const SERVICE_TYPES = {
  MANUAL_PLD: {
    id: 'MANUAL_PLD',
    name: 'Manual de PLD Personalizado',
    description: 'Manual de Prevención de Lavado de Dinero adaptado a tu giro',
    price: 15000,
    deliveryTime: '5-7 días hábiles',
  },
  CAPACITACION_ANUAL: {
    id: 'CAPACITACION_ANUAL',
    name: 'Capacitación Anual PLD',
    description: 'Curso completo para tu equipo con certificación',
    price: 25000,
    deliveryTime: '1-2 semanas',
  },
  AUDITORIA_EXTERNA: {
    id: 'AUDITORIA_EXTERNA',
    name: 'Auditoría Externa PLD',
    description: 'Revisión completa de cumplimiento por expertos certificados',
    price: 45000,
    deliveryTime: '2-3 semanas',
  },
  ASESORIA_LEGAL: {
    id: 'ASESORIA_LEGAL',
    name: 'Asesoría Legal Especializada',
    description: 'Consultoría con abogados expertos en LFPIORPI',
    price: 8000,
    deliveryTime: 'Por sesión',
  },
};

// Configuración de admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pldbdu.com';

/**
 * Obtener servicios disponibles
 */
export const getAvailableServices = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const tenantId = request.auth.uid;

    try {
      // Obtener servicios ya adquiridos por el tenant
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const complianceStatus = tenantDoc.data()?.compliance_status || {};

      // Mapear servicios con estado
      const services = Object.values(SERVICE_TYPES).map((service) => ({
        ...service,
        status: complianceStatus[service.id]?.status || 'NOT_PURCHASED',
        deliveredAt: complianceStatus[service.id]?.deliveredAt || null,
        fileUrl: complianceStatus[service.id]?.fileUrl || null,
      }));

      return {
        success: true,
        services,
      };
    } catch (error) {
      logger.error('Error getting services:', error);
      throw new HttpsError('internal', 'Error al obtener servicios');
    }
  }
);

/**
 * Solicitar servicio (genera lead)
 */
export const requestService = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { serviceType, notes } = request.data;
    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    // Validar tipo de servicio
    if (!serviceType || !SERVICE_TYPES[serviceType]) {
      throw new HttpsError('invalid-argument', 'Tipo de servicio no válido');
    }

    const service = SERVICE_TYPES[serviceType];

    try {
      // Obtener datos del tenant
      const tenantDoc = await db.collection('tenants').doc(userId).get();
      const tenantData = tenantDoc.data() || {};

      // Crear lead
      const leadRef = await db.collection('leads').add({
        tenantId: userId,
        tenantEmail: userEmail,
        tenantName: tenantData.razonSocial || userEmail,
        tenantRfc: tenantData.rfc || 'N/A',
        serviceType: serviceType,
        serviceName: service.name,
        servicePrice: service.price,
        notes: notes || '',
        status: 'PENDING',
        source: 'marketplace',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Actualizar estado en tenant
      await db.collection('tenants').doc(userId).update({
        [`compliance_status.${serviceType}`]: {
          status: 'REQUESTED',
          requestedAt: new Date().toISOString(),
          leadId: leadRef.id,
        },
        updatedAt: new Date().toISOString(),
      });

      // Enviar notificación al admin
      try {
        await sendSimpleEmail(
          ADMIN_EMAIL,
          `Nuevo Lead: ${service.name} - ${tenantData.razonSocial || userEmail}`,
          `
            <h2>Nueva Solicitud de Servicio</h2>
            <p><strong>Cliente:</strong> ${tenantData.razonSocial || 'N/A'}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
            <p><strong>RFC:</strong> ${tenantData.rfc || 'N/A'}</p>
            <p><strong>Servicio:</strong> ${service.name}</p>
            <p><strong>Precio Base:</strong> $${service.price.toLocaleString()} MXN</p>
            <p><strong>Notas:</strong> ${notes || 'Sin notas'}</p>
            <p><strong>Lead ID:</strong> ${leadRef.id}</p>
            <hr>
            <p>Accede al panel de administración para dar seguimiento.</p>
          `
        );
      } catch (emailError) {
        logger.warn('Error sending admin notification:', emailError);
      }

      // Enviar confirmación al cliente
      try {
        await sendSimpleEmail(
          userEmail,
          `Solicitud Recibida - ${service.name}`,
          `
            <h2>¡Gracias por tu interés!</h2>
            <p>Hemos recibido tu solicitud para:</p>
            <p><strong>${service.name}</strong></p>
            <p>Nuestro equipo se pondrá en contacto contigo en las próximas 24-48 horas para darte más información.</p>
            <hr>
            <p>Si tienes dudas, responde a este correo o contacta a soporte.</p>
          `
        );
      } catch (emailError) {
        logger.warn('Error sending client confirmation:', emailError);
      }

      logger.log('Service requested:', { leadId: leadRef.id, serviceType, userId });

      return {
        success: true,
        leadId: leadRef.id,
        message: 'Solicitud enviada correctamente. Te contactaremos pronto.',
      };
    } catch (error) {
      logger.error('Error requesting service:', error);
      throw new HttpsError('internal', 'Error al enviar la solicitud');
    }
  }
);

/**
 * Entregar servicio (ADMIN ONLY)
 */
export const deliverService = onCall(
  { region: 'us-central1' },
  async (request) => {
    // Verificar autenticación
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    // Verificar rol de admin
    const userRole = request.auth.token.role;
    if (userRole !== 'admin') {
      logger.warn('Unauthorized admin access attempt:', {
        uid: request.auth.uid,
        email: request.auth.token.email,
        attemptedAction: 'deliverService',
      });

      // Registrar incidente de seguridad
      await db.collection('securityIncidents').add({
        type: 'UNAUTHORIZED_ADMIN_ACCESS',
        userId: request.auth.uid,
        userEmail: request.auth.token.email,
        attemptedAction: 'deliverService',
        timestamp: new Date().toISOString(),
      });

      throw new HttpsError('permission-denied', 'Acceso no autorizado');
    }

    const { tenantId, serviceType, fileUrl, leadId, notes } = request.data;

    // Validaciones
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'ID de tenant requerido');
    }

    if (!serviceType || !SERVICE_TYPES[serviceType]) {
      throw new HttpsError('invalid-argument', 'Tipo de servicio no válido');
    }

    if (!fileUrl) {
      throw new HttpsError('invalid-argument', 'URL del archivo requerida');
    }

    const service = SERVICE_TYPES[serviceType];

    try {
      // Verificar que el tenant existe
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) {
        throw new HttpsError('not-found', 'Tenant no encontrado');
      }

      const tenantData = tenantDoc.data();
      const tenantEmail = tenantData.email || tenantData.oficialCumplimiento?.email;

      // Actualizar estado del servicio en tenant
      await db.collection('tenants').doc(tenantId).update({
        [`compliance_status.${serviceType}`]: {
          status: 'COMPLETED',
          requestedAt: tenantData.compliance_status?.[serviceType]?.requestedAt || new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
          fileUrl: fileUrl,
          deliveredBy: request.auth.uid,
          notes: notes || '',
        },
        updatedAt: new Date().toISOString(),
      });

      // Guardar en compliance_vault
      await db.collection('tenants').doc(tenantId).collection('compliance_vault').add({
        type: serviceType,
        name: service.name,
        fileUrl: fileUrl,
        uploadedBy: 'admin',
        uploadedAt: new Date().toISOString(),
        notes: notes || '',
      });

      // Actualizar lead si existe
      if (leadId) {
        await db.collection('leads').doc(leadId).update({
          status: 'COMPLETED',
          deliveredAt: new Date().toISOString(),
          deliveredBy: request.auth.uid,
          fileUrl: fileUrl,
          updatedAt: new Date().toISOString(),
        });
      }

      // Notificar al cliente
      if (tenantEmail) {
        try {
          await sendSimpleEmail(
            tenantEmail,
            `Tu ${service.name} ya está disponible`,
            `
              <h2>¡Tu documento está listo!</h2>
              <p>Nos complace informarte que tu <strong>${service.name}</strong> ya está disponible.</p>
              <p>Puedes descargarlo desde tu panel de PLD BDU en la sección de Marketplace.</p>
              <p><a href="https://pldbdu.com/marketplace" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Ir al Marketplace</a></p>
              <hr>
              <p>Si tienes alguna duda sobre el contenido, no dudes en contactarnos.</p>
            `
          );
        } catch (emailError) {
          logger.warn('Error sending delivery notification:', emailError);
        }
      }

      // Registrar en audit log
      await db.collection('auditLog').add({
        action: 'SERVICE_DELIVERED',
        adminId: request.auth.uid,
        adminEmail: request.auth.token.email,
        tenantId: tenantId,
        serviceType: serviceType,
        fileUrl: fileUrl,
        timestamp: new Date().toISOString(),
      });

      logger.log('Service delivered:', { tenantId, serviceType });

      return {
        success: true,
        message: 'Servicio entregado correctamente',
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error delivering service:', error);
      throw new HttpsError('internal', 'Error al entregar el servicio');
    }
  }
);

/**
 * Obtener leads pendientes (ADMIN ONLY)
 */
export const getPendingLeads = onCall(
  { region: 'us-central1' },
  async (request) => {
    // Verificar autenticación y rol
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    if (request.auth.token.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Acceso no autorizado');
    }

    const { status = 'all', limit = 50 } = request.data || {};

    try {
      let query = db.collection('leads').orderBy('createdAt', 'desc');

      if (status !== 'all') {
        query = query.where('status', '==', status);
      }

      query = query.limit(limit);

      const snapshot = await query.get();

      const leads = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        leads,
      };
    } catch (error) {
      logger.error('Error getting leads:', error);
      throw new HttpsError('internal', 'Error al obtener leads');
    }
  }
);

/**
 * Actualizar estado de lead (ADMIN ONLY)
 */
export const updateLeadStatus = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth || request.auth.token.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Acceso no autorizado');
    }

    const { leadId, status, notes } = request.data;

    if (!leadId || !status) {
      throw new HttpsError('invalid-argument', 'ID y estado requeridos');
    }

    const validStatuses = ['PENDING', 'CONTACTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      throw new HttpsError('invalid-argument', 'Estado no válido');
    }

    try {
      await db.collection('leads').doc(leadId).update({
        status,
        notes: notes || '',
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.uid,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error updating lead:', error);
      throw new HttpsError('internal', 'Error al actualizar lead');
    }
  }
);

export default {
  getAvailableServices,
  requestService,
  deliverService,
  getPendingLeads,
  updateLeadStatus,
};
