/**
 * Admin API
 * Gestión de tenants y funciones administrativas
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';

const db = getFirestore();
const auth = getAuth();

/**
 * Verificar que el usuario es admin
 */
const verifyAdmin = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userRole = request.auth.token.role;
  if (userRole !== 'admin') {
    logger.warn('Unauthorized admin access attempt:', {
      uid: request.auth.uid,
      email: request.auth.token.email,
    });

    // Registrar incidente de seguridad
    await db.collection('securityIncidents').add({
      type: 'UNAUTHORIZED_ADMIN_ACCESS',
      userId: request.auth.uid,
      userEmail: request.auth.token.email,
      timestamp: new Date().toISOString(),
    });

    throw new HttpsError('permission-denied', 'Acceso no autorizado');
  }

  return true;
};

/**
 * Obtener todos los tenants (ADMIN ONLY)
 */
export const getAllTenants = onCall(
  { region: 'us-central1' },
  async (request) => {
    await verifyAdmin(request);

    const { page = 1, limit = 20, status = 'all', search = '' } = request.data || {};

    try {
      let query = db.collection('tenants').orderBy('createdAt', 'desc');

      // Filtro por status
      if (status !== 'all') {
        query = query.where('status', '==', status);
      }

      // Obtener todos y paginar manualmente (Firestore no soporta LIKE)
      const snapshot = await query.get();

      let tenants = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          razonSocial: data.razonSocial || 'Sin nombre',
          rfc: data.rfc || 'N/A',
          email: data.email || data.oficialCumplimiento?.email || 'N/A',
          plan: data.subscription?.planId || 'free',
          planName: data.subscription?.planName || 'Gratuito',
          status: data.status || 'ACTIVE',
          lastAccess: data.lastAccess || data.updatedAt || data.createdAt,
          createdAt: data.createdAt,
          giro: data.giro || 'N/A',
          totalOperations: data.stats?.totalOperations || 0,
          pendingAlerts: data.stats?.pendingAlerts || 0,
        };
      });

      // Filtrar por búsqueda
      if (search) {
        const searchLower = search.toLowerCase();
        tenants = tenants.filter(
          (t) =>
            t.razonSocial.toLowerCase().includes(searchLower) ||
            t.rfc.toLowerCase().includes(searchLower) ||
            t.email.toLowerCase().includes(searchLower)
        );
      }

      // Paginación
      const total = tenants.length;
      const startIndex = (page - 1) * limit;
      const paginatedTenants = tenants.slice(startIndex, startIndex + limit);

      return {
        success: true,
        tenants: paginatedTenants,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error getting tenants:', error);
      throw new HttpsError('internal', 'Error al obtener tenants');
    }
  }
);

/**
 * Obtener detalle de un tenant (ADMIN ONLY)
 */
export const getTenantDetail = onCall(
  { region: 'us-central1' },
  async (request) => {
    await verifyAdmin(request);

    const { tenantId } = request.data;

    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'ID de tenant requerido');
    }

    try {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();

      if (!tenantDoc.exists) {
        throw new HttpsError('not-found', 'Tenant no encontrado');
      }

      const data = tenantDoc.data();

      // Obtener estadísticas adicionales
      const operationsSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('operations')
        .count()
        .get();

      const alertsSnapshot = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('alerts')
        .where('status', '==', 'PENDING')
        .count()
        .get();

      // Obtener leads del tenant
      const leadsSnapshot = await db
        .collection('leads')
        .where('tenantId', '==', tenantId)
        .get();

      const leads = leadsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        tenant: {
          id: tenantDoc.id,
          ...data,
          stats: {
            totalOperations: operationsSnapshot.data().count,
            pendingAlerts: alertsSnapshot.data().count,
          },
          leads,
        },
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error getting tenant detail:', error);
      throw new HttpsError('internal', 'Error al obtener detalle del tenant');
    }
  }
);

/**
 * Cambiar estado de tenant (ADMIN ONLY)
 */
export const toggleTenantStatus = onCall(
  { region: 'us-central1' },
  async (request) => {
    await verifyAdmin(request);

    const { tenantId, action, reason } = request.data;

    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'ID de tenant requerido');
    }

    if (!action || !['SUSPEND', 'ACTIVATE'].includes(action)) {
      throw new HttpsError('invalid-argument', 'Acción no válida. Usar SUSPEND o ACTIVATE');
    }

    try {
      // Verificar que el tenant existe
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) {
        throw new HttpsError('not-found', 'Tenant no encontrado');
      }

      const tenantData = tenantDoc.data();
      const newStatus = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';

      // Actualizar en Firestore
      await db.collection('tenants').doc(tenantId).update({
        status: newStatus,
        statusChangedAt: new Date().toISOString(),
        statusChangedBy: request.auth.uid,
        statusChangeReason: reason || '',
        updatedAt: new Date().toISOString(),
      });

      // Habilitar/deshabilitar usuario en Auth
      try {
        await auth.updateUser(tenantId, {
          disabled: action === 'SUSPEND',
        });
      } catch (authError) {
        logger.warn('Error updating auth user:', authError);
        // Continuar aunque falle la actualización de Auth
      }

      // Registrar en audit log
      await db.collection('auditLog').add({
        action: action === 'SUSPEND' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED',
        adminId: request.auth.uid,
        adminEmail: request.auth.token.email,
        tenantId: tenantId,
        tenantEmail: tenantData.email,
        reason: reason || '',
        timestamp: new Date().toISOString(),
      });

      logger.log('Tenant status changed:', { tenantId, action, by: request.auth.uid });

      return {
        success: true,
        message: action === 'SUSPEND' ? 'Tenant suspendido correctamente' : 'Tenant activado correctamente',
        newStatus,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error toggling tenant status:', error);
      throw new HttpsError('internal', 'Error al cambiar estado del tenant');
    }
  }
);

/**
 * Obtener estadísticas globales (ADMIN ONLY)
 */
export const getAdminStats = onCall(
  { region: 'us-central1' },
  async (request) => {
    await verifyAdmin(request);

    try {
      // Contar tenants
      const tenantsSnapshot = await db.collection('tenants').get();
      const tenants = tenantsSnapshot.docs.map((doc) => doc.data());

      const totalTenants = tenants.length;
      const activeTenants = tenants.filter((t) => t.status !== 'SUSPENDED').length;
      const suspendedTenants = tenants.filter((t) => t.status === 'SUSPENDED').length;

      // Tenants por plan
      const tenantsByPlan = tenants.reduce((acc, t) => {
        const plan = t.subscription?.planId || 'free';
        acc[plan] = (acc[plan] || 0) + 1;
        return acc;
      }, {});

      // Contar leads
      const leadsSnapshot = await db.collection('leads').get();
      const leads = leadsSnapshot.docs.map((doc) => doc.data());

      const totalLeads = leads.length;
      const pendingLeads = leads.filter((l) => l.status === 'PENDING').length;
      const completedLeads = leads.filter((l) => l.status === 'COMPLETED').length;

      // Revenue estimado
      const completedLeadsWithPrice = leads.filter((l) => l.status === 'COMPLETED' && l.servicePrice);
      const estimatedRevenue = completedLeadsWithPrice.reduce((acc, l) => acc + (l.servicePrice || 0), 0);

      // Nuevos tenants este mes
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newTenantsThisMonth = tenants.filter(
        (t) => t.createdAt && new Date(t.createdAt) >= startOfMonth
      ).length;

      // Tenants por giro
      const tenantsByGiro = tenants.reduce((acc, t) => {
        const giro = t.giro || 'No especificado';
        acc[giro] = (acc[giro] || 0) + 1;
        return acc;
      }, {});

      return {
        success: true,
        stats: {
          tenants: {
            total: totalTenants,
            active: activeTenants,
            suspended: suspendedTenants,
            newThisMonth: newTenantsThisMonth,
            byPlan: tenantsByPlan,
            byGiro: tenantsByGiro,
          },
          leads: {
            total: totalLeads,
            pending: pendingLeads,
            completed: completedLeads,
            inProgress: leads.filter((l) => l.status === 'IN_PROGRESS').length,
          },
          revenue: {
            estimated: estimatedRevenue,
            currency: 'MXN',
          },
        },
      };
    } catch (error) {
      logger.error('Error getting admin stats:', error);
      throw new HttpsError('internal', 'Error al obtener estadísticas');
    }
  }
);

/**
 * Obtener audit log (ADMIN ONLY)
 */
export const getAuditLog = onCall(
  { region: 'us-central1' },
  async (request) => {
    await verifyAdmin(request);

    const { limit = 50, action = 'all' } = request.data || {};

    try {
      let query = db.collection('auditLog').orderBy('timestamp', 'desc');

      if (action !== 'all') {
        query = query.where('action', '==', action);
      }

      query = query.limit(limit);

      const snapshot = await query.get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        success: true,
        logs,
      };
    } catch (error) {
      logger.error('Error getting audit log:', error);
      throw new HttpsError('internal', 'Error al obtener audit log');
    }
  }
);

export default {
  getAllTenants,
  getTenantDetail,
  toggleTenantStatus,
  getAdminStats,
  getAuditLog,
};
