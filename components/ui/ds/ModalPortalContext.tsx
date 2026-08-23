'use client';

import { createContext, useContext } from 'react';

/**
 * True when rendered inside a Modal or Drawer body.
 * Select/Menu should portal to `document.body` so overlays clear sticky footers
 * (shells use overflow-y: auto + overflow: hidden on the root).
 */
export const OverlayPortalContext = createContext(false);

/** @deprecated Prefer OverlayPortalContext — same context value. */
export const ModalPortalContext = OverlayPortalContext;

export function useInsideOverlay(): boolean {
  return useContext(OverlayPortalContext);
}

/** @deprecated Prefer useInsideOverlay — same as overlay context. */
export function useInsideModal(): boolean {
  return useInsideOverlay();
}
