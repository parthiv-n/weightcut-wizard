import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

const isNative = Capacitor.isNativePlatform();

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isNative) return localStorage.getItem(key);
    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value;
    } catch {
      return null; // SecureStoragePlugin.get() throws on missing key
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isNative) { localStorage.setItem(key, value); return; }
    await SecureStoragePlugin.set({ key, value });
  },

  async removeItem(key: string): Promise<void> {
    if (!isNative) { localStorage.removeItem(key); return; }
    try { await SecureStoragePlugin.remove({ key }); } catch { /* no-op on missing key */ }
  },
};
