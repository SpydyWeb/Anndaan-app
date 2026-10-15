import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LangMode = 'both' | 'en' | 'hi';

export type Place = { lat: number; lng: number; label: string | null; manual: boolean };

type Prefs = {
  lang: LangMode;
  welcomeSeen: boolean;
  place: Place | null;
  pushAsked: boolean;
  setLang: (lang: LangMode) => void;
  setWelcomeSeen: () => void;
  setPlace: (place: Place | null) => void;
  setPushAsked: () => void;
};

/** Non-sensitive device preferences. Tokens live in SecureStore, never here. */
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      lang: 'both',
      welcomeSeen: false,
      place: null,
      pushAsked: false,
      setLang: (lang) => set({ lang }),
      setWelcomeSeen: () => set({ welcomeSeen: true }),
      setPlace: (place) => set({ place }),
      setPushAsked: () => set({ pushAsked: true }),
    }),
    { name: 'annadaan-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
