/**
 * PLD BDU - Cloud Functions
 * Multi-Tenant AML Compliance SaaS
 * 
 * Entry point for all Cloud Functions.
 * Functions are organized by domain in separate modules.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

// ============================================================================
// EXPORT ALL FUNCTIONS BY DOMAIN
// ============================================================================

// Workspace Management Functions
const workspaceFunctions = require('./workspaces');
exports.createActivityWorkspace = workspaceFunctions.createActivityWorkspace;
exports.archiveWorkspace = workspaceFunctions.archiveWorkspace;

// User Management Functions  
const userFunctions = require('./users');
exports.setUserCustomClaims = userFunctions.setUserCustomClaims;
exports.onUserCreate = userFunctions.onUserCreate;
exports.updateUserWorkspaces = userFunctions.updateUserWorkspaces;
exports.createTenantUser = userFunctions.createTenantUser;
exports.assignWorkspaceAccess = userFunctions.assignWorkspaceAccess;
exports.impersonateTenant = userFunctions.impersonateTenant;
exports.endImpersonation = userFunctions.endImpersonation;


// Audit & Logging Functions
const auditFunctions = require('./audit');
exports.logUsageEvent = auditFunctions.logUsageEvent;

// Batch Processing Functions
const batchFunctions = require('./batch-processing');
exports.onFileUploaded = batchFunctions.onFileUploaded;
exports.processPartition = batchFunctions.processPartition;
exports.getJobStatus = batchFunctions.getJobStatus;
exports.cancelJob = batchFunctions.cancelJob;

// Risk Scoring Functions
const riskFunctions = require('./risk-scoring');
exports.onRecordWrite_calculateRisk = riskFunctions.onRecordWrite_calculateRisk;

// XML Generator Functions
const xmlFunctions = require('./xml-generator');
exports.generateXMLBatch = xmlFunctions.generateXMLBatch;

// Secure Downloads Functions
const downloadFunctions = require('./secure-downloads');
exports.getSecureDownloadUrl = downloadFunctions.getSecureDownloadUrl;
exports.verifyReportIntegrity = downloadFunctions.verifyReportIntegrity;
exports.listTenantReports = downloadFunctions.listTenantReports;
exports.deleteReport = downloadFunctions.deleteReport;

// XML Auditor Functions
const auditorFunctions = require('./xml-auditor');
exports.auditExternalXML = auditorFunctions.auditExternalXML;

// Subscription & Billing Functions
const subscriptionFunctions = require('./subscriptions');
exports.checkUsageLimits = subscriptionFunctions.checkUsageLimits;
exports.incrementUsage = subscriptionFunctions.incrementUsage;
exports.getSubscriptionStatus = subscriptionFunctions.getSubscriptionStatus;

// Telemetry & Usage Tracking Functions
const telemetryFunctions = require('./telemetry');
exports.onRecordCreated = telemetryFunctions.onRecordCreated;
exports.onRecordUpdated = telemetryFunctions.onRecordUpdated;
exports.onRecordDeleted = telemetryFunctions.onRecordDeleted;
exports.onXMLGenerated = telemetryFunctions.onXMLGenerated;
exports.onXMLDownloaded = telemetryFunctions.onXMLDownloaded;
exports.trackUserLogin = telemetryFunctions.trackUserLogin;
exports.monthlyUsageReset = telemetryFunctions.monthlyUsageReset;
exports.getUsageStatsForAdmin = telemetryFunctions.getUsageStatsForAdmin;

// Super Admin Functions
const adminFunctions = require('./admin-functions');
exports.getAdminDashboardData = adminFunctions.getAdminDashboardData;
exports.listTenantsForAdmin = adminFunctions.listTenantsForAdmin;
exports.suspendTenant = adminFunctions.suspendTenant;
exports.reactivateTenant = adminFunctions.reactivateTenant;
exports.updatePlan = adminFunctions.updatePlan;
exports.createTenant = adminFunctions.createTenant;

// Notification & Alert Functions
const notificationFunctions = require('./notifications');
exports.onTenantCreated_notify = notificationFunctions.onTenantCreated_notify;
exports.onQuotaWarning_notify = notificationFunctions.onQuotaWarning_notify;
exports.checkExpiredPlans = notificationFunctions.checkExpiredPlans;
exports.onXMLAudit_checkErrors = notificationFunctions.onXMLAudit_checkErrors;
exports.onBatchJobFailed = notificationFunctions.onBatchJobFailed;
exports.markNotificationRead = notificationFunctions.markNotificationRead;

// KYC Vault Functions
const kycFunctions = require('./kyc-vault');
exports.generateUploadUrl = kycFunctions.generateUploadUrl;
exports.confirmUpload = kycFunctions.confirmUpload;
exports.auditFileCompleteness = kycFunctions.auditFileCompleteness;
exports.getDocumentViewUrl = kycFunctions.getDocumentViewUrl;
exports.verifyDocument = kycFunctions.verifyDocument;

// Acuse Manager Functions
const acuseFunctions = require('./acuse-manager');
exports.getAcuseUploadUrl = acuseFunctions.getAcuseUploadUrl;
exports.linkAcuseToReport = acuseFunctions.linkAcuseToReport;
exports.verifyAcuseManually = acuseFunctions.verifyAcuseManually;
exports.getReportWithAcuse = acuseFunctions.getReportWithAcuse;
exports.listPendingSubmissions = acuseFunctions.listPendingSubmissions;

// Premium Services / Service Requests Functions
const serviceRequestFunctions = require('./service-requests');
exports.submitServiceRequest = serviceRequestFunctions.submitServiceRequest;
exports.getComplianceStatus = serviceRequestFunctions.getComplianceStatus;
exports.updateComplianceStatus = serviceRequestFunctions.updateComplianceStatus;

// Service Delivery Functions (Admin Upload & Activation)
const serviceDeliveryFunctions = require('./service-delivery');
exports.getDeliveryUploadUrl = serviceDeliveryFunctions.getDeliveryUploadUrl;
exports.deliverComplianceService = serviceDeliveryFunctions.deliverComplianceService;
exports.listPendingDeliveries = serviceDeliveryFunctions.listPendingDeliveries;
exports.getClientComplianceDashboard = serviceDeliveryFunctions.getClientComplianceDashboard;

// Billing Functions (future)
// const billingFunctions = require('./billing');
// exports.recordUsage = billingFunctions.recordUsage;

