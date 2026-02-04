/**
 * PLD BDU - Cloud Functions
 * Backend serverless para la plataforma de cumplimiento PLD
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin
initializeApp();

// Export Firestore and Storage for use in other modules
export const db = getFirestore();
export const storage = getStorage();

// Import and re-export triggers
export { onAcknowledgmentUpload } from './triggers/onAcknowledgmentUpload.js';

// Import and re-export webhooks
export { onOpenpayWebhook } from './triggers/webhooks.js';

// Import and re-export callable functions
export { linkAcknowledgment } from './callable/linkAcknowledgment.js';
export { getClientDocuments } from './callable/getClientDocuments.js';

// Import and re-export billing API functions
export {
  getPlans,
  subscribeTenant,
  cancelTenantSubscription,
  getPaymentHistory,
  getBillingStatus,
} from './api/billing.js';

// Import and re-export AI/Chatbot functions
export {
  chatWithGemini,
  getChatSuggestions,
} from './api/ai.js';

// Import and re-export Ticket functions
export {
  createTicket,
  getMyTickets,
  getTicketDetail,
  addTicketMessage,
  closeTicket,
  onTicketCreated,
} from './api/tickets.js';

// Import and re-export Stats triggers and functions
export {
  onOperationWrite,
  getDashboardStats,
} from './triggers/stats.js';

// Import and re-export Services/Marketplace functions
export {
  getAvailableServices,
  requestService,
  deliverService,
  getPendingLeads,
  updateLeadStatus,
} from './api/services.js';

// Import and re-export Admin functions
export {
  getAllTenants,
  getTenantDetail,
  toggleTenantStatus,
  getAdminStats,
  getAuditLog,
} from './api/admin.js';

// Import and re-export Screening functions
export {
  checkBlacklists,
  screenClientManual,
  getScreeningResults,
  reviewScreeningResult,
  scheduledBatchScreening,
  runBatchScreening,
} from './api/screening.js';

// Import and re-export LMS functions
export {
  getAvailableCourses,
  getCourseDetail,
  completeModule,
  submitExam,
  getMyCertificates,
} from './api/lms.js';

// Import and re-export Audit functions
export {
  getTenantAuditLog,
  getGlobalAuditLog,
  onOperationCreated as onOperationAudit,
  onVaultDocumentCreated,
  getAuditActions,
} from './triggers/audit.js';

// Import and re-export Ingest functions
export {
  getTemplate,
  processUpload,
} from './api/ingest.js';

