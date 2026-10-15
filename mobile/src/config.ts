import Constants from 'expo-constants';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL for builds (e.g. https://api.annadaan.in).
 * In development it falls back to the machine running Metro, port 8000, so a phone on
 * the same Wi-Fi reaches the local backend without extra setup.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && host) return `http://${host}:8000`;
  return 'http://localhost:8000';
}

export const API_URL = resolveApiUrl();
export const API_V1 = `${API_URL}/api/v1`;
