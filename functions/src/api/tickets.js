/**
 * Tickets API
 * Sistema de soporte técnico interno
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { sendTicketCreatedNotifications } from '../services/email.js';

const db = getFirestore();

// Categorías de tickets
const TICKET_CATEGORIES = {
  TECHNICAL: 'Técnico',
  LEGAL: 'Legal/Cumplimiento',
  BILLING: 'Facturación',
  GENERAL: 'General',
};

// Estados de tickets
const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING_USER: 'waiting_user',
  CLOSED: 'closed',
};

/**
 * Crear nuevo ticket
 */
export const createTicket = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { subject, category, message } = request.data;
    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    // Validaciones
    if (!subject || subject.trim().length < 5) {
      throw new HttpsError('invalid-argument', 'El asunto debe tener al menos 5 caracteres');
    }

    if (!category || !Object.keys(TICKET_CATEGORIES).includes(category)) {
      throw new HttpsError('invalid-argument', 'Categoría no válida');
    }

    if (!message || message.trim().length < 10) {
      throw new HttpsError('invalid-argument', 'El mensaje debe tener al menos 10 caracteres');
    }

    try {
      // Generar número de ticket
      const ticketNumber = await generateTicketNumber();

      // Crear ticket
      const ticketRef = await db.collection('tickets').add({
        ticketNumber: ticketNumber,
        userId: userId,
        userEmail: userEmail,
        subject: subject.trim(),
        category: category,
        categoryLabel: TICKET_CATEGORIES[category],
        message: message.trim(),
        status: TICKET_STATUS.OPEN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'msg_1',
            sender: 'user',
            senderEmail: userEmail,
            content: message.trim(),
            timestamp: new Date().toISOString(),
          },
        ],
      });

      logger.log('Ticket created:', ticketRef.id);

      return {
        success: true,
        ticketId: ticketRef.id,
        ticketNumber: ticketNumber,
      };
    } catch (error) {
      logger.error('Error creating ticket:', error);
      throw new HttpsError('internal', 'Error al crear el ticket');
    }
  }
);

/**
 * Obtener tickets del usuario
 */
export const getMyTickets = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const userId = request.auth.uid;
    const { status, limit = 20 } = request.data || {};

    try {
      let query = db.collection('tickets').where('userId', '==', userId);

      if (status && Object.values(TICKET_STATUS).includes(status)) {
        query = query.where('status', '==', status);
      }

      query = query.orderBy('createdAt', 'desc').limit(limit);

      const snapshot = await query.get();

      const tickets = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        // Excluir mensajes del listado para reducir payload
        messages: undefined,
        messageCount: doc.data().messages?.length || 0,
      }));

      return {
        success: true,
        tickets: tickets,
      };
    } catch (error) {
      logger.error('Error getting tickets:', error);
      throw new HttpsError('internal', 'Error al obtener los tickets');
    }
  }
);

/**
 * Obtener detalle de un ticket
 */
export const getTicketDetail = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { ticketId } = request.data;
    const userId = request.auth.uid;

    if (!ticketId) {
      throw new HttpsError('invalid-argument', 'ID de ticket requerido');
    }

    try {
      const ticketDoc = await db.collection('tickets').doc(ticketId).get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket no encontrado');
      }

      const ticket = ticketDoc.data();

      // Verificar que el usuario sea dueño del ticket
      if (ticket.userId !== userId) {
        throw new HttpsError('permission-denied', 'No tienes acceso a este ticket');
      }

      return {
        success: true,
        ticket: {
          id: ticketDoc.id,
          ...ticket,
        },
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error getting ticket detail:', error);
      throw new HttpsError('internal', 'Error al obtener el ticket');
    }
  }
);

/**
 * Agregar mensaje a ticket existente
 */
export const addTicketMessage = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { ticketId, message } = request.data;
    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    if (!ticketId || !message || message.trim().length < 1) {
      throw new HttpsError('invalid-argument', 'Mensaje requerido');
    }

    try {
      const ticketRef = db.collection('tickets').doc(ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket no encontrado');
      }

      const ticket = ticketDoc.data();

      // Verificar que el usuario sea dueño del ticket
      if (ticket.userId !== userId) {
        throw new HttpsError('permission-denied', 'No tienes acceso a este ticket');
      }

      // No permitir mensajes en tickets cerrados
      if (ticket.status === TICKET_STATUS.CLOSED) {
        throw new HttpsError('failed-precondition', 'No se pueden agregar mensajes a tickets cerrados');
      }

      // Agregar mensaje
      const newMessage = {
        id: `msg_${Date.now()}`,
        sender: 'user',
        senderEmail: userEmail,
        content: message.trim(),
        timestamp: new Date().toISOString(),
      };

      await ticketRef.update({
        messages: FieldValue.arrayUnion(newMessage),
        status: TICKET_STATUS.OPEN, // Reabrir si estaba esperando respuesta
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        message: newMessage,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error adding message:', error);
      throw new HttpsError('internal', 'Error al agregar mensaje');
    }
  }
);

/**
 * Cerrar ticket (por el usuario)
 */
export const closeTicket = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const { ticketId } = request.data;
    const userId = request.auth.uid;

    if (!ticketId) {
      throw new HttpsError('invalid-argument', 'ID de ticket requerido');
    }

    try {
      const ticketRef = db.collection('tickets').doc(ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket no encontrado');
      }

      if (ticketDoc.data().userId !== userId) {
        throw new HttpsError('permission-denied', 'No tienes acceso a este ticket');
      }

      await ticketRef.update({
        status: TICKET_STATUS.CLOSED,
        closedAt: new Date().toISOString(),
        closedBy: 'user',
        updatedAt: new Date().toISOString(),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error closing ticket:', error);
      throw new HttpsError('internal', 'Error al cerrar el ticket');
    }
  }
);

/**
 * Trigger: Enviar notificaciones cuando se crea un ticket
 */
export const onTicketCreated = onDocumentCreated(
  {
    document: 'tickets/{ticketId}',
    region: 'us-central1',
  },
  async (event) => {
    const ticket = event.data?.data();
    const ticketId = event.params.ticketId;

    if (!ticket) {
      logger.warn('No ticket data in onCreate event');
      return;
    }

    try {
      // Enviar notificaciones por email
      await sendTicketCreatedNotifications(
        {
          id: ticketId,
          ...ticket,
        },
        ticket.userEmail
      );

      logger.log('Ticket notifications sent:', ticketId);
    } catch (error) {
      logger.error('Error sending ticket notifications:', error);
      // No lanzar error para no bloquear la creación
    }
  }
);

/**
 * Generar número de ticket único
 */
async function generateTicketNumber() {
  const counterRef = db.collection('counters').doc('tickets');

  const result = await db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let nextNumber = 1;
    if (counterDoc.exists) {
      nextNumber = (counterDoc.data().current || 0) + 1;
    }

    transaction.set(counterRef, { current: nextNumber }, { merge: true });

    return nextNumber;
  });

  // Formato: TKT-2024-00001
  const year = new Date().getFullYear();
  const paddedNumber = String(result).padStart(5, '0');

  return `TKT-${year}-${paddedNumber}`;
}

export default {
  createTicket,
  getMyTickets,
  getTicketDetail,
  addTicketMessage,
  closeTicket,
  onTicketCreated,
};
