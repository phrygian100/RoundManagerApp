import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface DualInstanceContextType {
  isDualMode: boolean;
  isDesktop: boolean;
}

const DualInstanceContext = createContext<DualInstanceContextType>({
  isDualMode: false,
  isDesktop: false,
});

export const useDualInstance = () => useContext(DualInstanceContext);

export function DualInstanceProvider({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDualMode, setIsDualMode] = useState(false);
  
  useEffect(() => {
    if (Platform.OS === 'web') {
      const checkScreenSize = () => {
        const newIsDesktop = window.innerWidth >= 1200;
        setIsDesktop(newIsDesktop);
        setIsDualMode(newIsDesktop); // Enable dual mode on desktop
        console.log('🖥️ Screen size check:', { width: window.innerWidth, isDesktop: newIsDesktop });
      };
      
      checkScreenSize();
      window.addEventListener('resize', checkScreenSize);
      return () => window.removeEventListener('resize', checkScreenSize);
    }
  }, []);

  return (
    <DualInstanceContext.Provider value={{ isDualMode, isDesktop }}>
      {children}
    </DualInstanceContext.Provider>
  );
} 