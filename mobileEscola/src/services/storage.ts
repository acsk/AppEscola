/**
 * storage.ts
 *
 * Abstração de armazenamento seguro:
 *  - Web:    window.localStorage (sem suporte a SecureStore)
 *  - Nativo: expo-secure-store (iOS Keychain / Android Keystore)
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export const STORAGE_KEYS = {
  TOKEN:     'auth_token',
  ROLE:      'user_role',
  USER_DATA: 'user_data',
} as const;

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      return window.localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
