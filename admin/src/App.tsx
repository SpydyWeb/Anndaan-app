import { useCallback, useEffect, useState, type ReactNode } from 'react'

import {
  api,
  ApiError,
  openCertificate,
  session,
  type AdminListing,
  type AdminNgo,
  type AdminReport,
  type AdminReservation,
  type AdminUser,
  type Audit,
  type Page,
  type Stats,
  type TokenPair,
} from './api'

type View = 'overview' | 'ngos' | 'reports' | 'users' | 'listings' | 'reservations' | 'collections' | 'audit'

const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ngos', label: 'NGOs' },
  { id: 'reports', label: 'Reports' },
  { id: 'users', label: 'Users' },
  { id: 'listings', label: 'Food posts' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'collections', label: 'Collections' },
  { id: 'audit', label: 'Audit log' },
]

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    fn()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, reload: useCallback(() => setTick((t) => t + 1), []) }
}

// ---------- shell ----------

export default function App() {
  const [me, setMe] = useState<TokenPair['user'] | null>(null)
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'overview')

  useEffect(() => {
    session
      .restore()
      .then((p) => p && setMe(p.user))
      .finally(() => setBooting(false))
  }, [])
  useEffect(() => {
    location.hash = view
  }, [view])

  if (booting) return <div className="center muted">Loading…</div>
  if (!me) return <Login onDone={setMe} />
  if (me.role !== 'admin')
    return (
      <div className="center">
        <div className="card narrow">
          <h1>Admins only</h1>
          <p>{me.phone} is not an Anndaan admin. Ask an existing admin to grant access.</p>
          <button onClick={() => (session.clear(), setMe(null))}>Use another number</button>
        </div>
      </div>
    )

  const signOut = async () => {
    const r = sessionStorage.getItem('annadaan.admin.refresh')
    if (r) await api('/auth/logout', { body: { refresh_token: r } }).catch(() => undefined)
    session.clear()
    setMe(null)
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          Anndaan <span>admin</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'on' : ''} onClick={() => setView(n.id)} aria-current={view === n.id ? 'page' : undefined}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="who">
          {me.name ?? me.phone}
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main>
        {view === 'overview' && <Overview go={setView} />}
        {view === 'ngos' && <Ngos />}
        {view === 'reports' && <Reports />}
        {view === 'users' && <Users />}
        {view === 'listings' && <Listings />}
        {view === 'reservations' && <Reservations completed={false} />}
        {view === 'collections' && <Reservations completed />}
        {view === 'audit' && <AuditLog />}
      </main>
    </div>
  )
}

function Login({ onDone }: { onDone: (u: TokenPair['user']) => void }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<{ phone: string; dev?: string | null } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await api<{ phone: string; dev_code?: string | null }>('/auth/otp/request', { body: { phone } })
      setSent({ phone: r.phone, dev: r.dev_code })
      if (r.dev_code) setCode(r.dev_code) // demo server: no SMS is sent, so fill the code in
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const pair = await api<TokenPair>('/auth/otp/verify', { body: { phone: sent!.phone, code } })
      session.set(pair)
      onDone(pair.user)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card narrow" onSubmit={sent ? verify : send}>
        <h1>Anndaan admin</h1>
        <p className="muted">Sign in with your registered admin mobile number. We send a code by SMS.</p>
        <label>
          Mobile number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!sent} inputMode="tel" autoComplete="tel" placeholder="98110 42345" required />
        </label>
        {sent && (
          <label>
            Code from SMS
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required />
            {sent.dev && <small className="muted">Demo server: no SMS is sent. The code has been filled in for you.</small>}
          </label>
        )}
        {err && <p className="err">{err}</p>}
        <button className="pri" disabled={busy}>
          {sent ? 'Sign in' : 'Send code'}
        </button>
        {sent && (
          <button type="button" className="link" onClick={() => (setSent(null), setCode(''))}>
            Change number
          </button>
        )}
      </form>
    </div>
  )
}

// ---------- building blocks ----------

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="ph">
      <h1>{title}</h1>
      <div className="tools">{children}</div>
    </header>
  )
}

function Pager<T>({ page, offset, setOffset }: { page: Page<T> | null; offset: number; setOffset: (n: number) => void }) {
  if (!page || page.total <= page.limit) return null
  return (
    <div className="pager">
      <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - page.limit))}>
        Previous
      </button>
      <span className="muted">
        {offset + 1}–{Math.min(offset + page.limit, page.total)} of {page.total}
      </span>
      <button disabled={offset + page.limit >= page.total} onClick={() => setOffset(offset + page.limit)}>
        Next
      </button>
    </div>
  )
}

function Status({ s }: { s: string }) {
  return <span className={`pill ${s}`}>{s.replace(/_/g, ' ')}</span>
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty: boolean }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={head.length} className="muted empty">
                Nothing here.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}

async function act(fn: () => Promise<unknown>, reload: () => void) {
  try {
    await fn()
    reload()
  } catch (e) {
    alert(e instanceof ApiError ? e.message : 'Action failed')
  }
}

function ask(label: string): string | null {
  const r = prompt(label)?.trim()
  if (!r) return null
  if (r.length < 3) {
    alert('Please write at least a few words.')
    return null
  }
  return r
}

// ---------- pages ----------

function Overview({ go }: { go: (v: View) => void }) {
  const { data: s, error } = useLoad(() => api<Stats>('/admin/stats'), [])
  if (error) return <p className="err">{error}</p>
  if (!s) return <p className="muted">Loading…</p>
  const tile = (label: string, value: number, to?: View, alert?: boolean) => (
    <button className={`tile ${alert && value > 0 ? 'alert' : ''}`} onClick={() => to && go(to)} disabled={!to}>
      <b>{value.toLocaleString('en-IN')}</b>
      <span>{label}</span>
    </button>
  )
  return (
    <>
      <Header title="Overview" />
      <section className="tiles">
        {tile('Open reports', s.reports_open, 'reports', true)}
        {tile('Active NGOs', s.ngos_verified, 'ngos')}
        {tile('Meals available now', s.listings_available, 'listings')}
        {tile('Meals reserved now', s.listings_reserved, 'reservations')}
      </section>
      <h2>Impact</h2>
      <section className="tiles">
        {tile('People fed through hand-overs', s.people_fed_total, 'collections')}
        {tile('Hand-overs completed', s.collections_total, 'collections')}
        {tile('Hand-overs in the last 7 days', s.collections_7d, 'collections')}
        {tile('NGO meal pledges', s.pledges_total)}
      </section>
      <h2>People</h2>
      <section className="tiles">
        {tile('Users', s.users_total, 'users')}
        {tile('New users, last 7 days', s.users_new_7d, 'users')}
        {tile('Suspended users', s.users_suspended, 'users')}
      </section>
    </>
  )
}

function Ngos() {
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error, reload } = useLoad(() => api<Page<AdminNgo>>('/admin/ngos', { query: { status, offset } }), [status, offset])
  return (
    <>
      <Header title="NGOs">
        <Select value={status} onChange={(v) => (setStatus(v), setOffset(0))} options={[['', 'All'], ['verified', 'Active'], ['rejected', 'Paused']]} />
      </Header>
      <p className="muted">
        NGOs can post meal needs as soon as their owner’s mobile number is verified by OTP. Pause an NGO that misuses the app: its needs are hidden and it cannot post new ones.
      </p>
      {error && <p className="err">{error}</p>}
      <Table head={['NGO', 'Registration', 'Contact', 'Registered', 'Status', '']} empty={!data?.items.length}>
        {data?.items.map((n) => (
          <tr key={n.id}>
            <td>
              <b>{n.name}</b>
              <div className="muted">{n.area}</div>
              <div className="muted small">{n.address}</div>
            </td>
            <td className="mono-ish">{n.registration_id}</td>
            <td>
              {n.contact_name}
              <div className="muted">{n.contact_phone}</div>
              <div className="muted small">Owner {n.owner_phone}</div>
            </td>
            <td>{fmt(n.submitted_at)}</td>
            <td>
              <Status s={n.status === 'rejected' ? 'paused' : 'active'} />
              {n.rejection_reason && <div className="muted small">{n.rejection_reason}</div>}
            </td>
            <td className="actions">
              {n.has_certificate && <button onClick={() => openCertificate(n.id).catch((e) => alert(e.message))}>View certificate</button>}
              {n.status === 'rejected' ? (
                <button className="pri" onClick={() => confirm(`Enable ${n.name} again?`) && act(() => api(`/admin/ngos/${n.id}/verify`, { method: 'POST' }), reload)}>
                  Enable
                </button>
              ) : (
                <button
                  className="danger"
                  onClick={() => {
                    const reason = ask(`Why pause ${n.name}? They will see this.`)
                    if (reason) act(() => api(`/admin/ngos/${n.id}/reject`, { body: { reason } }), reload)
                  }}
                >
                  Pause
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={data} offset={offset} setOffset={setOffset} />
    </>
  )
}

const REASONS: Record<string, string> = {
  unsafe_food: 'Unsafe or spoiled food',
  not_as_described: 'Not as described',
  no_show: 'Did not turn up',
  abusive: 'Rude or abusive',
  fake: 'Fake post or person',
  other: 'Other',
}

function Reports() {
  const [status, setStatus] = useState('open')
  const [offset, setOffset] = useState(0)
  const { data, error, reload } = useLoad(() => api<Page<AdminReport>>('/admin/reports', { query: { status, offset } }), [status, offset])
  const resolve = (r: AdminReport, action: 'dismiss' | 'remove_listing' | 'suspend_user') => {
    const note = prompt('Note for the record (optional)') ?? ''
    if (action === 'suspend_user' && !confirm(`Suspend ${r.user_name ?? 'this user'}? Their open food is removed and they are signed out.`)) return
    act(() => api(`/admin/reports/${r.id}/resolve`, { body: { action, note: note.trim() || null } }), reload)
  }
  return (
    <>
      <Header title="Reports">
        <Select value={status} onChange={(v) => (setStatus(v), setOffset(0))} options={[['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed']]} />
      </Header>
      {error && <p className="err">{error}</p>}
      <Table head={['Reported', 'Reason', 'About', 'By', '']} empty={!data?.items.length}>
        {data?.items.map((r) => (
          <tr key={r.id}>
            <td>{fmt(r.created_at)}</td>
            <td>
              <b>{REASONS[r.reason]}</b>
              {r.details && <div className="small">{r.details}</div>}
              {r.resolution_note && <div className="muted small">Resolution: {r.resolution_note}</div>}
            </td>
            <td>
              {r.listing_id && (
                <div>
                  Food post · {r.listing_area} <Status s={r.listing_status ?? 'unknown'} />
                </div>
              )}
              {r.user_name && (
                <div>
                  {r.user_name} <Status s={r.user_status ?? 'unknown'} />
                </div>
              )}
            </td>
            <td>{r.reporter_name ?? '—'}</td>
            <td className="actions">
              {r.status === 'open' ? (
                <>
                  <button onClick={() => resolve(r, 'dismiss')}>Dismiss</button>
                  {r.listing_id && <button onClick={() => resolve(r, 'remove_listing')}>Remove post</button>}
                  <button className="danger" onClick={() => resolve(r, 'suspend_user')}>
                    Suspend user
                  </button>
                </>
              ) : (
                <Status s={r.status} />
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={data} offset={offset} setOffset={setOffset} />
    </>
  )
}

function Users() {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error, reload } = useLoad(() => api<Page<AdminUser>>('/admin/users', { query: { q: term, status, offset } }), [term, status, offset])
  return (
    <>
      <Header title="Users">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setTerm(q)
            setOffset(0)
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" aria-label="Search users" />
        </form>
        <Select value={status} onChange={(v) => (setStatus(v), setOffset(0))} options={[['', 'All'], ['active', 'Active'], ['suspended', 'Suspended']]} />
      </Header>
      {error && <p className="err">{error}</p>}
      <Table head={['User', 'Joined', 'Posts', 'Reservations', 'Reports against', 'Status', '']} empty={!data?.items.length}>
        {data?.items.map((u) => (
          <tr key={u.id}>
            <td>
              <b>{u.name ?? 'No name'}</b> {u.role === 'admin' && <Status s="admin" />}
              <div className="muted">{u.phone}</div>
              {u.area && <div className="muted small">{u.area}</div>}
            </td>
            <td>{fmt(u.created_at)}</td>
            <td>{u.listings_count}</td>
            <td>{u.reservations_count}</td>
            <td>{u.reports_against}</td>
            <td>
              <Status s={u.status} />
              {u.suspended_reason && <div className="muted small">{u.suspended_reason}</div>}
            </td>
            <td className="actions">
              {u.role !== 'admin' &&
                (u.status === 'active' ? (
                  <button
                    className="danger"
                    onClick={() => {
                      const reason = ask(`Why suspend ${u.name ?? u.phone}? Kept in the audit log.`)
                      if (reason) act(() => api(`/admin/users/${u.id}/suspend`, { body: { reason } }), reload)
                    }}
                  >
                    Suspend
                  </button>
                ) : (
                  <button onClick={() => act(() => api(`/admin/users/${u.id}/unsuspend`, { method: 'POST' }), reload)}>Restore</button>
                ))}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={data} offset={offset} setOffset={setOffset} />
    </>
  )
}

function Listings() {
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error, reload } = useLoad(() => api<Page<AdminListing>>('/admin/listings', { query: { status, offset } }), [status, offset])
  return (
    <>
      <Header title="Food posts">
        <Select
          value={status}
          onChange={(v) => (setStatus(v), setOffset(0))}
          options={[['', 'All'], ['available', 'Available'], ['reserved', 'Reserved'], ['collected', 'Collected'], ['expired', 'Expired'], ['cancelled', 'Cancelled'], ['removed', 'Removed']]}
        />
      </Header>
      {error && <p className="err">{error}</p>}
      <Table head={['Posted', 'Food', 'Where', 'Donor', 'Good until', 'Reports', 'Status', '']} empty={!data?.items.length}>
        {data?.items.map((l) => (
          <tr key={l.id}>
            <td>{fmt(l.created_at)}</td>
            <td>
              {l.food_type === 'veg' ? 'Veg' : 'Non-veg'} · {l.servings} people
              <div className="muted small">{l.pickup_method === 'door' ? 'At the door' : 'With the guard'}</div>
            </td>
            <td>
              {l.area}
              <div className="muted small">{l.address}</div>
            </td>
            <td>
              {l.donor_name ?? '—'}
              <div className="muted">{l.donor_phone}</div>
            </td>
            <td>{fmt(l.good_until)}</td>
            <td>{l.reports_count || ''}</td>
            <td>
              <Status s={l.status} />
            </td>
            <td className="actions">
              {['available', 'reserved'].includes(l.status) && (
                <button
                  className="danger"
                  onClick={() => {
                    const reason = ask('Why remove this post? The donor and any collector are notified.')
                    if (reason) act(() => api(`/admin/listings/${l.id}/remove`, { body: { reason } }), reload)
                  }}
                >
                  Remove
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={data} offset={offset} setOffset={setOffset} />
    </>
  )
}

const FOR: Record<string, string> = { me: 'Themselves', family: 'Family', needy: 'People in need', animals: 'Animals' }

function Reservations({ completed }: { completed: boolean }) {
  const [status, setStatus] = useState(completed ? 'completed' : '')
  const [offset, setOffset] = useState(0)
  const effective = completed ? 'completed' : status
  const { data, error } = useLoad(() => api<Page<AdminReservation>>('/admin/reservations', { query: { status: effective, offset } }), [effective, offset])
  return (
    <>
      <Header title={completed ? 'Collections' : 'Reservations'}>
        {!completed && (
          <Select
            value={status}
            onChange={(v) => (setStatus(v), setOffset(0))}
            options={[['', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled_by_collector', 'Cancelled by collector'], ['cancelled_by_donor', 'Cancelled by donor'], ['expired', 'Expired']]}
          />
        )}
      </Header>
      {error && <p className="err">{error}</p>}
      <Table head={[completed ? 'Handed over' : 'Reserved', 'Food', 'Donor', 'Collector', 'For', 'Status']} empty={!data?.items.length}>
        {data?.items.map((r) => (
          <tr key={r.id}>
            <td>{fmt(completed ? r.completed_at : r.created_at)}</td>
            <td>
              {r.food_type === 'veg' ? 'Veg' : 'Non-veg'} · {r.servings} people
              <div className="muted small">
                {r.area} · {r.pickup_method === 'door' ? 'door code' : 'guard'}
              </div>
            </td>
            <td>
              {r.donor_name}
              <div className="muted">{r.donor_phone}</div>
            </td>
            <td>
              {r.collector_name}
              <div className="muted">{r.collector_phone}</div>
            </td>
            <td>{FOR[r.for_whom]}</td>
            <td>
              <Status s={r.status} />
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={data} offset={offset} setOffset={setOffset} />
    </>
  )
}

function AuditLog() {
  const [type, setType] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error } = useLoad(() => api<Page<Audit>>('/admin/audit', { query: { entity_type: type, offset } }), [type, offset])
  return (
    <>
      <Header title="Audit log">
        <Select
          value={type}
          onChange={(v) => (setType(v), setOffset(0))}
          options={[['', 'Everything'], ['user', 'Users'], ['listing', 'Food posts'], ['reservation', 'Reservations'], ['ngo', 'NGOs'], ['need', 'Needs'], ['pledge', 'Pledges'], ['report', 'Reports']]}
        />
      </Header>
      {error && <p className="err">{error}</p>}
      <Table head={['When', 'Action', 'Entity', 'Actor', 'Details']} empty={!data?.items.length}>
        {data?.items.map((a) => (
          <tr key={a.id}>
            <td>{fmt(a.created_at)}</td>
            <td>{a.action}</td>
            <td className="small">
              {a.entity_type} {a.entity_id?.slice(0, 8)}
            </td>
            <td className="small">{a.actor_id?.slice(0, 8) ?? 'system'}</td>
            <td className="small">{Object.keys(a.meta).length ? JSON.stringify(a.meta) : ''}</td>
          </tr>
        ))}
      </Table>
      <Pager page={data} offset={offset} setOffset={setOffset} />
    </>
  )
}
