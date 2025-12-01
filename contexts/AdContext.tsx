import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type AdContextValue = {
  showPopup: boolean;
  openPopup: () => void;
  closePopup: () => void;
};

const AdContext = createContext<AdContextValue | undefined>(undefined);

export function AdProvider({ children }: { children: React.ReactNode }) {
  const [showPopup, setShowPopup] = useState(false);

  const openPopup = useCallback(() => setShowPopup(true), []);
  const closePopup = useCallback(() => setShowPopup(false), []);

  const value = useMemo(
    () => ({
      showPopup,
      openPopup,
      closePopup,
    }),
    [showPopup, openPopup, closePopup]
  );

  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
}

export function useAd(): AdContextValue {
  const ctx = useContext(AdContext);
  if (!ctx) {
    throw new Error('useAd must be used within AdProvider');
  }
  return ctx;
}
