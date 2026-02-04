import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { isSuperAdmin } from '../config/superAdmins';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingTenant, setCheckingTenant] = useState(false);

  // Verificar si el usuario tiene datos de tenant (onboarding completado)
  const checkTenantData = useCallback(async (uid) => {
    setCheckingTenant(true);
    try {
      const tenantDoc = await getDoc(doc(db, 'tenants', uid));
      if (tenantDoc.exists()) {
        const data = tenantDoc.data();
        setTenantData({
          id: tenantDoc.id,
          ...data,
          onboardingCompleted: data.onboardingCompleted || false
        });
        return data;
      }
      setTenantData(null);
      return null;
    } catch (error) {
      console.error('Error checking tenant data:', error);
      setTenantData(null);
      return null;
    } finally {
      setCheckingTenant(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Get custom claims (tenantId, role)
        const token = await firebaseUser.getIdTokenResult();

        const superAdmin = isSuperAdmin(firebaseUser.email);

        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          emailVerified: firebaseUser.emailVerified,
          tenantId: token.claims.tenantId || firebaseUser.uid, // Use uid as tenantId by default
          role: superAdmin ? 'super_admin' : (token.claims.role || 'admin'),
          isSuperAdmin: superAdmin,
        };

        setUser(userData);

        // Verificar datos de tenant (onboarding)
        await checkTenantData(firebaseUser.uid);
      } else {
        setUser(null);
        setTenantData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [checkTenantData]);

  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    // Refresh tenant data after login
    await checkTenantData(result.user.uid);
    return result;
  };

  const register = async (email, password) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Crear documento de usuario básico
    await setDoc(doc(db, 'users', result.user.uid), {
      email: result.user.email,
      createdAt: new Date().toISOString(),
      role: 'admin', // First user is admin of their own tenant
      tenantId: result.user.uid, // Use uid as tenantId
    });

    return result;
  };

  const logout = async () => {
    setTenantData(null);
    return signOut(auth);
  };

  const resetPassword = async (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  // Refrescar datos del tenant (útil después del onboarding)
  const refreshTenantData = async () => {
    if (user?.uid) {
      return checkTenantData(user.uid);
    }
    return null;
  };

  const value = {
    user,
    tenantData,
    loading,
    checkingTenant,
    login,
    register,
    logout,
    resetPassword,
    refreshTenantData,
    isAuthenticated: !!user,
    isSuperAdmin: user?.isSuperAdmin === true,
    hasCompletedOnboarding: user?.isSuperAdmin === true || tenantData?.onboardingCompleted === true,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
