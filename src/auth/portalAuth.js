import { createContext, useContext } from "react";

export const PortalAuthContext = createContext(null);

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);

  if (!context) {
    throw new Error("usePortalAuth must be used inside PortalAuthProvider.");
  }

  return context;
}
