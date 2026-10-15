import { API_V1 } from '@/config';
import { useSession } from '@/store/session';

import type { TokenPair } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean; query?: Record<string, unknown> };

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: parallel 401s wait for the same rotation instead of racing it. */
async function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const { refresh, signIn, signOut } = useSession.getState();
      if (!refresh) return false;
      try {
        const res = await fetch(`${API_V1}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) await signOut();
          return false;
        }
        await signIn((await res.json()) as TokenPair);
        return true;
      } catch {
        return false; // offline: keep the session, the request fails normally
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function qs(query?: Record<string, unknown>) {
  if (!query) return '';
  const p = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
}

export async function api<T>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const { access } = useSession.getState();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (access && opts.auth !== false) headers.Authorization = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(`${API_V1}${path}${qs(opts.query)}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network', 'No internet connection.');
  }

  if (res.status === 401 && access && !retried) {
    if (await refreshTokens()) return api<T>(path, opts, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export function fileForm(uri: string, name: string, type: string): FormData {
  const form = new FormData();
  // React Native's FormData accepts {uri, name, type} for files.
  form.append('file', { uri, name, type } as unknown as Blob);
  return form;
}
