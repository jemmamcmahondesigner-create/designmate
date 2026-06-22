'use client';

import { createContext, useContext } from 'react';

/** True when rendered inside a Modal body — Select menus should portal to avoid footer clipping. */
export const ModalPortalContext = createContext(false);

export function useInsideModal(): boolean {
  return useContext(ModalPortalContext);
}
