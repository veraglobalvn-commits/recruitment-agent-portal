'use client';

import { createContext, useContext } from 'react';

export interface AdminContextValue {
  role: string | null;
  userId: string | null;
}

export const AdminContext = createContext<AdminContextValue>({ role: null, userId: null });

export function useAdminContext() {
  return useContext(AdminContext);
}
