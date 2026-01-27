/**
 * PLD BDU - User Management Cloud Functions
 * 
 * Functions for managing user authentication, Custom Claims, and permissions.
 * Custom Claims are used by Firestore Security Rules for authorization.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

// ============================================================================
// ERROR MESSAGES (Spanish - Mexico)
// ============================================================================
const ERRORS = {
    NOT_AUTHENTICATED: 'Error: Debes iniciar sesión para realizar esta acción.',
    NOT_AUTHORIZED: 'Error: No tienes permisos para gestionar usuarios.',
    MISSING_PARAMS: 'Error: Faltan parámetros requeridos.',
    USER_NOT_FOUND: 'Error: Usuario no encontrado.',
    INVALID_ROLE: 'Error: El rol especificado no es válido.',
    INTERNAL_ERROR: 'Error: Ocurrió un error interno. Por favor intenta de nuevo.',
};

const SUCCESS = {
    CLAIMS_SET: 'Éxito: Permisos de usuario actualizados correctamente.',
    WORKSPACES_UPDATED: 'Éxito: Espacios de trabajo asignados correctamente.',
};

// ============================================================================
// VALID ROLES
// ============================================================================
const VALID_ROLES = [
    'SUPER_ADMIN',      // Platform owner - full access
    'COMPANY_ADMIN',    // Tenant owner - manages their company
    'COMPLIANCE_OFFICER', // Reviews and approves records
    'DATA_ENTRY',       // Creates records only
    'VIEWER',           // Read-only access
];

// ============================================================================
// FUNCTION: setUserCustomClaims
// ============================================================================

/**
 * Sets Custom Claims on a Firebase Auth user.
 * 
 * Custom Claims structure:
 * {
 *   tenantId: string,     // The user's company/tenant ID
 *   role: string,         // SUPER_ADMIN | COMPANY_ADMIN | COMPLIANCE_OFFICER | DATA_ENTRY | VIEWER
 *   workspaces: string[], // Array of workspace IDs the user can access
 * }
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.targetUserId - The UID of the user to update
 * @param {string} data.tenantId - The tenant ID to assign
 * @param {string} data.role - The role to assign
 * @param {string[]} data.workspaces - Array of workspace IDs
 */
exports.setUserCustomClaims = functions.https.onCall(async (data, context) => {
    // -------------------------------------------------------------------------
    // STEP 1: Validate Caller Permissions
    // -------------------------------------------------------------------------
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const callerRole = context.auth.token.role;
    const callerTenantId = context.auth.token.tenantId;

    // Only SUPER_ADMIN or COMPANY_ADMIN can set claims
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'COMPANY_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    // -------------------------------------------------------------------------
    // STEP 2: Validate Input Parameters
    // -------------------------------------------------------------------------
    const { targetUserId, tenantId, role, workspaces = [] } = data;

    if (!targetUserId || !tenantId || !role) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.MISSING_PARAMS);
    }

    if (!VALID_ROLES.includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.INVALID_ROLE);
    }

    // -------------------------------------------------------------------------
    // STEP 3: Additional Authorization Checks
    // -------------------------------------------------------------------------
    // COMPANY_ADMIN can only manage users in their own tenant
    if (callerRole === 'COMPANY_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    // Only SUPER_ADMIN can create other SUPER_ADMINs
    if (role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    // COMPANY_ADMIN cannot escalate to COMPANY_ADMIN without being SUPER_ADMIN
    if (role === 'COMPANY_ADMIN' && callerRole === 'COMPANY_ADMIN') {
        // Can only assign COMPANY_ADMIN to themselves (already are)
        if (targetUserId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied',
                'Error: Solo un Super Admin puede asignar administradores de empresa.');
        }
    }

    console.log(`[setUserCustomClaims] Configurando claims para usuario: ${targetUserId}`);
    console.log(`  - Tenant: ${tenantId}`);
    console.log(`  - Rol: ${role}`);
    console.log(`  - Workspaces: ${workspaces.length}`);

    // -------------------------------------------------------------------------
    // STEP 4: Set Custom Claims on Firebase Auth
    // -------------------------------------------------------------------------
    try {
        const customClaims = {
            tenantId,
            role,
            workspaces,
        };

        await admin.auth().setCustomUserClaims(targetUserId, customClaims);
        console.log(`[setUserCustomClaims] Custom Claims establecidos en Firebase Auth`);

        // -------------------------------------------------------------------------
        // STEP 5: Update User Document in Firestore
        // -------------------------------------------------------------------------
        const userRef = db.collection('users').doc(targetUserId);

        await userRef.set({
            tenant_id: tenantId,
            role,
            assigned_workspaces: workspaces,
            claims_updated_at: admin.firestore.FieldValue.serverTimestamp(),
            claims_updated_by: context.auth.uid,
        }, { merge: true });

        console.log(`[setUserCustomClaims] Documento de usuario actualizado en Firestore`);

        // -------------------------------------------------------------------------
        // STEP 6: Log the Action
        // -------------------------------------------------------------------------
        await db.collection('usage_logs').add({
            event_type: 'USER_CLAIMS_UPDATED',
            tenant_id: tenantId,
            target_user_id: targetUserId,
            performed_by: context.auth.uid,
            new_role: role,
            new_workspaces: workspaces,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[setUserCustomClaims] ✅ ${SUCCESS.CLAIMS_SET}`);

        return {
            success: true,
            message: SUCCESS.CLAIMS_SET,
            claims: customClaims,
        };

    } catch (error) {
        console.error(`[setUserCustomClaims] Error:`, error);
        throw new functions.https.HttpsError('internal', ERRORS.INTERNAL_ERROR);
    }
});

// ============================================================================
// FUNCTION: onUserCreate (Trigger)
// ============================================================================

/**
 * Triggered when a new Firebase Auth user is created.
 * Initializes default claims and creates user document.
 */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    console.log(`[onUserCreate] Nuevo usuario creado: ${user.uid}`);
    console.log(`  - Email: ${user.email}`);

    try {
        // -------------------------------------------------------------------------
        // Check if user was created via pending invite
        // -------------------------------------------------------------------------
        const inviteQuery = await db
            .collection('pending_invites')
            .where('email', '==', user.email)
            .where('used', '==', false)
            .limit(1)
            .get();

        if (!inviteQuery.empty) {
            // User was invited - apply invite settings
            const invite = inviteQuery.docs[0].data();

            console.log(`[onUserCreate] Invitación encontrada para ${user.email}`);
            console.log(`  - Tenant: ${invite.tenant_id}`);
            console.log(`  - Rol: ${invite.role}`);

            // Set claims from invite
            const claims = {
                tenantId: invite.tenant_id,
                role: invite.role || 'DATA_ENTRY',
                workspaces: invite.workspaces || [],
            };

            await admin.auth().setCustomUserClaims(user.uid, claims);

            // Create user document
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                display_name: user.displayName || user.email.split('@')[0],
                tenant_id: invite.tenant_id,
                role: invite.role || 'DATA_ENTRY',
                assigned_workspaces: invite.workspaces || [],
                status: 'active',
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                invited_by: invite.invited_by,
                permissions: getDefaultPermissions(invite.role || 'DATA_ENTRY'),
            });

            // Mark invite as used
            await inviteQuery.docs[0].ref.update({
                used: true,
                used_at: admin.firestore.FieldValue.serverTimestamp(),
                used_by_uid: user.uid,
            });

            console.log(`[onUserCreate] ✅ Usuario configurado desde invitación`);

        } else {
            // No invite found - this is likely a direct signup or SUPER_ADMIN creation
            // Set minimal claims (will be updated by admin later)
            console.log(`[onUserCreate] Sin invitación - configurando claims mínimos`);

            const defaultClaims = {
                tenantId: null,
                role: 'VIEWER',
                workspaces: [],
            };

            await admin.auth().setCustomUserClaims(user.uid, defaultClaims);

            // Create basic user document
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                display_name: user.displayName || user.email.split('@')[0],
                tenant_id: null,
                role: 'VIEWER',
                assigned_workspaces: [],
                status: 'pending_assignment',
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                permissions: getDefaultPermissions('VIEWER'),
            });

            console.log(`[onUserCreate] ⚠️ Usuario creado sin tenant asignado`);
        }

    } catch (error) {
        console.error(`[onUserCreate] Error:`, error);
        // Don't throw - user is already created, just log the error
    }
});

// ============================================================================
// FUNCTION: updateUserWorkspaces
// ============================================================================

/**
 * Updates the workspace assignments for a user.
 * This is a convenience function for COMPANY_ADMINs to manage team access.
 */
exports.updateUserWorkspaces = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const { targetUserId, workspaces } = data;

    if (!targetUserId || !Array.isArray(workspaces)) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.MISSING_PARAMS);
    }

    // Get caller's claims
    const callerRole = context.auth.token.role;
    const callerTenantId = context.auth.token.tenantId;

    // Only admins can update workspaces
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'COMPANY_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    // Get target user
    const userDoc = await db.collection('users').doc(targetUserId).get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', ERRORS.USER_NOT_FOUND);
    }

    const userData = userDoc.data();

    // COMPANY_ADMIN can only update users in their tenant
    if (callerRole === 'COMPANY_ADMIN' && userData.tenant_id !== callerTenantId) {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    console.log(`[updateUserWorkspaces] Actualizando workspaces para: ${targetUserId}`);
    console.log(`  - Nuevos workspaces: ${workspaces.join(', ')}`);

    try {
        // Update Custom Claims
        await admin.auth().setCustomUserClaims(targetUserId, {
            tenantId: userData.tenant_id,
            role: userData.role,
            workspaces,
        });

        // Update Firestore document
        await db.collection('users').doc(targetUserId).update({
            assigned_workspaces: workspaces,
            claims_updated_at: admin.firestore.FieldValue.serverTimestamp(),
            claims_updated_by: context.auth.uid,
        });

        console.log(`[updateUserWorkspaces] ✅ ${SUCCESS.WORKSPACES_UPDATED}`);

        return {
            success: true,
            message: SUCCESS.WORKSPACES_UPDATED,
            workspaces,
        };

    } catch (error) {
        console.error(`[updateUserWorkspaces] Error:`, error);
        throw new functions.https.HttpsError('internal', ERRORS.INTERNAL_ERROR);
    }
});

// ============================================================================
// HELPER: getDefaultPermissions
// ============================================================================

/**
 * Returns default permissions based on role.
 */
function getDefaultPermissions(role) {
    const permissions = {
        SUPER_ADMIN: {
            can_create_records: true,
            can_approve_records: true,
            can_generate_xml: true,
            can_manage_users: true,
            can_view_billing: true,
            can_configure_workspaces: true,
            can_view_all_tenants: true,
        },
        COMPANY_ADMIN: {
            can_create_records: true,
            can_approve_records: true,
            can_generate_xml: true,
            can_manage_users: true,
            can_view_billing: true,
            can_configure_workspaces: true,
            can_view_all_tenants: false,
        },
        COMPLIANCE_OFFICER: {
            can_create_records: true,
            can_approve_records: true,
            can_generate_xml: true,
            can_manage_users: false,
            can_view_billing: false,
            can_configure_workspaces: false,
            can_view_all_tenants: false,
        },
        DATA_ENTRY: {
            can_create_records: true,
            can_approve_records: false,
            can_generate_xml: false,
            can_manage_users: false,
            can_view_billing: false,
            can_configure_workspaces: false,
            can_view_all_tenants: false,
        },
        VIEWER: {
            can_create_records: false,
            can_approve_records: false,
            can_generate_xml: false,
            can_manage_users: false,
            can_view_billing: false,
            can_configure_workspaces: false,
            can_view_all_tenants: false,
        },
    };

    return permissions[role] || permissions.VIEWER;
}

// ============================================================================
// FUNCTION A: createTenantUser
// Creates a new user within a tenant (employee creation)
// ============================================================================

/**
 * Creates a new user for a specific tenant.
 * Only COMPANY_ADMIN of the tenant or SUPER_ADMIN can create users.
 * 
 * SECURITY PROTECTIONS:
 * 1. Caller must be authenticated
 * 2. Caller must be COMPANY_ADMIN of the same tenant OR SUPER_ADMIN
 * 3. Cannot create SUPER_ADMIN users (only SUPER_ADMIN can do that)
 * 4. Cannot create COMPANY_ADMIN users (prevents privilege escalation)
 * 5. User limits are enforced based on subscription plan
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.email - Email for the new user
 * @param {string} data.password - Temporary password (user should reset)
 * @param {string} data.role - Role to assign (COMPLIANCE_OFFICER, DATA_ENTRY, VIEWER)
 * @param {string} data.tenantId - Tenant to add the user to
 * @param {string} data.displayName - Display name for the user
 * @param {string[]} data.workspaces - Array of workspace IDs to assign
 * @param {Object} data.profile - Optional profile data (phone, job_title, department)
 */
exports.createTenantUser = functions.https.onCall(async (data, context) => {
    // -------------------------------------------------------------------------
    // STEP 1: Validate Authentication
    // -------------------------------------------------------------------------
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const callerRole = context.auth.token.role;
    const callerTenantId = context.auth.token.tenantId;
    const callerUid = context.auth.uid;

    console.log(`[createTenantUser] Iniciando creación de usuario`);
    console.log(`  - Solicitante: ${callerUid} (${callerRole})`);

    // -------------------------------------------------------------------------
    // STEP 2: Validate Input Parameters
    // -------------------------------------------------------------------------
    const {
        email,
        password,
        role,
        tenantId,
        displayName,
        workspaces = [],
        profile = {}
    } = data;

    if (!email || !password || !role || !tenantId) {
        throw new functions.https.HttpsError('invalid-argument',
            'Error: Faltan parámetros requeridos (email, password, role, tenantId).');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new functions.https.HttpsError('invalid-argument',
            'Error: El formato del correo electrónico no es válido.');
    }

    // Validate password strength
    if (password.length < 8) {
        throw new functions.https.HttpsError('invalid-argument',
            'Error: La contraseña debe tener al menos 8 caracteres.');
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.INVALID_ROLE);
    }

    // -------------------------------------------------------------------------
    // STEP 3: Authorization Checks (CRITICAL SECURITY)
    // -------------------------------------------------------------------------

    // Check 1: Caller must be SUPER_ADMIN or COMPANY_ADMIN
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'COMPANY_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    // Check 2: COMPANY_ADMIN can only create users in their own tenant
    if (callerRole === 'COMPANY_ADMIN' && callerTenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied',
            'Error: No puedes crear usuarios en otras empresas.');
    }

    // Check 3: PREVENT PRIVILEGE ESCALATION
    // Only SUPER_ADMIN can create SUPER_ADMIN or COMPANY_ADMIN users
    if (role === 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied',
            'Error: No se pueden crear usuarios Super Admin por esta vía.');
    }

    if (role === 'COMPANY_ADMIN' && callerRole !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied',
            'Error: Solo un Super Admin puede crear administradores de empresa.');
    }

    console.log(`  - Tenant destino: ${tenantId}`);
    console.log(`  - Rol a asignar: ${role}`);

    // -------------------------------------------------------------------------
    // STEP 4: Validate Tenant Exists and Check User Limits
    // -------------------------------------------------------------------------
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found',
            'Error: La empresa especificada no existe.');
    }

    const tenantData = tenantDoc.data();
    const plan = tenantData.subscription_plan || 'starter';

    // Plan limits
    const PLAN_LIMITS = {
        'starter': { maxUsers: 3 },
        'professional': { maxUsers: 10 },
        'enterprise': { maxUsers: 50 },
        'unlimited': { maxUsers: Infinity },
    };

    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

    // Count existing users in tenant
    const usersSnapshot = await db.collection('users')
        .where('tenant_id', '==', tenantId)
        .where('status', '==', 'active')
        .get();

    if (usersSnapshot.size >= planLimits.maxUsers) {
        throw new functions.https.HttpsError('resource-exhausted',
            `Error: Tu plan "${plan}" permite máximo ${planLimits.maxUsers} usuarios. Contacta a soporte para actualizar tu suscripción.`);
    }

    console.log(`  - Usuarios actuales: ${usersSnapshot.size}/${planLimits.maxUsers}`);

    // -------------------------------------------------------------------------
    // STEP 5: Validate Workspaces Belong to Tenant
    // -------------------------------------------------------------------------
    if (workspaces.length > 0) {
        for (const wsId of workspaces) {
            const wsDoc = await db
                .collection('tenants')
                .doc(tenantId)
                .collection('workspaces')
                .doc(wsId)
                .get();

            if (!wsDoc.exists) {
                throw new functions.https.HttpsError('invalid-argument',
                    `Error: El espacio de trabajo "${wsId}" no existe en esta empresa.`);
            }
        }
    }

    // -------------------------------------------------------------------------
    // STEP 6: Create User in Firebase Authentication
    // -------------------------------------------------------------------------
    let newUser;
    try {
        newUser = await admin.auth().createUser({
            email,
            password,
            displayName: displayName || email.split('@')[0],
            emailVerified: false,
        });
        console.log(`  - Usuario creado en Auth: ${newUser.uid}`);
    } catch (authError) {
        console.error('[createTenantUser] Error creando usuario:', authError);

        if (authError.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists',
                'Error: Ya existe un usuario con este correo electrónico.');
        }
        throw new functions.https.HttpsError('internal',
            'Error: No se pudo crear el usuario. ' + authError.message);
    }

    // -------------------------------------------------------------------------
    // STEP 7: Set Custom Claims on the New User
    // -------------------------------------------------------------------------
    const customClaims = {
        tenantId,
        role,
        workspaces,
    };

    await admin.auth().setCustomUserClaims(newUser.uid, customClaims);
    console.log(`  - Custom Claims establecidos`);

    // -------------------------------------------------------------------------
    // STEP 8: Create User Profile Document in Firestore
    // -------------------------------------------------------------------------
    const now = admin.firestore.FieldValue.serverTimestamp();

    const userProfile = {
        email,
        display_name: displayName || email.split('@')[0],
        tenant_id: tenantId,
        role,
        assigned_workspaces: workspaces,
        status: 'active',
        created_at: now,
        created_by: callerUid,
        permissions: getDefaultPermissions(role),

        // Profile metadata
        phone: profile.phone || null,
        job_title: profile.job_title || null,
        department: profile.department || null,
        avatar_url: null,

        // Security tracking
        last_login: null,
        password_changed_at: null,
        must_change_password: true, // Force password change on first login
    };

    await db.collection('users').doc(newUser.uid).set(userProfile);
    console.log(`  - Perfil creado en Firestore`);

    // -------------------------------------------------------------------------
    // STEP 9: Log the Action (Audit Trail)
    // -------------------------------------------------------------------------
    await db.collection('usage_logs').add({
        event_type: 'USER_CREATED',
        tenant_id: tenantId,
        target_user_id: newUser.uid,
        target_email: email,
        target_role: role,
        performed_by: callerUid,
        timestamp: now,
        metadata: {
            workspaces_assigned: workspaces,
            subscription_plan: plan,
            user_count_after: usersSnapshot.size + 1,
        },
    });

    console.log(`[createTenantUser] ✅ Éxito: Usuario creado`);

    // -------------------------------------------------------------------------
    // STEP 10: Return Success Response
    // -------------------------------------------------------------------------
    return {
        success: true,
        message: 'Éxito: Usuario creado correctamente.',
        user: {
            uid: newUser.uid,
            email,
            displayName: displayName || email.split('@')[0],
            role,
            workspaces,
            mustChangePassword: true,
        },
    };
});

// ============================================================================
// FUNCTION B: assignWorkspaceAccess
// Manages which workspaces a user can access
// ============================================================================

/**
 * Assigns or updates workspace access for a user.
 * Updates both Custom Claims and Firestore document.
 * 
 * SECURITY PROTECTIONS:
 * 1. Caller must be COMPANY_ADMIN of the same tenant OR SUPER_ADMIN
 * 2. Cannot modify SUPER_ADMIN or COMPANY_ADMIN workspace access
 * 3. Workspaces must belong to the user's tenant
 * 4. Cannot assign workspaces to users in other tenants
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.targetUserId - UID of the user to modify
 * @param {string[]} data.workspaceIds - Array of workspace IDs to assign
 */
exports.assignWorkspaceAccess = functions.https.onCall(async (data, context) => {
    // -------------------------------------------------------------------------
    // STEP 1: Validate Authentication
    // -------------------------------------------------------------------------
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const callerRole = context.auth.token.role;
    const callerTenantId = context.auth.token.tenantId;
    const callerUid = context.auth.uid;

    // -------------------------------------------------------------------------
    // STEP 2: Validate Input Parameters
    // -------------------------------------------------------------------------
    const { targetUserId, workspaceIds } = data;

    if (!targetUserId || !Array.isArray(workspaceIds)) {
        throw new functions.https.HttpsError('invalid-argument', ERRORS.MISSING_PARAMS);
    }

    console.log(`[assignWorkspaceAccess] Iniciando asignación de workspaces`);
    console.log(`  - Usuario objetivo: ${targetUserId}`);
    console.log(`  - Workspaces: ${workspaceIds.join(', ')}`);

    // -------------------------------------------------------------------------
    // STEP 3: Get Target User Data
    // -------------------------------------------------------------------------
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();

    if (!targetUserDoc.exists) {
        throw new functions.https.HttpsError('not-found', ERRORS.USER_NOT_FOUND);
    }

    const targetUserData = targetUserDoc.data();
    const targetTenantId = targetUserData.tenant_id;
    const targetRole = targetUserData.role;

    // -------------------------------------------------------------------------
    // STEP 4: Authorization Checks
    // -------------------------------------------------------------------------

    // Check 1: Caller must be admin
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'COMPANY_ADMIN') {
        throw new functions.https.HttpsError('permission-denied', ERRORS.NOT_AUTHORIZED);
    }

    // Check 2: COMPANY_ADMIN can only modify users in their tenant
    if (callerRole === 'COMPANY_ADMIN' && callerTenantId !== targetTenantId) {
        throw new functions.https.HttpsError('permission-denied',
            'Error: No puedes modificar usuarios de otras empresas.');
    }

    // Check 3: Cannot modify SUPER_ADMIN workspace access
    if (targetRole === 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied',
            'Error: No se puede modificar el acceso de un Super Admin.');
    }

    // Check 4: COMPANY_ADMIN cannot modify another COMPANY_ADMIN
    if (targetRole === 'COMPANY_ADMIN' && callerRole !== 'SUPER_ADMIN') {
        throw new functions.https.HttpsError('permission-denied',
            'Error: Solo un Super Admin puede modificar administradores de empresa.');
    }

    // -------------------------------------------------------------------------
    // STEP 5: Validate Workspaces Belong to Target User's Tenant
    // -------------------------------------------------------------------------
    for (const wsId of workspaceIds) {
        const wsDoc = await db
            .collection('tenants')
            .doc(targetTenantId)
            .collection('workspaces')
            .doc(wsId)
            .get();

        if (!wsDoc.exists) {
            throw new functions.https.HttpsError('invalid-argument',
                `Error: El espacio de trabajo "${wsId}" no existe en la empresa del usuario.`);
        }
    }

    // -------------------------------------------------------------------------
    // STEP 6: Update Custom Claims
    // -------------------------------------------------------------------------
    const newClaims = {
        tenantId: targetTenantId,
        role: targetRole,
        workspaces: workspaceIds,
    };

    await admin.auth().setCustomUserClaims(targetUserId, newClaims);
    console.log(`  - Custom Claims actualizados`);

    // -------------------------------------------------------------------------
    // STEP 7: Update Firestore Document
    // -------------------------------------------------------------------------
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('users').doc(targetUserId).update({
        assigned_workspaces: workspaceIds,
        claims_updated_at: now,
        claims_updated_by: callerUid,
    });
    console.log(`  - Documento Firestore actualizado`);

    // -------------------------------------------------------------------------
    // STEP 8: Update Workspace Documents (add user to assigned_officers)
    // -------------------------------------------------------------------------
    // Get previous workspaces to calculate diff
    const previousWorkspaces = targetUserData.assigned_workspaces || [];

    // Remove from workspaces no longer assigned
    const removedWorkspaces = previousWorkspaces.filter(ws => !workspaceIds.includes(ws));
    for (const wsId of removedWorkspaces) {
        await db
            .collection('tenants')
            .doc(targetTenantId)
            .collection('workspaces')
            .doc(wsId)
            .update({
                assigned_officers: admin.firestore.FieldValue.arrayRemove(targetUserId),
            });
    }

    // Add to newly assigned workspaces
    const addedWorkspaces = workspaceIds.filter(ws => !previousWorkspaces.includes(ws));
    for (const wsId of addedWorkspaces) {
        await db
            .collection('tenants')
            .doc(targetTenantId)
            .collection('workspaces')
            .doc(wsId)
            .update({
                assigned_officers: admin.firestore.FieldValue.arrayUnion(targetUserId),
            });
    }

    // -------------------------------------------------------------------------
    // STEP 9: Log the Action
    // -------------------------------------------------------------------------
    await db.collection('usage_logs').add({
        event_type: 'WORKSPACE_ACCESS_UPDATED',
        tenant_id: targetTenantId,
        target_user_id: targetUserId,
        performed_by: callerUid,
        timestamp: now,
        metadata: {
            previous_workspaces: previousWorkspaces,
            new_workspaces: workspaceIds,
            added: addedWorkspaces,
            removed: removedWorkspaces,
        },
    });

    console.log(`[assignWorkspaceAccess] ✅ Éxito: Acceso actualizado`);

    // -------------------------------------------------------------------------
    // STEP 10: Return Success Response
    // -------------------------------------------------------------------------
    return {
        success: true,
        message: 'Éxito: Acceso a espacios de trabajo actualizado correctamente.',
        workspaces: workspaceIds,
        changes: {
            added: addedWorkspaces,
            removed: removedWorkspaces,
        },
    };
});

// ============================================================================
// FUNCTION C: impersonateTenant (Super Admin Only)
// Allows platform owner to view tenant data for support
// ============================================================================

/**
 * Generates a temporary impersonation token for Super Admin.
 * This allows the platform owner to "see what the customer sees" for support.
 * 
 * SECURITY PROTECTIONS:
 * 1. ONLY SUPER_ADMIN can call this function
 * 2. Impersonation is logged for audit trail
 * 3. Token is time-limited (1 hour max)
 * 4. Original SUPER_ADMIN role is preserved with additional claims
 * 5. Cannot impersonate other SUPER_ADMINs
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.targetTenantId - Tenant ID to impersonate
 * @param {number} data.durationMinutes - Optional duration (default 60, max 60)
 */
exports.impersonateTenant = functions.https.onCall(async (data, context) => {
    // -------------------------------------------------------------------------
    // STEP 1: STRICT Super Admin Check
    // -------------------------------------------------------------------------
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const callerRole = context.auth.token.role;
    const callerUid = context.auth.uid;
    const callerEmail = context.auth.token.email;

    // CRITICAL: Only SUPER_ADMIN can impersonate
    if (callerRole !== 'SUPER_ADMIN') {
        // Log attempted breach
        await db.collection('security_logs').add({
            event_type: 'IMPERSONATION_ATTEMPT_DENIED',
            user_id: callerUid,
            user_role: callerRole,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            ip_address: context.rawRequest?.ip || null,
        });

        throw new functions.https.HttpsError('permission-denied',
            'Error: Solo los Super Administradores pueden usar esta función.');
    }

    console.log(`[impersonateTenant] Super Admin iniciando impersonación`);
    console.log(`  - Solicitante: ${callerEmail} (${callerUid})`);

    // -------------------------------------------------------------------------
    // STEP 2: Validate Input
    // -------------------------------------------------------------------------
    const { targetTenantId, durationMinutes = 60 } = data;

    if (!targetTenantId) {
        throw new functions.https.HttpsError('invalid-argument',
            'Error: Debes especificar el ID de la empresa a impersonar.');
    }

    // Limit duration to 60 minutes max for security
    const duration = Math.min(durationMinutes, 60);

    // -------------------------------------------------------------------------
    // STEP 3: Validate Target Tenant Exists
    // -------------------------------------------------------------------------
    const tenantDoc = await db.collection('tenants').doc(targetTenantId).get();

    if (!tenantDoc.exists) {
        throw new functions.https.HttpsError('not-found',
            'Error: La empresa especificada no existe.');
    }

    const tenantData = tenantDoc.data();
    console.log(`  - Empresa objetivo: ${tenantData.razon_social || targetTenantId}`);

    // -------------------------------------------------------------------------
    // STEP 4: Create Impersonation Session
    // -------------------------------------------------------------------------
    const now = admin.firestore.FieldValue.serverTimestamp();
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    const sessionId = `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store session for validation and audit
    await db.collection('impersonation_sessions').doc(sessionId).set({
        session_id: sessionId,
        super_admin_uid: callerUid,
        super_admin_email: callerEmail,
        target_tenant_id: targetTenantId,
        target_tenant_name: tenantData.razon_social || targetTenantId,
        started_at: now,
        expires_at: expiresAt,
        status: 'active',
        actions_performed: [],
    });

    // -------------------------------------------------------------------------
    // STEP 5: Generate Custom Token with Impersonation Claims
    // -------------------------------------------------------------------------
    // We create a custom token that includes:
    // - Original super_admin status
    // - Impersonated tenant context
    // - Session ID for tracking

    const impersonationClaims = {
        // Original identity (preserved for security)
        originalRole: 'SUPER_ADMIN',
        originalUid: callerUid,

        // Impersonation context
        isImpersonating: true,
        impersonationSessionId: sessionId,
        tenantId: targetTenantId,

        // Effective permissions (COMPANY_ADMIN level for the target tenant)
        role: 'COMPANY_ADMIN',
        workspaces: [], // Will have access to all via role

        // Expiration
        impersonationExpiresAt: expiresAt.getTime(),
    };

    // Create a custom token for the impersonation session
    const customToken = await admin.auth().createCustomToken(callerUid, impersonationClaims);

    console.log(`  - Sesión creada: ${sessionId}`);
    console.log(`  - Expira en: ${duration} minutos`);

    // -------------------------------------------------------------------------
    // STEP 6: Log the Impersonation (Critical for Audit)
    // -------------------------------------------------------------------------
    await db.collection('usage_logs').add({
        event_type: 'IMPERSONATION_STARTED',
        super_admin_uid: callerUid,
        super_admin_email: callerEmail,
        target_tenant_id: targetTenantId,
        target_tenant_name: tenantData.razon_social,
        session_id: sessionId,
        duration_minutes: duration,
        expires_at: expiresAt,
        timestamp: now,
        ip_address: context.rawRequest?.ip || null,
    });

    console.log(`[impersonateTenant] ✅ Impersonación iniciada`);

    // -------------------------------------------------------------------------
    // STEP 7: Return Token and Session Info
    // -------------------------------------------------------------------------
    return {
        success: true,
        message: `Éxito: Sesión de soporte iniciada para "${tenantData.razon_social || targetTenantId}".`,
        session: {
            sessionId,
            customToken, // Frontend uses this to sign in
            tenantId: targetTenantId,
            tenantName: tenantData.razon_social,
            expiresAt: expiresAt.toISOString(),
            durationMinutes: duration,
        },
        warning: 'Esta sesión está siendo registrada para auditoría. Todas las acciones quedarán registradas.',
    };
});

// ============================================================================
// FUNCTION: endImpersonation
// Ends an impersonation session and restores normal access
// ============================================================================

/**
 * Ends an active impersonation session.
 * 
 * @param {Object} data - Function parameters
 * @param {string} data.sessionId - The impersonation session ID to end
 */
exports.endImpersonation = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', ERRORS.NOT_AUTHENTICATED);
    }

    const { sessionId } = data;

    if (!sessionId) {
        throw new functions.https.HttpsError('invalid-argument',
            'Error: Debes especificar el ID de la sesión.');
    }

    // Get session
    const sessionDoc = await db.collection('impersonation_sessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
        throw new functions.https.HttpsError('not-found',
            'Error: Sesión no encontrada.');
    }

    const sessionData = sessionDoc.data();

    // Verify caller owns this session
    if (sessionData.super_admin_uid !== context.auth.uid &&
        context.auth.token.originalUid !== sessionData.super_admin_uid) {
        throw new functions.https.HttpsError('permission-denied',
            'Error: No tienes permiso para terminar esta sesión.');
    }

    // Update session status
    await sessionDoc.ref.update({
        status: 'ended',
        ended_at: admin.firestore.FieldValue.serverTimestamp(),
        ended_by: context.auth.uid,
    });

    // Log the end
    await db.collection('usage_logs').add({
        event_type: 'IMPERSONATION_ENDED',
        session_id: sessionId,
        ended_by: context.auth.uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[endImpersonation] ✅ Sesión terminada: ${sessionId}`);

    return {
        success: true,
        message: 'Éxito: Sesión de soporte terminada. Tu acceso normal ha sido restaurado.',
    };
});

