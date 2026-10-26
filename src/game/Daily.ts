/**
 * The daily challenge: the same prison for everyone on a given date (the
 * seed comes from the date), and a goal to beat in it. Results are kept
 * with the records, one per date, the best of your tries.
 */
export interface DailyGoal {
  date: string
  seed: number
  /** Escape by the end of this day... */
  byDay: number
  /** ...with no more than this many failed attempts. */
  maxFails: number
}

export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Everything about a date's challenge comes from the date itself. */
export function dailyFor(date: string): DailyGoal {
  let h = 2166136261
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619)
  h >>>= 0
  return { date, seed: h & 0xffff, byDay: 3 + ((h >>> 16) % 4), maxFails: (h >>> 20) % 3 === 0 ? 1 : 0 }
}

export function describeDaily(d: DailyGoal): string {
  return `Escape by the end of day ${d.byDay}${d.maxFails ? ', with no more than one failed attempt' : ' without ever being caught'}.`
}

/** The goal met: out, in time, and clean enough. */
export function dailyMet(d: DailyGoal, won: boolean, day: number, fails: number): boolean {
  return won && day <= d.byDay && fails <= d.maxFails
}

export function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
