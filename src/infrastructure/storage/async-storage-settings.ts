import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SettingsStorage } from '@/application/settings-store';

export function createAsyncStorageSettings(): SettingsStorage {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  };
}
