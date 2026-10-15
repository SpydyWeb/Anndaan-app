import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import type { Me, TokenPair } from '@/api/types';

const KEY = 'annadaan.session.v1';

type Stored = { access: string; accessExpiresAt: string; refresh: string; user: Me };

type SessionState = {
  ready: boolean;
  access: string | null;
  accessExpiresAt: string | null;
  refresh: string | null;
  user: Me | null;
  hydrate: () => Promise<void>;
  signIn: (pair: TokenPair) => Promise<void>;
  setUser: (user: Me) => Promise<void>;
  signOut: () => Promise<void>;
};

// SecureStore is unavailable on web (used only for quick UI checks), so fall back there.
const store = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

async function persist(s: Stored | null) {
  if (s) await store.set(KEY, JSON.stringify(s));
  else await store.del(KEY);
}

export const useSession = create<SessionState>()((set, get) => ({
  ready: false,
  access: null,
  accessExpiresAt: null,
  refresh: null,
  user: null,
  hydrate: async () => {
    try {
      const raw = await store.get(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        set({ access: s.access, accessExpiresAt: s.accessExpiresAt, refresh: s.refresh, user: s.user });
      }
    } catch {
      await persist(null);
    } finally {
      set({ ready: true });
    }
  },
  signIn: async (pair) => {
    const s: Stored = { access: pair.access_token, accessExpiresAt: pair.access_expires_at, refresh: pair.refresh_token, user: pair.user };
    set({ access: s.access, accessExpiresAt: s.accessExpiresAt, refresh: s.refresh, user: s.user });
    await persist(s);
  },
  setUser: async (user) => {
    const { access, accessExpiresAt, refresh } = get();
    set({ user });
    if (access && refresh && accessExpiresAt) await persist({ access, accessExpiresAt, refresh, user });
  },
  signOut: async () => {
    set({ access: null, accessExpiresAt: null, refresh: null, user: null });
    await persist(null);
  },
}));
