// Small, dependency-free formatting for Indian users (12-hour clock, "14 Oct").

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];

export function time12(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  let h = x.getHours();
  const m = x.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
}

/** "12:30:00" -> "12:30 pm" */
export function clock(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return time12(d);
}

/** Parse a YYYY-MM-DD date as a local calendar day. */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayMonth(iso: string): [string, string] {
  const d = localDate(iso);
  return [`${d.getDate()} ${MONTHS[d.getMonth()]}`, `${d.getDate()} ${MONTHS_HI[d.getMonth()]}`];
}

export function weekdayDay(iso: string): [string, string] {
  const d = localDate(iso);
  return [`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`, `${DAYS_HI[d.getDay()]} ${d.getDate()}`];
}

export function ago(isoTs: string): [string, string] {
  const s = Math.max(0, (Date.now() - new Date(isoTs).getTime()) / 1000);
  if (s < 3600) {
    const m = Math.max(1, Math.round(s / 60));
    return [`${m} min ago`, `${m} मिनट पहले`];
  }
  if (s < 86400) {
    const h = Math.round(s / 3600);
    return [`${h} hour${h > 1 ? 's' : ''} ago`, `${h} घंटे पहले`];
  }
  const days = Math.round(s / 86400);
  if (days < 7) return [`${days} day${days > 1 ? 's' : ''} ago`, `${days} दिन पहले`];
  const w = Math.round(days / 7);
  if (days < 31) return [`${w} week${w > 1 ? 's' : ''} ago`, `${w} हफ़्ते पहले`];
  return dayMonth(isoTs.slice(0, 10));
}

export function minutesUntil(isoTs: string): number {
  return Math.round((new Date(isoTs).getTime() - Date.now()) / 60000);
}

export function km(d: number | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  return `${d.toFixed(1)} km`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'A';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? 'Anndaan member';
}

/** "+919811042345" -> "+91 98110 42345" */
export function prettyPhone(p: string): string {
  const m = p.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}
