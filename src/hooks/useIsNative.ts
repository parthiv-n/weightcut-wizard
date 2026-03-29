import { Capacitor } from "@capacitor/core";

/** Evaluated once at module load — safe to use outside React */
export const isNativePlatform = Capacitor.isNativePlatform();

/** React hook wrapper */
export function useIsNative() {
  return isNativePlatform;
}
