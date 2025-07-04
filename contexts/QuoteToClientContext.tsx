import React, { createContext, ReactNode, useContext, useState } from 'react';

export type QuoteToClientData = {
  id: string;
  name: string;
  address: string;
  town: string;
  number: string;
  value?: string;
  frequency?: string;
  notes?: string;
  date?: string;
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