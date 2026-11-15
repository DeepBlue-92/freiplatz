import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface SystemStatus {
  isInitialized: boolean;
  multiTenantMode: boolean;
  initializedAt?: string;
}

interface SystemConfigContextType {
  isInitialized: boolean | null; // null = prüft noch (Loading-State)
  multiTenantMode: boolean;
  isLoading: boolean;
  error: Error | null;
  refreshSystemConfig: () => Promise<void>;
  setSystemConfigState: (status: Partial<SystemStatus>) => void;
}

const SystemConfigContext = createContext<SystemConfigContextType | undefined>(undefined);

export const SystemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [multiTenantMode, setMultiTenantMode] = useState<boolean>(true); // Legacy default
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const checkSystemInitialization = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. limit(1) Abfrage auf Firestore 'users'-Collection with 2.5s timeout guard
      const usersRef = collection(db, 'users');
      const usersQuery = query(usersRef, limit(1));
      const usersTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout checking users collection")), 2500)
      );
      const usersSnap = await Promise.race([getDocs(usersQuery), usersTimeoutPromise]);

      if (usersSnap.empty) {
        // Fall A: 0 Nutzer gefunden -> Frisches System, Setup erforderlich
        setIsInitialized(false);
        setMultiTenantMode(true);
      } else {
        // Fall B: Mindestens 1 Nutzer vorhanden -> System ist bereits initialisiert (Zero-Downtime Schutz)
        setIsInitialized(true);

        // Lade optionales system/status Dokument
        try {
          const statusDocRef = doc(db, 'system', 'status');
          const statusTimeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout checking system/status")), 1500)
          );
          const statusSnap = await Promise.race([getDoc(statusDocRef), statusTimeoutPromise]);

          if (statusSnap.exists()) {
            const data = statusSnap.data();
            setMultiTenantMode(data?.multiTenantMode !== false);
          } else {
            // Legacy-System ohne system/status Dokument: Standardmäßig multiTenantMode = true
            setMultiTenantMode(true);
          }
        } catch (statusErr) {
          console.warn("Could not read system/status document, fallback to multiTenantMode=true:", statusErr);
          setMultiTenantMode(true);
        }
      }
    } catch (err: any) {
      console.error("Error checking system initialization status:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      // Im Zweifel bei bestehendem System nicht fälschlich in Setup sperren
      setIsInitialized(true);
      setMultiTenantMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSystemInitialization();
  }, []);

  const setSystemConfigState = (status: Partial<SystemStatus>) => {
    if (typeof status.isInitialized === 'boolean') {
      setIsInitialized(status.isInitialized);
    }
    if (typeof status.multiTenantMode === 'boolean') {
      setMultiTenantMode(status.multiTenantMode);
    }
  };

  return (
    <SystemConfigContext.Provider
      value={{
        isInitialized,
        multiTenantMode,
        isLoading,
        error,
        refreshSystemConfig: checkSystemInitialization,
        setSystemConfigState,
      }}
    >
      {children}
    </SystemConfigContext.Provider>
  );
};

export const useSystemConfig = (): SystemConfigContextType => {
  const context = useContext(SystemConfigContext);
  if (!context) {
    throw new Error('useSystemConfig must be used within a SystemConfigProvider');
  }
  return context;
};
