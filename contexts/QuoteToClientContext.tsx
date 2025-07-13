import React, { createContext, ReactNode, useContext, useState } from 'react';

export type QuoteLine = {
  serviceType: string;
  frequency: string;
  value: string;
  notes: string;
};

export type QuoteToClientData = {
  id: string;
  name: string;
  address: string;
  town: string;
  number: string;
  lines?: QuoteLine[];
  // legacy fields for backward compatibility
  value?: string;
  frequency?: string;
  notes?: string;
  date?: string;
  source?: string;
};

type QuoteToClientContextType = {
  quoteData: QuoteToClientData | null;
  setQuoteData: (data: QuoteToClientData | null) => void;
  clearQuoteData: () => void;
};

const QuoteToClientContext = createContext<QuoteToClientContextType | undefined>(undefined);

export const QuoteToClientProvider = ({ children }: { children: ReactNode }) => {
  const [quoteData, setQuoteData] = useState<QuoteToClientData | null>(null);
  const clearQuoteData = () => setQuoteData(null);
  return (
    <QuoteToClientContext.Provider value={{ quoteData, setQuoteData, clearQuoteData }}>
      {children}
    </QuoteToClientContext.Provider>
  );
};

export const useQuoteToClient = () => {
  const ctx = useContext(QuoteToClientContext);
  if (!ctx) throw new Error('useQuoteToClient must be used within a QuoteToClientProvider');
  return ctx;
}; 