/**
 * Every ending you have found, and your best runs, kept in this browser's
 * localStorage apart from the saved game: finishing a sentence clears the
 * save, never the records.
 */
export type EndingId = 'escape' | 'jag' | 'staffDoor' | 'guardDisguise' | 'visitorDisguise' | 'laundry' | 'solitary' | 'gang'

export const ENDINGS: { id: EndingId; title: string; won: boolean; hint: string }[] = [
  { id: 'escape', title: 'Free', won: true, hint: 'Somebody waiting on the road, and a way over or through the wall.' },
  { id: 'jag', title: "The Governor's Jag", won: true, hint: 'The Governor keeps more than paperwork in his office.' },
  { id: 'staffDoor', title: 'Off shift early', won: true, hint: 'Officers have uniforms and keys. Officers also like sausage rolls.' },
  { id: 'guardDisguise', title: 'Clocked off', won: true, hint: 'Staff go home at shift change. Do you look like staff?' },
  { id: 'visitorDisguise', title: 'Gone with the visitors', won: true, hint: "The Reverend's panto box, and an afternoon with the visitors." },
  { id: 'laundry', title: 'Spin cycle', won: true, hint: 'Everything in the laundry leaves on a van, past an X-ray man with a sweet tooth.' },
  { id: 'solitary', title: 'Segregation. Indefinitely.', won: false, hint: 'Use up every attempt.' },
  { id: 'gang', title: 'A firm got you', won: false, hint: 'Make a firm hate you, then run out of road.' },
]

export interface Run {
  name: string
  /** Real seconds played. */
  seconds: number
  /** Failed attempts along the way. */
  fails: number
  day: number
  hard: boolean
}

export interface EndingRecord {
  first: string
  count: number
  /** Each best on its own: the fastest run, the cleanest, the earliest. */
  fastest: Run
  fewestFails: Run
  earliest: Run
}

export interface Records {
  version: 1
  endings: Partial<Record<EndingId, EndingRecord>>
  started: number
  finished: number
  wins: number
  losses: number
  attempts: number
  days: number
  seconds: number
}

const KEY = 'locked-up.records'

const empty = (): Records => ({ version: 1, endings: {}, started: 0, finished: 0, wins: 0, losses: 0, attempts: 0, days: 0, seconds: 0 })

export function readRecords(): Records {
  try {
    const raw = localStorage.getItem(KEY)
    const r = raw ? (JSON.parse(raw) as Records) : null
    return r && r.version === 1 ? { ...empty(), ...r } : empty()
  } catch {
    return empty()
  }
}

function write(r: Records): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
  } catch {
    // Private browsing: records live only as long as the page.
  }
}

/** A new sentence begun. */
export function noteStarted(): void {
  const r = readRecords()
  r.started++
  write(r)
}

/** A sentence over: file it, and say whether this ending is a new find. */
export function recordEnding(id: EndingId, run: Run): { isNew: boolean; found: number; best: boolean } {
  const r = readRecords()
  const def = ENDINGS.find((e) => e.id === id)!
  r.finished++
  if (def.won) r.wins++
  else r.losses++
  r.attempts += run.fails
  r.days += run.day
  r.seconds += run.seconds
  const had = r.endings[id]
  let best = false
  if (!had) r.endings[id] = { first: new Date().toISOString(), count: 1, fastest: run, fewestFails: run, earliest: run }
  else {
    had.count++
    if (run.seconds < had.fastest.seconds) (had.fastest = run), (best = true)
    if (run.fails < had.fewestFails.fails) (had.fewestFails = run), (best = true)
    if (run.day < had.earliest.day) (had.earliest = run), (best = true)
  }
  write(r)
  return { isNew: !had, found: Object.keys(r.endings).length, best }
}

/** "12m 05s", "1h 03m". */
export function duration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(ss).padStart(2, '0')}s`
}
