import React, { createContext, useContext } from 'react';
import type { DrMASController } from './useDrMASController';
const DrMASContext = createContext<DrMASController | null>(null);
export const DrMASProvider = DrMASContext.Provider;
export function useDrMAS() {
  const context = useContext(DrMASContext);
  if (!context) throw new Error('DrMASProvider is required');
  return context;
}
