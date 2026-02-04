import { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenant = async () => {
      if (user?.tenantId) {
        try {
          const tenantDoc = await getDoc(doc(db, 'tenants', user.tenantId));
          if (tenantDoc.exists()) {
            setTenant({
              id: tenantDoc.id,
              ...tenantDoc.data()
            });
          }
        } catch (error) {
          console.error('Error fetching tenant:', error);
        }
      } else {
        setTenant(null);
      }
      setLoading(false);
    };

    fetchTenant();
  }, [user?.tenantId]);

  const value = {
    tenant,
    loading,
    hasTenant: !!tenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

export default TenantContext;
