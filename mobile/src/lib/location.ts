import * as Location from 'expo-location';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { usePrefs, type Place } from '@/store/prefs';

export type LocStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'error' | 'outside';

/** Anndaan serves India; the API rejects points outside this box. */
export const inIndia = (lat: number, lng: number) => lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;

function label(a: Location.LocationGeocodedAddress | undefined): string | null {
  if (!a) return null;
  const local = a.district || a.subregion || a.street;
  const city = a.city || a.region;
  return [local, city].filter(Boolean).join(', ') || null;
}

// Shared across screens, outside React state: the locate call is an external sync.
const useLocStatus = create<{ status: LocStatus }>(() => ({ status: 'idle' }));
const setStatus = (status: LocStatus) => useLocStatus.setState({ status });

async function locateNow(): Promise<Place | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      setStatus(usePrefs.getState().place ? 'ready' : 'denied');
      return null;
    }
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude: lat, longitude: lng } = pos.coords;
    if (!inIndia(lat, lng)) {
      // e.g. an emulator's default GPS (California). Drop any stale GPS place; keep a typed one.
      const prev = usePrefs.getState().place;
      if (prev && !prev.manual) usePrefs.getState().setPlace(null);
      setStatus(prev?.manual ? 'ready' : 'outside');
      return null;
    }
    let name: string | null = null;
    try {
      name = label((await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }))[0]);
    } catch {
      // reverse geocoding is a nicety; ignore failures
    }
    const p: Place = { lat, lng, label: name, manual: false };
    usePrefs.getState().setPlace(p);
    setStatus('ready');
    return p;
  } catch {
    setStatus(usePrefs.getState().place ? 'ready' : 'error');
    return null;
  }
}

/** Device location for "near you" searches. Falls back to an area the user typed. */
export function useHere(auto = true) {
  const place = usePrefs((s) => s.place);
  const raw = useLocStatus((s) => s.status);
  const status: LocStatus = raw === 'idle' ? (place ? 'ready' : auto ? 'locating' : 'idle') : raw;

  const locate = useCallback(() => {
    setStatus('locating');
    return locateNow();
  }, []);

  /** Typed area, e.g. "Sector 15 Rohini Delhi", resolved with the phone's free geocoder. */
  const search = useCallback(async (text: string) => {
    const q = text.trim();
    if (q.length < 3) return false;
    try {
      const hit = (await Location.geocodeAsync(q.toLowerCase().includes('india') ? q : `${q}, India`))[0];
      if (!hit || !inIndia(hit.latitude, hit.longitude)) return false;
      usePrefs.getState().setPlace({ lat: hit.latitude, lng: hit.longitude, label: q, manual: true });
      setStatus('ready');
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const p = usePrefs.getState().place;
    if (auto && (!p || !p.manual)) void locateNow();
  }, [auto]);

  return { place, status, locate, search };
}

/** Precise point for a new food post: current GPS, or the typed address geocoded. */
export async function pointFor(address: string): Promise<{ lat: number; lng: number; area: string | null } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!inIndia(pos.coords.latitude, pos.coords.longitude)) throw new Error('outside India');
      let area: string | null = null;
      try {
        area = label((await Location.reverseGeocodeAsync(pos.coords))[0]);
      } catch {}
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, area };
    }
  } catch {}
  try {
    const hit = (await Location.geocodeAsync(`${address}, India`))[0];
    if (hit && inIndia(hit.latitude, hit.longitude)) return { lat: hit.latitude, lng: hit.longitude, area: null };
  } catch {}
  return null;
}

export async function currentArea(): Promise<string | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return usePrefs.getState().place?.label ?? null;
    const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
    // Never suggest a foreign place name (e.g. an emulator's default California GPS).
    if (!inIndia(pos.coords.latitude, pos.coords.longitude)) return null;
    return label((await Location.reverseGeocodeAsync(pos.coords))[0]);
  } catch {
    return usePrefs.getState().place?.label ?? null;
  }
}
