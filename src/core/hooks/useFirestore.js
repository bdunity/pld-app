import { useState, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export function useFirestore(collectionName) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get collection reference with tenant filter
  const getCollectionRef = useCallback(() => {
    return collection(db, collectionName);
  }, [collectionName]);

  // Add document with tenantId
  const addDocument = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    try {
      if (!user?.tenantId) {
        throw new Error('No tenant ID available');
      }
      const docRef = await addDoc(getCollectionRef(), {
        ...data,
        tenantId: user.tenantId,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
      });
      setLoading(false);
      return docRef;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [user, getCollectionRef]);

  // Update document
  const updateDocument = useCallback(async (docId, data) => {
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
      });
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [collectionName, user]);

  // Delete document
  const deleteDocument = useCallback(async (docId) => {
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, docId);
      await deleteDoc(docRef);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [collectionName]);

  // Get single document
  const getDocument = useCallback(async (docId) => {
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      setLoading(false);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [collectionName]);

  // Get documents with tenant filter
  const getDocuments = useCallback(async (constraints = []) => {
    setLoading(true);
    setError(null);
    try {
      if (!user?.tenantId) {
        throw new Error('No tenant ID available');
      }
      const q = query(
        getCollectionRef(),
        where('tenantId', '==', user.tenantId),
        ...constraints
      );
      const querySnapshot = await getDocs(q);
      const documents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLoading(false);
      return documents;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [user, getCollectionRef]);

  return {
    loading,
    error,
    addDocument,
    updateDocument,
    deleteDocument,
    getDocument,
    getDocuments,
  };
}

export default useFirestore;
