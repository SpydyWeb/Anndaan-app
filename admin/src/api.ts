import type { components } from './schema'

type S = components['schemas']
export type Stats = S['AdminStats']
export type AdminUser = S['AdminUser']
export type AdminListing = S['AdminListing']
export type AdminReservation = S['AdminReservation']
export type AdminNgo = S['AdminNgo']
export type AdminReport = S['AdminReport']
export type Audit = S['AuditOut']
export type TokenPair = S['TokenPair']
export type Page<T> = { items: T[]; total: number; limit: number; offset: number }

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1'
const KEY = 'annadaan.admin.refresh'

// Access token lives only in memory; the refresh token survives a reload of this tab
// (sessionStorage), never across browser restarts.
let access: string | null = null

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const session = {
  get signedIn() {
    return !!access
  },
  set(pair: TokenPair) {
    access = pair.access_token
    sessionStorage.setItem(KEY, pair.refresh_token)
  },
  clear() {
    access = null
    sessionStorage.removeItem(KEY)
  },
  async restore(): Promise<TokenPair | null> {
    const refresh = sessionStorage.getItem(KEY)
    if (!refresh) return null
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) {
      session.clear()
      return null
    }
    const pair = (await res.json()) as TokenPair
    session.set(pair)
    return pair
  },
}

let refreshing: Promise<TokenPair | null> | null = null

export async function api<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}, retried = false): Promise<T> {
  const q = Object.entries(init.query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  const url = `${BASE}${path}${q.length ? '?' + new URLSearchParams(q.map(([k, v]) => [k, String(v)])) : ''}`
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (access) headers.Authorization = `Bearer ${access}`
  const res = await fetch(url, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 401 && access && !retried) {
    refreshing ??= session.restore().finally(() => (refreshing = null))
    if (await refreshing) return api<T>(path, init, true)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? res.statusText, data?.error?.details)
  return data as T
}

/** Certificates need the bearer token, so fetch them as a blob and open locally. */
export async function openCertificate(ngoId: string) {
  const res = await fetch(`${BASE}/admin/ngos/${ngoId}/certificate`, { headers: { Authorization: `Bearer ${access}` } })
  if (!res.ok) throw new ApiError(res.status, 'not_found', 'Certificate not found')
  const url = URL.createObjectURL(await res.blob())
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
